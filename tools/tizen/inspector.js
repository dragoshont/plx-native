#!/usr/bin/env node
'use strict';

const { Client, InspectorError, localEndpoint, discover, selectTarget } = require('./inspector/client');
const { geometry } = require('./inspector/geometry');
const { screenshot, screencastCapability, screencast } = require('./inspector/capture');
const { LOCK, acquireLock, outputPath, saveScreenshot, saveFrames } = require('./inspector/lifecycle');
const { layerCapture } = require('./inspector/layers');
const { LiveView } = require('./inspector/live');
const { Workbench } = require('./inspector/workbench');
const { KEYS, readState, press } = require('./inspector/nav');

const HELP = `Samsung Web Inspector (Node >=22)
  node tools/tizen/inspector.js targets|probe|geometry --endpoint http://127.0.0.1:PORT
  node tools/tizen/inspector.js screenshot --endpoint http://127.0.0.1:PORT --allow-private-pixels --output /private/path/image.png
  node tools/tizen/inspector.js screencast --endpoint http://127.0.0.1:PORT --allow-private-pixels --output /private/path/frames --duration-ms 10000 --max-frames 120
  node tools/tizen/inspector.js layers --endpoint http://127.0.0.1:PORT --allow-private-pixels --output /private/path/layers
  node tools/tizen/inspector.js live --endpoint http://127.0.0.1:PORT --allow-private-pixels [--duration-ms 300000] [--interval-ms 10000]
      [--interactive] [--tv-model M] [--tv-year Y] [--tv-os V] [--tv-firmware F]
    (serves fresh separate layers from memory on a tokenised 127.0.0.1 URL printed to stderr; Ctrl-C stops;
     --interactive adds guarded on-page remote keys through the same checks as the key command;
     --tv-* values are shown as operator-supplied, never as observed)
  node tools/tizen/inspector.js workbench [--port N] [--endpoint http://127.0.0.1:PORT --allow-private-pixels [live options]]
    (one local web page, any browser: the desktop preview of samsung/PlexTv beside the TV's live layers;
     without --endpoint it is preview only, contacts no TV and takes no lock; Ctrl-C stops)
  node tools/tizen/inspector.js state --endpoint http://127.0.0.1:PORT
  node tools/tizen/inspector.js key --endpoint http://127.0.0.1:PORT --key up|down|left|right|back|ok [--rating-key N]
    (ok is refused unless the focused control is browse-only; a card needs its observed --rating-key)
  node tools/tizen/inspector.js key --endpoint http://127.0.0.1:PORT --key ok --save-sign-in
    (only on Settings' exact "Stay signed in on this TV: Off" control: saves the owner's sign-in locally)
Options: --target-index N (required for multiple pages), --timeout-ms 15000 (100..15000).
Fixed probes only; no arbitrary evaluation or app launch. Keys only through the guarded key command.
Capture output is PRIVATE and is never a DOM reconstruction. See docs/samsung-web-inspector.md.
`;

const TV_FIELDS = ['model', 'year', 'os', 'firmware'];

function integer(value, min, max) {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new InspectorError('invalid_option');
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < min || result > max) throw new InspectorError('invalid_option');
    return result;
}

