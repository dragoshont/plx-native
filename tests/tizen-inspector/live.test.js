'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { fake, image } = require('./fake');
const { LiveView, LABEL } = require('../../tools/tizen/inspector/live');

function layer(offsetX = 3) {
    return { layerId: 'PRIVATE', width: 1920, height: 1080, offsetX, offsetY: 4, drawsContent: true, title: 'PRIVATE' };
}

function server(mode = 'changing') {
    let replays = 0;
    return fake((request, reply, socket) => {
        if (request.method === 'LayerTree.enable') {
            if (mode !== 'disconnect' || replays === 0) {
                socket.send(JSON.stringify({ method: 'LayerTree.layerTreeDidChange', params: { layers: [layer(mode === 'moving' ? 3 + replays : 3)] } }));
            }
            reply();
        } else if (request.method === 'LayerTree.makeSnapshot') {
            if (mode === 'make-error') {
                socket.send(JSON.stringify({ id: request.id, error: { code: -32000, message: 'PRIVATE' } }));
            } else reply({ snapshotId: 'PRIVATE' });
        } else if (request.method === 'LayerTree.replaySnapshot') {
            replays++;
            reply({ dataURL: 'data:image/png;base64,' + image(1, 1, mode === 'changing' ? replays : 0) });
            if (mode === 'disconnect') socket.terminate();
        } else if (mode === 'release-error' && request.method === 'LayerTree.releaseSnapshot') {
            socket.send(JSON.stringify({ id: request.id, error: { code: -32000, message: 'PRIVATE' } }));
        } else reply();
    });
}

function get(url, options = {}) {
    return new Promise((resolve, reject) => {
        const request = http.request(url, options, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
                body: Buffer.concat(chunks) }));
        });
        request.on('error', reject);
        request.end();
    });
}

