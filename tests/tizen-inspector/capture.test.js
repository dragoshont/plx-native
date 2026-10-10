'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fake, image } = require('./fake');
const { png, MAX_PNG, screenshot, screencast } = require('../../tools/tizen/inspector/capture');

test('PNG byte/dimension bounds and structural checks', () => {
    assert.equal(png(image()).width, 1);
    assert.throws(() => png(image(4097, 1)), /png_dimensions_exceeded/);
    for (const invalid of [undefined, '', 'AAAA', image().slice(0, -4), 'A'.repeat(Math.ceil(MAX_PNG / 3) * 4 + 4)]) {
        assert.throws(() => png(invalid), /invalid_or_oversized_png/);
    }
    const corrupt = Buffer.from(image(), 'base64');
    corrupt[20] ^= 1;
    assert.throws(() => png(corrupt.toString('base64')), /invalid_or_oversized_png/);
    assert.throws(() => png(Buffer.concat([Buffer.from(image(), 'base64'), Buffer.from([1])]).toString('base64')),
        /invalid_or_oversized_png/);
});

test('screenshot is genuine protocol bytes, old command has no modern options', async t => {
    const server = await fake((request, reply) => reply({ data: image() }));
    t.after(() => server.close());
    const client = await server.connect();
    t.after(() => client.close());
    const result = await screenshot(client);
    assert.equal(result.receipt.status, 'captured');
    assert.deepEqual(result.image, Buffer.from(image(), 'base64'));
    assert.deepEqual(server.requests[0], { id: 1, method: 'Page.captureScreenshot', params: {} });
});

test('recognized unanswered screenshot yields unavailable timeout, never captured or unsupported', async t => {
    const server = await fake(() => {});
    t.after(() => server.close());
    const client = await server.connect(30);
    t.after(() => client.close());
    const result = await screenshot(client);
    assert.deepEqual(result, { receipt: { status: 'unavailable', reason: 'rpc_timeout' } });
    assert.equal(client.pending.size, 0);
});

test('unsupported method and oversized screenshot produce honest receipts', async () => {
    for (const [handler, expected] of [
        [(request, reply, socket) => socket.send(JSON.stringify({ id: request.id,
            error: { code: -32601, message: 'PRIVATE' } })),
        { status: 'unsupported', reason: 'protocol_error', protocolCode: -32601 }],
        [(request, reply) => reply({ data: image(5000) }),
        { status: 'unavailable', reason: 'png_dimensions_exceeded' }]
    ]) {
        const server = await fake(handler);
        const client = await server.connect();
        assert.deepEqual((await screenshot(client)).receipt, expected);
        client.close();
        await server.close();
    }
});

test('false legacy canScreencast stops without starting a stream', async t => {
    const server = await fake((request, reply) => reply({ result: false }));
    t.after(() => server.close());
    const client = await server.connect();
    t.after(() => client.close());
    const result = await screencast(client, 100, 2);
    assert.equal(result.receipt.status, 'unsupported');
    assert.deepEqual(result.frames, []);
    assert.deepEqual(server.requests.map(request => request.method), ['Page.canScreencast']);
});

test('old frameNumber and modern sessionId acknowledgements, bounded frame count and cleanup', async () => {
    for (const key of ['frameNumber', 'sessionId']) {
        const server = await fake((request, reply, socket) => {
            if (request.method === 'Page.canScreencast') reply({ result: true });
            else {
                reply();
                if (request.method === 'Page.startScreencast') {
                    socket.send(JSON.stringify({ method: 'Page.screencastFrame',
                        params: { [key]: 7, data: image(), metadata: { private: 'PRIVATE' } } }));
                }
            }
        });
        const client = await server.connect();
        const result = await screencast(client, 100, 1);
        assert.equal(result.receipt.status, 'captured');
        assert.equal(result.frames.length, 1);
        assert.equal(result.receipt.cleanup, 'stopped');
        assert.deepEqual(server.requests.find(request => request.method === 'Page.screencastFrameAck').params, { [key]: 7 });
        assert.equal(server.requests.at(-1).method, 'Page.stopScreencast');
        client.close();
        await server.close();
    }
});

test('no frames and timed-out start always attempt bounded stop', async () => {
    for (const timeoutStart of [false, true]) {
        const server = await fake((request, reply) => {
            if (request.method === 'Page.canScreencast') reply({ result: true });
            else if (!timeoutStart || request.method !== 'Page.startScreencast') reply();
        });
        const client = await server.connect(30);
        const result = await screencast(client, 100, 1);
        assert.equal(result.receipt.status, 'unavailable');
        assert.equal(result.receipt.reason, timeoutStart ? 'rpc_timeout' : 'no_frames_before_deadline');
        assert.equal(result.receipt.cleanup, 'stopped');
        assert.equal(server.requests.at(-1).method, 'Page.stopScreencast');
        assert.equal(client.listenerCount('notification'), 0);
        client.close();
        await server.close();
    }
});

test('bad frames, ack failure and stop failure do not produce success-shaped output', async () => {
    for (const mode of ['bad-frame', 'ack-error', 'stop-error']) {
        const server = await fake((request, reply, socket) => {
            if (request.method === 'Page.canScreencast') reply({ result: true });
            else if ((mode === 'ack-error' && request.method === 'Page.screencastFrameAck') ||
                (mode === 'stop-error' && request.method === 'Page.stopScreencast')) {
                socket.send(JSON.stringify({ id: request.id, error: { code: -32000, message: 'PRIVATE' } }));
            } else {
                reply();
                if (request.method === 'Page.startScreencast') socket.send(JSON.stringify({
                    method: 'Page.screencastFrame', params: { frameNumber: 1,
                        data: mode === 'bad-frame' ? 'bad' : image() }
                }));
            }
        });
        const client = await server.connect();
        const result = await screencast(client, 100, 1);
        assert.equal(result.receipt.status, 'unavailable');
        assert.deepEqual(result.frames, []);
        assert.equal(client.listenerCount('notification'), 0);
        client.close();
        await server.close();
    }
});

test('recording limits reject invalid inputs before sending a command', async () => {
    for (const [duration, count] of [[0, 1], [30001, 1], [100, 0], [100, 121], [100, 1.5]]) {
        await assert.rejects(screencast({}, duration, count), { code: 'invalid_recording_limit' });
    }
});

test('recording rejects the exact total-byte ceiling and confirms stream cleanup', async t => {
    const data = image(1, 1, 400000);
    let number = 0;
    const server = await fake((request, reply, socket) => {
        if (request.method === 'Page.canScreencast') reply({ result: true });
        else {
            reply();
            if (request.method === 'Page.startScreencast' || request.method === 'Page.screencastFrameAck') {
                socket.send(JSON.stringify({ method: 'Page.screencastFrame',
                    params: { frameNumber: ++number, data } }));
            }
        }
    });
    t.after(() => server.close());
    const client = await server.connect(1000);
    t.after(() => client.close());
    const result = await screencast(client, 10000, 120);
    assert.equal(result.receipt.reason, 'recording_bytes_exceeded');
    assert.equal(result.receipt.cleanup, 'stopped');
    assert.equal(result.frames.length, 0);
    assert.equal(server.requests.at(-1).method, 'Page.stopScreencast');
});
