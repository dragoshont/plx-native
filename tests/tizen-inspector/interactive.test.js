'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const vm = require('node:vm');
const { fake, image } = require('./fake');
const { LiveView, QUEUE_LIMIT, BODY_LIMIT } = require('../../tools/tizen/inspector/live');
const { STATE } = require('../../tools/tizen/inspector/nav');
const { keyCommand, createSender } = require('../../tools/tizen/inspector/remote');

const browse = (label = 'Movies', extra = {}) => ({ screen: 'screen screen-home', menu: false, player: false,
    continueAction: 'unset', active: { kind: 'button', label, nav: true, row: 'other',
        box: { x: 0, y: 0, width: 1, height: 1 }, ...extra } });
const card = deck => ({ screen: 'screen screen-home', menu: false, player: false, continueAction: 'play',
    active: { kind: 'card', label: 'PRIVATE', cardType: 'movie', ratingKey: '42', deck, nav: false, row: 'shelf',
        box: { x: 0, y: 0, width: 1, height: 1 } } });

// A fake old-engine target that answers LayerTree captures, the fixed focus read and key dispatch.
function device({ focus = () => browse(), replayDelayMs = 0, dispatchDelayMs = 0 } = {}) {
    let replays = 0;
    const log = [];
    const server = fake((request, reply, socket) => {
        log.push({ method: request.method, at: Date.now() });
        if (request.method === 'LayerTree.enable') {
            socket.send(JSON.stringify({ method: 'LayerTree.layerTreeDidChange', params: { layers: [
                { layerId: 'PRIVATE', width: 1920, height: 1080, offsetX: 0, offsetY: 0, drawsContent: true }] } }));
            reply();
        } else if (request.method === 'LayerTree.makeSnapshot') reply({ snapshotId: 'PRIVATE' });
        else if (request.method === 'LayerTree.replaySnapshot') {
            replays++;
            setTimeout(() => reply({ dataURL: 'data:image/png;base64,' + image(1, 1, 0) }), replayDelayMs);
        } else if (request.method === 'Runtime.evaluate') {
            assert.equal(request.params.expression, STATE);
            reply({ result: { type: 'object', value: focus() } });
        } else if (request.method === 'Input.dispatchKeyEvent') setTimeout(() => reply({}), dispatchDelayMs);
        else reply();
    });
    return server.then(value => Object.assign(value, { log, replays: () => replays }));
}

function send(url, { method = 'POST', body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const request = http.request(url, { method, headers }, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                const text = Buffer.concat(chunks).toString();
                resolve({ status: response.statusCode, headers: response.headers, text,
                    json: /json/.test(response.headers['content-type'] || '') ? JSON.parse(text) : null });
            });
        });
        request.on('error', reject);
        request.end(body);
    });
}

async function until(predicate, limitMs = 5000) {
    const end = Date.now() + limitMs;
    while (!predicate()) {
        if (Date.now() > end) throw new Error('condition not reached');
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

async function viewer(t, options = {}, deviceOptions = {}) {
    const target = await device(deviceOptions);
    t.after(() => target.close());
    const client = await target.connect(500);
    t.after(() => client.close());
    const view = new LiveView(client, { durationMs: 60000, intervalMs: 10000, waitMs: 100, interactive: true, ...options });
    const url = await view.start();
    t.after(() => { view.stop('interrupted'); return view.done; });
    const origin = url.slice(0, url.indexOf('/', 7));
    const headers = { 'Content-Type': 'application/json', Origin: origin, 'X-Plx-Viewer': view.nonce };
    const post = (route, body, extra = {}) => send(url + route, { body: JSON.stringify(body), headers: { ...headers, ...extra } });
    await until(() => view.state.sequence >= 1);
    return { view, url, origin, headers, post, target };
}

function keyEvent(surface, key, extra = {}) {
    return { target: surface, key, keyCode: 0, repeat: false, isComposing: false, altKey: false, ctrlKey: false,
        metaKey: false, shiftKey: false, ...extra };
}

test('shortcuts map only on the focused remote surface and never on editing targets', () => {
    const surface = { isContentEditable: false };
    for (const [key, name] of [['ArrowUp', 'up'], ['ArrowDown', 'down'], ['ArrowLeft', 'left'], ['ArrowRight', 'right'],
        ['Enter', 'ok'], [' ', 'ok'], ['Spacebar', 'ok'], ['Backspace', 'back']]) {
        assert.deepEqual(keyCommand(keyEvent(surface, key), surface), { key: name, send: true }, key);
    }
    for (const target of [{ tagName: 'INPUT' }, { tagName: 'SELECT' }, { tagName: 'TEXTAREA' },
        { isContentEditable: true }, { tagName: 'BUTTON' }]) {
        assert.equal(keyCommand(keyEvent(target, 'Backspace'), surface), null);
    }
    assert.equal(keyCommand(keyEvent(surface, 'Enter'), { isContentEditable: true }), null);
    for (const extra of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true },
        { keyCode: 229 }]) {
        assert.equal(keyCommand(keyEvent(surface, 'ArrowUp', extra), surface), null, JSON.stringify(extra));
    }
    for (const key of ['Process', 'Dead', 'a', 'Escape', 'Tab', 'Delete']) assert.equal(keyCommand(keyEvent(surface, key), surface), null);
    assert.deepEqual(keyCommand(keyEvent(surface, 'ArrowDown', { repeat: true }), surface), { key: 'down', send: false });
});

