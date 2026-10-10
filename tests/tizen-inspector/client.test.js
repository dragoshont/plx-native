'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fake } = require('./fake');
const { localEndpoint, discover, selectTarget, jsonRequest } = require('../../tools/tizen/inspector/client');

test('localhost-only discovery, explicit target selection and no compression negotiation', async t => {
    const server = await fake((request, reply) => reply({ result: false }));
    t.after(() => server.close());
    const endpoint = localEndpoint(server.endpoint);
    const discovery = await discover(endpoint, 100);
    const client = await server.connect();
    t.after(() => client.close());
    assert.equal(selectTarget(endpoint, discovery.targets).protocol, 'ws:');
    assert.deepEqual(await client.rpc('Page.canScreencast'), { result: false });
    assert.equal(server.headers[0]['sec-websocket-extensions'], undefined);
    assert.throws(() => selectTarget(endpoint, discovery.targets.concat(discovery.targets)), /target_selection_required/);
    assert.throws(() => selectTarget(endpoint, discovery.targets, 2), /invalid_target/);
    assert.throws(() => selectTarget(endpoint, discovery.targets, -1), /invalid_target/);
    assert.throws(() => selectTarget(endpoint, [{ type: 'worker' }], 0), /invalid_target/);
    for (const url of [
        'http://localhost:1234', 'http://192.0.2.1:1234', 'https://127.0.0.1:1234',
        'http://secret@127.0.0.1:1234', 'http://127.0.0.1:1234/?token=secret',
        'http://127.0.0.1:1234/json', 'http://127.0.0.1'
    ]) assert.throws(() => localEndpoint(url), /invalid_endpoint/);
    for (const url of [
        'ws://192.0.2.1:1234/devtools/page/1', 'ws://127.0.0.1:1/devtools/page/1',
        server.endpoint.replace('http:', 'ws:') + '/devtools/page/1?token=secret',
        server.endpoint.replace('http:', 'ws:') + '/different'
    ]) assert.throws(() => selectTarget(endpoint, [{ type: 'page', webSocketDebuggerUrl: url }]), /invalid_target_url/);
});

test('RPC deadline removes pending state and ignores a late old-engine reply', async t => {
    let late;
    const server = await fake((request, reply) => {
        if (request.method === 'late') late = reply;
        else reply({ ok: true });
    });
    t.after(() => server.close());
    const client = await server.connect(30);
    t.after(() => client.close());
    await assert.rejects(client.rpc('late'), { code: 'rpc_timeout', method: 'late' });
    assert.equal(client.pending.size, 0);
    late({ private: 'PRIVATE' });
    assert.deepEqual(await client.rpc('later'), { ok: true });
    client.close();
    await assert.rejects(client.rpc('afterClose'), { code: 'websocket_closed' });
});

test('protocol error never includes arbitrary peer message or data', async t => {
    const server = await fake((request, reply, socket) => socket.send(JSON.stringify({
        id: request.id, error: { code: -32601, message: 'PRIVATE', data: 'PRIVATE' }
    })));
    t.after(() => server.close());
    const client = await server.connect();
    t.after(() => client.close());
    await assert.rejects(client.rpc('Page.canScreencast'), error => {
        assert.equal(error.protocolCode, -32601);
        assert.equal(JSON.stringify(error).includes('PRIVATE'), false);
        return true;
    });
});

test('malformed message and disconnect reject all pending requests', async t => {
    for (const action of [
        socket => socket.send('{broken'),
        socket => socket.send('null'),
        socket => socket.send(JSON.stringify({ id: 'PRIVATE' })),
        socket => socket.terminate()
    ]) {
        const server = await fake((request, reply, socket) => action(socket));
        const client = await server.connect();
        const outcomes = await Promise.allSettled([client.rpc('one'), client.rpc('two')]);
        assert.ok(outcomes.every(outcome => outcome.status === 'rejected'));
        assert.equal(client.pending.size, 0);
        client.close();
        await server.close();
    }
});

test('discovery rejects HTTP errors, malformed JSON, oversized replies and absolute timeout', async () => {
    for (const [handler, code] of [
        [(request, response) => { response.writeHead(302, { Location: 'http://192.0.2.1' }); response.end(); }, 'discovery_http_error'],
        [(request, response) => response.end('PRIVATE-not-json'), 'discovery_invalid_json'],
        [(request, response) => response.end('x'.repeat(300000)), 'discovery_too_large'],
        [(request, response) => response.write(' '), 'discovery_timeout']
    ]) {
        const server = await fake(() => {}, handler);
        await assert.rejects(jsonRequest(localEndpoint(server.endpoint), '/json/list', 30), { code });
        await server.close();
    }
});

test('invalid response result and missing discovery shape are explicit', async t => {
    const server = await fake((request, reply, socket) => socket.send(JSON.stringify({ id: request.id })));
    t.after(() => server.close());
    const client = await server.connect();
    t.after(() => client.close());
    await assert.rejects(client.rpc('missing'), { code: 'invalid_protocol_result' });
    const bad = await fake(() => {}, (request, response) => response.end('[]'));
    t.after(() => bad.close());
    // A version array is not a valid version object.
    await assert.rejects(discover(localEndpoint(bad.endpoint), 100), { code: 'discovery_invalid_shape' });
});

test('WebSocket payload ceiling disconnects without parsing or retaining oversized data', async t => {
    const server = await fake((request, reply, socket) => socket.send('x'.repeat(12 * 1024 * 1024 + 1)));
    t.after(() => server.close());
    const client = await server.connect(1000);
    t.after(() => client.close());
    await assert.rejects(client.rpc('oversized'), { code: 'websocket_error' });
    assert.equal(client.pending.size, 0);
    assert.equal(client.closed, true);
});

test('connection handshake has a deadline even when the peer never upgrades', async t => {
    const http = require('node:http');
    const { Client } = require('../../tools/tizen/inspector/client');
    const sockets = new Set();
    const server = http.createServer();
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
    server.on('upgrade', () => {});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        for (const socket of sockets) socket.destroy();
        await new Promise(resolve => server.close(resolve));
    });
    await assert.rejects(Client.connect('ws://127.0.0.1:' + server.address().port + '/devtools/page/1', 30),
        error => ['connect_timeout', 'connect_failed'].includes(error.code));
});
