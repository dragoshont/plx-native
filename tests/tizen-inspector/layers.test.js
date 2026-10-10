'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fake, image } = require('./fake');
const { drawableLayers, layerCapture } = require('../../tools/tizen/inspector/layers');

function layer(id = 'PRIVATE', width = 1920) {
    return { layerId: id, width, height: 1080, offsetX: 0, offsetY: 0, drawsContent: true,
        private: 'PRIVATE', transform: [1, 0, 0, 0] };
}

test('only numeric layer geometry survives; reject malformed/resource-heavy trees', () => {
    const result = drawableLayers([layer(), { drawsContent: false }]);
    assert.equal(result[0].hasTransform, true);
    assert.equal(result[0].private, undefined);
    for (const value of [undefined, Array(101).fill(layer()), [layer('', 1)], [layer('id', 4097)],
        [{ ...layer(), offsetX: Infinity }], [null]]) {
        assert.throws(() => drawableLayers(value));
    }
});

test('real renderer replay bytes saved as separate layers, never composited or video claim', async t => {
    const server = await fake((request, reply, socket) => {
        if (request.method === 'LayerTree.enable') {
            socket.send(JSON.stringify({ method: 'LayerTree.layerTreeDidChange', params: { layers: [layer()] } }));
            reply();
        } else if (request.method === 'LayerTree.makeSnapshot') reply({ snapshotId: 'PRIVATE' });
        else if (request.method === 'LayerTree.replaySnapshot') reply({ dataURL: 'data:image/png;base64,' + image() });
        else reply();
    });
    t.after(() => server.close());
    const client = await server.connect();
    t.after(() => client.close());
    const result = await layerCapture(client, 100);
    assert.equal(result.receipt.kind, 'on-device-renderer-paint-replay-not-panel');
    assert.equal(result.receipt.composition, 'separate-layers-not-a-composited-screenshot');
    assert.deepEqual(result.frames[0].image, Buffer.from(image(), 'base64'));
    assert.equal(JSON.stringify(result.receipt).includes('PRIVATE'), false);
    assert.equal(JSON.stringify(result.frames[0].layer).includes('PRIVATE'), false);
    assert.deepEqual(server.requests.map(request => request.method), [
        'LayerTree.enable', 'LayerTree.makeSnapshot', 'LayerTree.replaySnapshot',
        'LayerTree.releaseSnapshot', 'LayerTree.disable'
    ]);
    assert.equal(client.listenerCount('notification'), 0);
});

test('timeouts, malformed images and cleanup errors disable layer domain and reject success', async () => {
    for (const mode of ['tree-timeout', 'make-timeout', 'bad-image', 'release-error', 'disable-error']) {
        const server = await fake((request, reply, socket) => {
            if (request.method === 'LayerTree.enable') {
                if (mode !== 'tree-timeout') socket.send(JSON.stringify({
                    method: 'LayerTree.layerTreeDidChange', params: { layers: [layer()] } }));
                reply();
            } else if (request.method === 'LayerTree.makeSnapshot') {
                if (mode !== 'make-timeout') reply({ snapshotId: 'PRIVATE' });
            } else if (request.method === 'LayerTree.replaySnapshot') {
                reply({ dataURL: mode === 'bad-image' ? 'PRIVATE' : 'data:image/png;base64,' + image() });
            } else if ((mode === 'release-error' && request.method === 'LayerTree.releaseSnapshot') ||
                (mode === 'disable-error' && request.method === 'LayerTree.disable')) {
                socket.send(JSON.stringify({ id: request.id, error: { code: -32000, message: 'PRIVATE' } }));
            } else reply();
        });
        const client = await server.connect(30);
        await assert.rejects(layerCapture(client, 30));
        assert.equal(server.requests.at(-1).method, 'LayerTree.disable');
        assert.equal(client.listenerCount('notification'), 0);
        assert.equal(client.pending.size, 0);
        client.close();
        await server.close();
    }
});

test('capture work stops at eight layers with explicit truncation', async t => {
    const server = await fake((request, reply, socket) => {
        if (request.method === 'LayerTree.enable') {
            socket.send(JSON.stringify({ method: 'LayerTree.layerTreeDidChange',
                params: { layers: Array.from({ length: 10 }, (_, i) => layer(String(i))) } }));
            reply();
        } else if (request.method === 'LayerTree.makeSnapshot') reply({ snapshotId: 'snapshot' });
        else if (request.method === 'LayerTree.replaySnapshot') reply({ dataURL: 'data:image/png;base64,' + image() });
        else reply();
    });
    t.after(() => server.close());
    const client = await server.connect();
    t.after(() => client.close());
    const result = await layerCapture(client, 100);
    assert.equal(result.frames.length, 8);
    assert.equal(result.receipt.truncated, true);
    assert.equal(result.receipt.drawableLayers, 10);
});

test('end-to-end layer command requires pixel consent, saves private manifest, releases lease', async t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { run, options } = require('../../tools/tizen/inspector');
    const { acquireLock } = require('../../tools/tizen/inspector/lifecycle');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plx-layer-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true }));
    const target = path.join(directory, 'layers');
    const lock = path.join(directory, 'lock');
    const server = await fake((request, reply, socket) => {
        if (request.method === 'LayerTree.enable') {
            socket.send(JSON.stringify({ method: 'LayerTree.layerTreeDidChange', params: { layers: [layer()] } }));
            reply();
        } else if (request.method === 'LayerTree.makeSnapshot') reply({ snapshotId: 'PRIVATE' });
        else if (request.method === 'LayerTree.replaySnapshot') reply({ dataURL: 'data:image/png;base64,' + image() });
        else reply();
    });
    t.after(() => server.close());
    const args = ['layers', '--endpoint', server.endpoint, '--output', target];
    assert.throws(() => options(args), /private_pixel_consent_required/);
    const result = await run(options([...args, '--allow-private-pixels']), () => acquireLock(lock));
    assert.equal(result.status, 'captured');
    assert.equal(fs.existsSync(lock), false);
    const manifest = fs.readFileSync(path.join(target, 'manifest.json'), 'utf8');
    assert.equal(manifest.includes('PRIVATE'), false);
    assert.equal(JSON.parse(manifest).timing, 'sequential-paint-replays-not-video');
    assert.equal(fs.statSync(path.join(target, 'frame-0001.png')).mode & 0o777, 0o600);
    assert.equal(fs.statSync(target).mode & 0o777, 0o700);
});