test('the page sender allows one command in flight and reports drops and failures', async () => {
    const reports = [];
    let resolve;
    const posts = [];
    const sender = createSender((key, extra) => { posts.push([key, extra]); return new Promise(done => { resolve = done; }); },
        result => reports.push(result));
    assert.equal(sender.send('ok', { ratingKey: '42' }), true);
    assert.equal(sender.send('ok'), false);
    assert.equal(sender.busy(), true);
    await new Promise(setImmediate);
    assert.deepEqual(posts, [['ok', { ratingKey: '42' }]]);
    resolve({ status: 'pressed', rttMs: 5 });
    await new Promise(setImmediate);
    assert.deepEqual(reports.map(report => report.status), ['pending', 'dropped', 'pressed']);
    assert.equal(reports[1].reason, 'command_in_flight');
    assert.equal(typeof reports[2].clientRttMs, 'number');
    const failing = createSender(() => Promise.reject(new Error('x')), result => reports.push(result));
    failing.send('up');
    await new Promise(setImmediate);
    assert.equal(reports.at(-1).reason, 'viewer_unreachable');
    assert.equal(failing.busy(), false);
});

test('the served page embeds the same tested remote code and binds keys to the surface only', async t => {
    const { url, view } = await viewer(t);
    const html = (await send(url, { method: 'GET' })).text;
    assert.ok(html.includes(keyCommand.toString()));
    assert.ok(html.includes(createSender.toString()));
    assert.ok(html.includes(JSON.stringify(view.nonce)));
    assert.match(html, /id="surface" tabindex="0" role="application"/);
    assert.match(html, /surface\.addEventListener\('keydown'/);
    assert.doesNotMatch(html, /document\.addEventListener\('keydown'|window\.addEventListener\('keydown'/);
    // The page script parses; the embedded functions are complete.
    const script = html.slice(html.indexOf('<script'), html.indexOf('</script>')).replace(/^<script[^>]*>/, '');
    assert.doesNotThrow(() => new vm.Script(script));
    // Unchanged pixels reuse images but still refresh captions (a layer can move without repainting).
    assert.match(script, /if \(reuse\) \{[^}]*querySelectorAll\('figcaption'\)/);
});

test('POST requires interactive mode, exact origin, CSRF header, JSON type and a bounded body', async t => {
    const { url, origin, headers, post, view } = await viewer(t);
    assert.equal((await post('key', { key: 'down' }, { Origin: 'http://evil.example' })).status, 403);
    assert.equal((await post('key', { key: 'down' }, { 'X-Plx-Viewer': 'wrong' })).status, 403);
    const noCsrf = { ...headers };
    delete noCsrf['X-Plx-Viewer'];
    assert.equal((await send(url + 'key', { body: '{"key":"down"}', headers: noCsrf })).status, 403);
    assert.equal((await post('key', { key: 'down' }, { 'Content-Type': 'text/plain' })).status, 403);
    assert.equal((await post('key', { key: 'down' }, { Host: 'attacker.example' })).status, 421);
    assert.equal((await send(url + 'key', { body: 'x'.repeat(BODY_LIMIT + 1), headers })).status, 413);
    assert.equal((await send(url + 'key', { body: '{', headers })).status, 400);
    for (const body of [{ key: 'menu' }, { key: 'down', ratingKey: '42' }, { key: 'ok', ratingKey: '4x' }, { key: 'ok', saveSignIn: true },
        [], { key: 'down', extra: 1 }]) {
        assert.equal((await post('key', body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await post('eval', { key: 'down' })).status, 405);
    assert.equal((await send(url + 'key', { method: 'PUT', body: '{}', headers })).status, 405);
    assert.equal(view.state.input.pressed, 0);
    assert.equal(origin, view.origin);

    const target = await device();
    t.after(() => target.close());
    const client = await target.connect(500);
    t.after(() => client.close());
    const readOnly = new LiveView(client, { durationMs: 60000, intervalMs: 10000, waitMs: 100 });
    const readOnlyUrl = await readOnly.start();
    t.after(() => { readOnly.stop('interrupted'); return readOnly.done; });
    const readOnlyHeaders = { ...headers, Origin: readOnly.origin, 'X-Plx-Viewer': readOnly.nonce };
    assert.equal((await send(readOnlyUrl + 'key', { body: '{"key":"down"}', headers: readOnlyHeaders })).status, 405);
    assert.match((await send(readOnlyUrl, { method: 'GET' })).text, /input disabled \(view only\)/);
    assert.equal(target.log.some(entry => entry.method === 'Input.dispatchKeyEvent'), false);
});

test('a key is dispatched promptly, reports RTT apart from capture time, and pulls the next capture forward', async t => {
    const { view, post, target } = await viewer(t, { intervalMs: 60000 });
    const before = view.state.sequence;
    const reply = await post('key', { key: 'down' });
    assert.equal(reply.status, 200);
    assert.deepEqual(Object.keys(reply.json).sort(), ['id', 'key', 'queuedMs', 'reason', 'rttMs', 'status']);
    assert.equal(reply.json.status, 'pressed');
    assert.ok(reply.json.rttMs < 2000);
    assert.equal(target.log.filter(entry => entry.method === 'Input.dispatchKeyEvent').length, 2);
    // The scheduled capture is a minute away; the press brings one forward instead.
    await until(() => view.state.sequence > before, 3000);
    assert.equal(view.state.input.pressed, 1);
    assert.equal(view.state.input.last.status, 'pressed');
    assert.equal(JSON.stringify(view.state).includes('PRIVATE'), false);
});

test('a key waits only for the capture already in flight, never for the next scheduled one', async t => {
    const { view, post, target } = await viewer(t, { intervalMs: 60000 }, { replayDelayMs: 300 });
    await post('refresh', {});
    await until(() => target.log.filter(entry => entry.method === 'LayerTree.replaySnapshot').length >= 2);
    const reply = await post('key', { key: 'left' });
    assert.equal(reply.json.status, 'pressed');
    assert.ok(reply.json.queuedMs > 0 && reply.json.queuedMs < 1500, String(reply.json.queuedMs));
    // CDP stays serialised: no dispatch lands between a capture's makeSnapshot and its release.
    let open = 0;
    for (const entry of target.log) {
        if (entry.method === 'LayerTree.makeSnapshot') open++;
        if (entry.method === 'LayerTree.releaseSnapshot') open--;
        if (entry.method === 'Input.dispatchKeyEvent') assert.equal(open, 0);
    }
    assert.ok(view.state.sequence >= 2);
});

test('commands beyond the bounded queue are refused immediately, not queued', async t => {
    const { view, post } = await viewer(t, {}, { dispatchDelayMs: 300 });
    const replies = await Promise.all(Array.from({ length: QUEUE_LIMIT + 3 }, () => post('key', { key: 'right' })));
    const statuses = replies.map(reply => reply.status);
    assert.equal(statuses.filter(status => status === 200).length, QUEUE_LIMIT);
    assert.equal(statuses.filter(status => status === 429).length, 3);
    for (const reply of replies.filter(item => item.status === 429)) assert.equal(reply.json.reason, 'queue_full');
    assert.equal(view.state.input.pending, 0);
    assert.equal(view.state.input.rejected, 3);
});

test('OK keeps the fresh-state guard: refused controls are not dispatched and cards need the current rating key', async t => {
    let focus = card(true);
    const { view, post, target } = await viewer(t, {}, { focus: () => focus });
    await until(() => view.state.focus);
    assert.deepEqual(view.state.focus.okRefusal, 'deck_card_may_play');
    assert.equal(view.state.focus.ratingKey, '42');
    assert.equal(JSON.stringify(view.state.focus).includes('PRIVATE'), false);
    let reply = await post('key', { key: 'ok', ratingKey: '42' });
    assert.deepEqual([reply.json.status, reply.json.reason], ['refused', 'deck_card_may_play']);
    focus = card(false);
    reply = await post('key', { key: 'ok' });
    assert.deepEqual([reply.json.status, reply.json.reason], ['refused', 'card_requires_rating_key']);
    reply = await post('key', { key: 'ok', ratingKey: '41' });
    assert.equal(reply.json.reason, 'rating_key_mismatch');
    focus = browse('Play', { nav: false });
    reply = await post('key', { key: 'ok' });
    assert.equal(reply.json.reason, 'denied_label');
    focus = { ...browse(), player: true };
    reply = await post('key', { key: 'back' });
    assert.equal(reply.json.reason, 'player_active');
    assert.equal(target.log.some(entry => entry.method === 'Input.dispatchKeyEvent'), false);
    assert.equal(view.state.input.refused, 5);
    focus = card(false);
    reply = await post('key', { key: 'ok', ratingKey: '42' });
    assert.equal(reply.json.status, 'pressed');
});

test('refresh coalesces, pause stops scheduled work but still honours a manual refresh, and STALE inputs are explicit', async t => {
    const { view, post } = await viewer(t, { intervalMs: 500 });
    assert.equal((await post('pause', { paused: true })).json.status, 'paused');
    assert.equal(view.state.paused, true);
    await new Promise(resolve => setTimeout(resolve, 700));
    const paused = view.state.sequence;
    await new Promise(resolve => setTimeout(resolve, 1200));
    assert.equal(view.state.sequence, paused);
    const refreshes = await Promise.all([post('refresh', {}), post('refresh', {}), post('refresh', {})]);
    assert.deepEqual(refreshes.map(reply => reply.status), [202, 202, 202]);
    // A refresh arriving while a capture is already running earns one follow-up, never one each.
    await until(() => view.state.sequence >= paused + 1);
    await new Promise(resolve => setTimeout(resolve, 1500));
    const settled = view.state.sequence;
    assert.ok(settled <= paused + 2, String(settled - paused));
    await new Promise(resolve => setTimeout(resolve, 1000));
    assert.equal(view.state.sequence, settled);
    assert.equal((await post('pause', { paused: 'no' })).status, 400);
    assert.equal((await post('refresh', { paused: true })).status, 400);
    assert.equal((await post('pause', { paused: false })).json.status, 'resumed');
    await until(() => view.state.sequence > settled);
    view.stop('interrupted');
    const receipt = await view.done;
    assert.deepEqual(Object.keys(receipt.input).sort(), ['enabled', 'errors', 'pressed', 'refused', 'rejected']);
    assert.equal(view.state.state, 'ended');
});

test('ended viewers refuse commands and disconnects end the session with the last state preserved', async t => {
    const { view, post } = await viewer(t);
    const sequence = view.state.sequence;
    view.stop('interrupted');
    // The server closes with the session; a request racing the close is rejected, never dispatched.
    const result = await post('key', { key: 'up' }).catch(error => ({ status: error.code }));
    assert.ok([409, 'ECONNREFUSED', 'ECONNRESET'].includes(result.status), String(result.status));
    await view.done;
    assert.equal(view.state.sequence, sequence);
    assert.equal(view.state.endReason, 'interrupted');
    assert.equal(view.state.input.pressed, 0);
    const [status] = await view.post('key', { key: 'up' });
    assert.equal(status, 409);
});

test('metadata is operator-supplied or unknown, validated, never inferred; provenance names the real TV', async t => {
    const { view } = await viewer(t, { tv: { model: 'UE55MU6172', year: '2017', os: 'Tizen 3.0', firmware: '1410.1' } });
    assert.deepEqual(view.state.tvMetadata, { model: 'UE55MU6172', year: '2017', os: 'Tizen 3.0', firmware: '1410.1',
        provenance: 'operator-supplied-not-observed' });
    assert.deepEqual(view.state.provenance, { source: 'actual-tv-web-inspector', emulator: false,
        kind: 'live-on-device-renderer-paint-replay-not-panel', timing: 'discrete-paint-replays-not-video',
        composition: 'separate-layers-not-panel' });
    assert.match(view.state.input.click, /^unsupported/);
    assert.match(view.state.input.transport, /fidelity unverified/);
    const target = await device();
    t.after(() => target.close());
    const client = await target.connect(500);
    t.after(() => client.close());
    assert.deepEqual(new LiveView(client, { durationMs: 1000, intervalMs: 10000, waitMs: 100 }).state.tvMetadata,
        { provenance: 'unknown' });
    for (const tv of [{ model: '<b>' }, { year: 2017 }, { firmware: 'x'.repeat(41) }]) {
        assert.throws(() => new LiveView(client, { durationMs: 1000, intervalMs: 10000, waitMs: 100, tv }), /invalid_live_option/);
    }
    const { options } = require('../../tools/tizen/inspector');
    const base = ['live', '--endpoint', 'http://127.0.0.1:1', '--allow-private-pixels'];
    const config = options([...base, '--interactive', '--tv-model', 'UE55MU6172', '--tv-os', 'Tizen 3.0']);
    assert.equal(config.interactive, true);
    assert.equal(config.intervalMs, 10000);
    assert.deepEqual(config.tv, { model: 'UE55MU6172', os: 'Tizen 3.0' });
    assert.throws(() => options([...base, '--tv-year', '20<17']), /invalid_option/);
    assert.throws(() => options(['state', '--endpoint', 'http://127.0.0.1:1', '--interactive']), /inapplicable_option/);
    assert.throws(() => options(['state', '--endpoint', 'http://127.0.0.1:1', '--tv-model', 'x']), /inapplicable_option/);
});