async function until(predicate, limitMs = 5000) {
    const end = Date.now() + limitMs;
    while (!predicate()) {
        if (Date.now() > end) throw new Error('condition not reached');
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

test('live view serves only fresh in-memory replays on a tokenised loopback URL', async t => {
    const device = await server('changing');
    t.after(() => device.close());
    const client = await device.connect(200);
    t.after(() => client.close());
    const viewer = new LiveView(client, { durationMs: 60000, intervalMs: 500, waitMs: 100 });
    const url = await viewer.start();
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{48}\/$/);
    await until(() => viewer.state.sequence >= 2);
    const state = JSON.parse((await get(url + 'state')).body);
    assert.equal(state.label, LABEL);
    assert.equal(state.kind, 'live-on-device-renderer-paint-replay-not-panel');
    assert.equal(state.layers[0].offsetX, 3);
    assert.equal(state.layers[0].changed, true);
    assert.equal(state.changedCycles, state.cycles);
    assert.equal(JSON.stringify(state).includes('PRIVATE'), false);

    const current = viewer.state.sequence;
    const frame = await get(url + 'frame/' + current + '/0.png');
    assert.equal(frame.status, 200);
    assert.equal(frame.headers['content-type'], 'image/png');
    assert.equal(frame.headers['cache-control'], 'no-store');
    assert.deepEqual(frame.body, viewer.frames[0].image);
    assert.equal((await get(url + 'frame/' + (current - 1) + '/0.png')).status, 410);
    assert.equal((await get(url + 'frame/' + current + '/9.png')).status, 410);

    const html = await get(url);
    assert.match(html.headers['content-security-policy'], /default-src 'none'.*script-src 'nonce-/);
    assert.equal(html.headers['x-frame-options'], 'DENY');
    assert.equal(html.body.toString().includes('PRIVATE'), false);

    const origin = url.slice(0, url.indexOf('/', 7));
    assert.equal((await get(origin + '/' + 'f'.repeat(48) + '/state')).status, 404);
    assert.equal((await get(origin + '/')).status, 404);
    assert.equal((await get(url + 'state', { headers: { host: 'attacker.example' } })).status, 421);
    assert.equal((await get(url + 'state', { method: 'POST' })).status, 405);

    viewer.stop('interrupted');
    const receipt = await viewer.done;
    assert.equal(receipt.status, 'ended');
    assert.equal(receipt.reason, 'interrupted');
    assert.equal(receipt.storage, 'memory-only-discarded');
    assert.equal(receipt.composition, 'separate-layers-not-a-composited-screenshot');
    assert.equal(viewer.frames.length, 0);
    assert.equal(device.requests.at(-1).method, 'LayerTree.disable');
    assert.equal(client.listenerCount('notification'), 0);
    await assert.rejects(get(url + 'state'));
});

test('a static screen is reported unchanged rather than presented as motion', async t => {
    const device = await server('static');
    t.after(() => device.close());
    const client = await device.connect(200);
    t.after(() => client.close());
    const viewer = new LiveView(client, { durationMs: 60000, intervalMs: 500, waitMs: 100 });
    await viewer.start();
    await until(() => viewer.state.sequence >= 2);
    assert.equal(viewer.state.layers[0].changed, false);
    viewer.stop('interrupted');
    const receipt = await viewer.done;
    assert.equal(receipt.changedCycles, 1);
    assert.ok(receipt.cycles >= 2);
});

test('a layer that moves without repainting is reported changed', async t => {
    const device = await server('moving');
    t.after(() => device.close());
    const client = await device.connect(200);
    t.after(() => client.close());
    const viewer = new LiveView(client, { durationMs: 60000, intervalMs: 500, waitMs: 100 });
    await viewer.start();
    await until(() => viewer.state.sequence >= 2);
    assert.equal(viewer.state.layers[0].changed, true);
    assert.equal(viewer.state.layers[0].pixelsChanged, false);
    viewer.stop('interrupted');
    const receipt = await viewer.done;
    assert.equal(receipt.changedCycles, receipt.cycles);
});

test('the session ends by itself at its duration bound', async t => {
    const device = await server('changing');
    t.after(() => device.close());
    const client = await device.connect(200);
    t.after(() => client.close());
    const viewer = new LiveView(client, { durationMs: 1000, intervalMs: 500, waitMs: 100 });
    const began = Date.now();
    await viewer.start();
    const receipt = await viewer.done;
    assert.equal(receipt.reason, 'duration_elapsed');
    assert.ok(Date.now() - began < 3000);
    assert.ok(receipt.cycles >= 1 && receipt.cycles <= 3);
});

test('repeated capture errors, cleanup errors and disconnects stop without retrying forever', async t => {
    // A disconnect mid-capture also prevents snapshot release, so it is reported as a cleanup failure.
    for (const [mode, reason, maxFailures] of [['make-error', 'protocol_error', 3],
        ['release-error', 'layer_capture_cleanup_failed', 1], ['disconnect', 'layer_capture_cleanup_failed', 1]]) {
        const device = await server(mode);
        t.after(() => device.close());
        const client = await device.connect(200);
        t.after(() => client.close());
        const viewer = new LiveView(client, { durationMs: 60000, intervalMs: 500, waitMs: 100 });
        const url = await viewer.start();
        const receipt = await viewer.done;
        assert.equal(receipt.reason, reason, mode);
        assert.ok(receipt.failures <= maxFailures, mode);
        assert.equal(JSON.stringify(receipt).includes('PRIVATE'), false);
        await assert.rejects(get(url + 'state'));
    }
});

test('live options require pixel consent, keep pixels off disk and bound refresh/duration', () => {
    const { options } = require('../../tools/tizen/inspector');
    const base = ['live', '--endpoint', 'http://127.0.0.1:1'];
    assert.throws(() => options(base), /private_pixel_consent_required/);
    const config = options([...base, '--allow-private-pixels']);
    assert.equal(config.durationMs, 300000);
    assert.equal(config.intervalMs, 10000);
    assert.equal(config.output, undefined);
    for (const extra of [['--output', '/tmp/x'], ['--max-frames', '2'], ['--interval-ms', '499'], ['--interval-ms', '60001'],
        ['--duration-ms', '1800001']]) {
        assert.throws(() => options([...base, '--allow-private-pixels', ...extra]));
    }
    assert.throws(() => options(['layers', '--endpoint', 'http://127.0.0.1:1', '--allow-private-pixels',
        '--output', '/tmp/x', '--interval-ms', '1000']), /inapplicable_option/);
});

test('end-to-end live command announces the URL, ends cleanly and releases the lease', async t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { run, options } = require('../../tools/tizen/inspector');
    const { acquireLock } = require('../../tools/tizen/inspector/lifecycle');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plx-live-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true }));
    const lock = path.join(directory, 'lock');
    const device = await server('changing');
    t.after(() => device.close());
    let view;
    const result = await run(options(['live', '--endpoint', device.endpoint, '--allow-private-pixels',
        '--duration-ms', '1000', '--interval-ms', '500']), () => acquireLock(lock), url => { view = url; });
    assert.match(view, /^http:\/\/127\.0\.0\.1:/);
    assert.equal(result.status, 'ended');
    assert.equal(result.reason, 'duration_elapsed');
    assert.equal(result.version.chromium, '47.0.2526.69');
    assert.equal(fs.existsSync(lock), false);
    assert.equal(fs.readdirSync(directory).length, 0);
});
