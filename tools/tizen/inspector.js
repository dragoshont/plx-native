#!/usr/bin/env node
'use strict';

const { Client, InspectorError, localEndpoint, discover, selectTarget } = require('./inspector/client');
const { geometry } = require('./inspector/geometry');
const { screenshot, screencastCapability, screencast } = require('./inspector/capture');
const { acquireLock, outputPath, saveScreenshot, saveFrames } = require('./inspector/lifecycle');

const HELP = `Samsung Web Inspector (Node >=22)
  node tools/tizen/inspector.js targets|probe|geometry --endpoint http://127.0.0.1:PORT
  node tools/tizen/inspector.js screenshot --endpoint http://127.0.0.1:PORT --allow-private-pixels --output /private/path/image.png
  node tools/tizen/inspector.js screencast --endpoint http://127.0.0.1:PORT --allow-private-pixels --output /private/path/frames --duration-ms 10000 --max-frames 120
Options: --target-index N (required for multiple pages), --timeout-ms 15000 (100..15000).
Read-only fixed probes; no arbitrary evaluation, keys, navigation or app launch.
Capture output is PRIVATE and is never a DOM reconstruction. See docs/samsung-web-inspector.md.
`;

function integer(value, min, max) {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new InspectorError('invalid_option');
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < min || result > max) throw new InspectorError('invalid_option');
    return result;
}

function options(args) {
    const command = args[0];
    if (!['targets', 'probe', 'geometry', 'screenshot', 'screencast'].includes(command)) {
        throw new InspectorError('invalid_command');
    }
    const values = {};
    for (let i = 1; i < args.length; i++) {
        const name = args[i];
        if (Object.hasOwn(values, name)) throw new InspectorError('duplicate_option');
        if (name === '--allow-private-pixels') { values[name] = true; continue; }
        if (!['--endpoint', '--target-index', '--timeout-ms', '--output', '--duration-ms', '--max-frames'].includes(name) ||
            i + 1 >= args.length || args[i + 1].startsWith('--')) throw new InspectorError('invalid_option');
        values[name] = args[++i];
    }
    const pixel = command === 'screenshot' || command === 'screencast';
    if (pixel && (!values['--allow-private-pixels'] || !values['--output'])) {
        throw new InspectorError('private_pixel_consent_required');
    }
    if ((!pixel && (values['--output'] || values['--allow-private-pixels'])) ||
        (command !== 'screencast' && (values['--duration-ms'] || values['--max-frames']))) {
        throw new InspectorError('inapplicable_option');
    }
    return {
        command, endpoint: localEndpoint(values['--endpoint']),
        timeoutMs: integer(values['--timeout-ms'] || '15000', 100, 15000),
        targetIndex: values['--target-index'] === undefined ? undefined : integer(values['--target-index'], 0, 99),
        output: pixel ? outputPath(values['--output'], command === 'screencast') : undefined,
        durationMs: integer(values['--duration-ms'] || '10000', 100, 30000),
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

async function run(config, lock = acquireLock) {
    const release = lock();
    let client;
    let interrupted = false;
    const interrupt = () => { interrupted = true; if (client) client.close(); };
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
        }
        if (interrupted) throw new InspectorError('interrupted');
        return result;
    } catch (error) {
        if (interrupted) throw new InspectorError('interrupted');
        throw error;
    } finally {
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
        if (['unsupported', 'unavailable'].includes(result.status)) process.exitCode = 2;
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