function options(args) {
    const command = args[0];
    if (!['targets', 'probe', 'geometry', 'screenshot', 'screencast', 'layers', 'live', 'state', 'key', 'workbench'].includes(command)) {
        throw new InspectorError('invalid_command');
    }
    const values = {};
    for (let i = 1; i < args.length; i++) {
        const name = args[i];
        if (Object.hasOwn(values, name)) throw new InspectorError('duplicate_option');
        if (['--allow-private-pixels', '--save-sign-in', '--interactive'].includes(name)) { values[name] = true; continue; }
        if (!['--endpoint', '--port', '--target-index', '--timeout-ms', '--output', '--duration-ms', '--max-frames', '--interval-ms', '--key', '--rating-key',
            '--tv-model', '--tv-year', '--tv-os', '--tv-firmware'].includes(name) ||
            i + 1 >= args.length || args[i + 1].startsWith('--')) throw new InspectorError('invalid_option');
        values[name] = args[++i];
    }
    const bench = command === 'workbench';
    if (bench) {
        if (values['--port'] !== undefined) integer(values['--port'], 1024, 65535);
        if (values['--endpoint'] === undefined) {
            if (Object.keys(values).some(name => name !== '--port')) throw new InspectorError('inapplicable_option');
            return { command, port: values['--port'] === undefined ? 0 : Number(values['--port']), endpoint: undefined };
        }
    } else if (values['--port'] !== undefined) throw new InspectorError('inapplicable_option');
    // A workbench with an endpoint is a live view embedded beside the preview, under the same rules.
    const liveLike = command === 'live' || bench;
    const pixel = ['screenshot', 'screencast', 'layers'].includes(command) || liveLike;
    const saves = pixel && !liveLike;
    if (pixel && (!values['--allow-private-pixels'] || (saves && !values['--output']))) {
        throw new InspectorError('private_pixel_consent_required');
    }
    if ((!pixel && values['--allow-private-pixels']) || (!saves && values['--output']) ||
        (command !== 'screencast' && !liveLike && values['--duration-ms']) ||
        (command !== 'screencast' && values['--max-frames']) ||
        (!liveLike && (values['--interval-ms'] || values['--interactive'] ||
            TV_FIELDS.some(field => values[`--tv-${field}`] !== undefined))) ||
        (command !== 'key' && (values['--key'] || values['--rating-key'] || values['--save-sign-in'])) ||
        (values['--save-sign-in'] && (values['--key'] !== 'ok' || values['--rating-key']))) {
        throw new InspectorError('inapplicable_option');
    }
    if (command === 'key' && !Object.hasOwn(KEYS, values['--key'] || '')) throw new InspectorError('invalid_key');
    if (TV_FIELDS.some(field => values[`--tv-${field}`] !== undefined &&
        !/^[A-Za-z0-9 ._-]{1,40}$/.test(values[`--tv-${field}`]))) throw new InspectorError('invalid_option');
    if (values['--rating-key'] !== undefined && !/^\d{1,12}$/.test(values['--rating-key'])) throw new InspectorError('invalid_option');
    const live = liveLike;
    return {
        port: bench && values['--port'] !== undefined ? Number(values['--port']) : 0,
        key: values['--key'], ratingKey: values['--rating-key'], saveSignIn: values['--save-sign-in'] === true,
        command, endpoint: localEndpoint(values['--endpoint']),
        timeoutMs: integer(values['--timeout-ms'] || '15000', 100, 15000),
        targetIndex: values['--target-index'] === undefined ? undefined : integer(values['--target-index'], 0, 99),
        output: saves ? outputPath(values['--output'], command !== 'screenshot') : undefined,
        durationMs: live ? integer(values['--duration-ms'] || '300000', 1000, 1800000) :
            integer(values['--duration-ms'] || '10000', 100, 30000),
        intervalMs: integer(values['--interval-ms'] || '10000', 500, 60000),
        interactive: values['--interactive'] === true,
        tv: live ? Object.fromEntries(TV_FIELDS.filter(field => values[`--tv-${field}`] !== undefined)
            .map(field => [field, values[`--tv-${field}`]])) : undefined,
        maxFrames: integer(values['--max-frames'] || '120', 1, 120)
    };
}

function versionSummary(value) {
    const browser = typeof value.Browser === 'string' ?
        value.Browser.match(/\b(?:Chrome|Chromium)\/(\d{1,6}(?:\.\d{1,6}){0,3})\b/) : null;
    const protocol = value['Protocol-Version'];
    return { chromium: browser ? browser[1] : 'unreported',
        protocol: typeof protocol === 'string' && /^\d+\.\d+$/.test(protocol) ? protocol : 'unreported' };
}

async function workbenchOnly(config, ready) {
    const bench = new Workbench({ port: config.port, lockPath: LOCK });
    ready(await bench.start());
    await new Promise(resolve => {
        const stop = () => resolve();
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
    });
    await bench.close();
    return { status: 'ended', kind: 'workbench', live: false, reason: 'interrupted' };
}

async function run(config, lock = acquireLock, ready = view => process.stderr.write(JSON.stringify(
    { status: 'live', view, note: 'private local URL; do not share' }) + '\n')) {
    if (config.command === 'workbench' && !config.endpoint) return workbenchOnly(config, ready);
    const release = lock();
    let bench;
    let client;
    let viewer;
    let interrupted = false;
    const interrupt = () => {
        // A live view ends cleanly: the in-flight capture still releases its snapshots and disables LayerTree.
        if (viewer) { viewer.stop('interrupted'); return; }
        interrupted = true;
        if (client) client.close();
    };
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', interrupt);
    let result;
    try {
        const discovery = await discover(config.endpoint, config.timeoutMs);
        if (interrupted) throw new InspectorError('interrupted');
        const version = versionSummary(discovery.version);
        if (config.command === 'targets') {
            result = { status: 'discovered', version, targets: discovery.targets.map((target, index) =>
                ({ index, kind: target && target.type === 'page' ? 'page' : 'other' })) };
        } else {
            const url = selectTarget(config.endpoint, discovery.targets, config.targetIndex);
            client = await Client.connect(url, config.timeoutMs);
            if (interrupted) throw new InspectorError('interrupted');
            await client.rpc('Page.enable');
            if (config.command === 'state') result = { status: 'inspected', version, state: await readState(client) };
            if (config.command === 'key') result = { ...await press(client, config.key, { ratingKey: config.ratingKey, saveSignIn: config.saveSignIn }), version };
            if (config.command === 'geometry') result = { status: 'inspected', version, geometry: await geometry(client) };
            if (config.command === 'probe') result = { status: 'inspected', version,
                geometry: await geometry(client), screencast: await screencastCapability(client),
                screenshot: { status: 'not_attempted', reason: 'explicit_private_pixel_command_required' } };
            if (config.command === 'screenshot') {
                const capture = await screenshot(client);
                result = { ...capture.receipt, version };
                if (capture.image) saveScreenshot(config.output, capture.image);
            }
            if (config.command === 'screencast') {
                const capture = await screencast(client, config.durationMs, config.maxFrames);
                result = { ...capture.receipt, version };
                if (capture.frames.length) saveFrames(config.output, capture);
            }
            if (config.command === 'layers') {
                const capture = await layerCapture(client, Math.min(config.timeoutMs, 1000));
                result = { ...capture.receipt, version };
                saveFrames(config.output, capture);
            }
            if (config.command === 'live' || config.command === 'workbench') {
                let frameAncestor;
                if (config.command === 'workbench') {
                    bench = new Workbench({ port: config.port, lockPath: LOCK });
                    await bench.start();
                    frameAncestor = bench.origin;
                }
                viewer = new LiveView(client, { durationMs: config.durationMs, intervalMs: config.intervalMs,
                    waitMs: Math.min(config.timeoutMs, 1000), interactive: config.interactive, tv: config.tv, frameAncestor });
                const view = await viewer.start();
                if (bench) bench.live = view;
                ready(bench ? `${bench.origin}/${bench.token}/` : view);
                result = { ...await viewer.done, version };
            }
        }
        if (interrupted) throw new InspectorError('interrupted');
        return result;
    } catch (error) {
        if (interrupted) throw new InspectorError('interrupted');
        throw error;
    } finally {
        if (viewer) await viewer.close();
        if (bench) await bench.close();
        if (client) client.close();
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', interrupt);
        release();
    }
}

async function main(args) {
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) { process.stdout.write(HELP); return; }
    try {
        const result = await run(options(args));
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        if (['unsupported', 'unavailable', 'refused'].includes(result.status)) process.exitCode = 2;
    } catch (error) {
        const result = { status: 'error', reason: error instanceof InspectorError ? error.code : 'internal_error' };
        if (error instanceof InspectorError && error.method) result.method = error.method;
        if (error instanceof InspectorError && error.protocolCode !== undefined) result.protocolCode = error.protocolCode;
        process.stderr.write(JSON.stringify(result) + '\n');
        process.exitCode = 1;
    }
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { options, versionSummary, run, main };
