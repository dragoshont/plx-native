'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { Workbench } = require('../../tools/tizen/inspector/workbench');
const { LiveView } = require('../../tools/tizen/inspector/live');
const { options } = require('../../tools/tizen/inspector.js');

function get(url, { host, method = 'GET' } = {}) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const request = http.request({ host: target.hostname, port: target.port, path: target.pathname + target.search,
            method, headers: host ? { host } : {} }, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
                body: Buffer.concat(chunks).toString() }));
        });
        request.on('error', reject);
        request.end();
    });
}

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plx-bench-'));
    const app = path.join(root, 'app');
    fs.mkdirSync(path.join(app, 'js'), { recursive: true });
    fs.writeFileSync(path.join(app, 'index.html'), '<p>app</p>');
    fs.writeFileSync(path.join(app, 'js', 'main.js'), 'x');
    fs.writeFileSync(path.join(app, '.secret'), 'no');
    fs.writeFileSync(path.join(root, 'outside.txt'), 'no');
    return { root, app, lock: path.join(root, 'lock') };
}

test('workbench serves the page, the preview app and state behind the token', async () => {
    const f = fixture();
    const bench = new Workbench({ appDir: f.app, lockPath: f.lock });
    const url = await bench.start();
    try {
        const page = await get(url);
        assert.equal(page.status, 200);
        assert.match(page.body, /Desktop preview/);
        assert.match(page.body, /Not connected/);
        assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
        assert.match(page.headers['content-security-policy'], /script-src 'nonce-/);
        assert.equal(page.headers['x-frame-options'], 'DENY');
        assert.doesNotMatch(page.body, /#0969da|#4aa3ff/i);

        const app = await get(url + 'app/');
        assert.equal(app.body, '<p>app</p>');
        assert.match(app.headers['content-type'], /text\/html/);
        assert.match(app.headers['content-security-policy'], /frame-ancestors 'self'/);
        assert.match((await get(url + 'app/js/main.js')).headers['content-type'], /javascript/);

        assert.deepEqual(JSON.parse((await get(url + 'state')).body), { live: false, lock: 'free' });
        fs.mkdirSync(f.lock);
        assert.equal(JSON.parse((await get(url + 'state')).body).lock, 'held');
    } finally { await bench.close(); }
});

test('workbench refuses wrong tokens, hosts, methods and paths outside the app', async () => {
    const f = fixture();
    const bench = new Workbench({ appDir: f.app, lockPath: f.lock });
    const url = await bench.start();
    try {
        assert.equal((await get(`${bench.origin}/${'0'.repeat(48)}/`)).status, 404);
        assert.equal((await get(url, { host: 'evil.example' })).status, 421);
        assert.equal((await get(url, { method: 'POST' })).status, 405);
        assert.equal((await get(url + 'app/..%2Foutside.txt')).status, 404);
        assert.equal((await get(url + 'app/%2e%2e/outside.txt')).status, 404);
        assert.equal((await get(url + 'app/.secret')).status, 404);
        assert.equal((await get(url + 'app/missing.js')).status, 404);
        assert.equal((await get(url + 'other')).status, 404);
    } finally { await bench.close(); }
});

test('a live workbench frames only its viewer, and the viewer admits only the workbench', async () => {
    const f = fixture();
    const bench = new Workbench({ appDir: f.app, lockPath: f.lock });
    const url = await bench.start();
    const viewer = new LiveView({ rpc: async () => ({}) }, { durationMs: 1000, intervalMs: 500, waitMs: 10,
        frameAncestor: bench.origin });
    viewer.loop = () => new Promise(() => {});
    const view = await viewer.start();
    bench.live = view;
    try {
        const page = await get(url);
        assert.match(page.body, new RegExp(`src="${view}"`));
        assert.match(page.headers['content-security-policy'], new RegExp(`frame-src 'self' ${viewer.origin}`));
        const live = await get(view);
        assert.equal(live.headers['x-frame-options'], undefined);
        assert.match(live.headers['content-security-policy'], new RegExp(`frame-ancestors ${bench.origin}$`));
        assert.doesNotMatch(live.body, /#4aa3ff|#7a1f1f/i);
    } finally { await viewer.close(); await bench.close(); }
});

test('a plain live view still refuses every frame ancestor', async () => {
    const viewer = new LiveView({ rpc: async () => ({}) }, { durationMs: 1000, intervalMs: 500, waitMs: 10 });
    viewer.loop = () => new Promise(() => {});
    const view = await viewer.start();
    try {
        const live = await get(view);
        assert.equal(live.headers['x-frame-options'], 'DENY');
        assert.match(live.headers['content-security-policy'], /frame-ancestors 'none'/);
    } finally { await viewer.close(); }
    assert.throws(() => new LiveView({}, { durationMs: 1000, intervalMs: 500, waitMs: 10, frameAncestor: 'https://evil.example' }),
        /invalid_live_option/);
});

test('workbench options: preview needs nothing, live needs consent, live flags need an endpoint', () => {
    assert.deepEqual(options(['workbench']), { command: 'workbench', port: 0, endpoint: undefined });
    assert.equal(options(['workbench', '--port', '8765']).port, 8765);
    assert.throws(() => options(['workbench', '--port', '80']), /invalid_option/);
    assert.throws(() => options(['workbench', '--interactive']), /inapplicable_option/);
    assert.throws(() => options(['workbench', '--allow-private-pixels']), /inapplicable_option/);
    assert.throws(() => options(['workbench', '--endpoint', 'http://127.0.0.1:9/']), /private_pixel_consent_required/);
    assert.throws(() => options(['live', '--endpoint', 'http://127.0.0.1:9/', '--allow-private-pixels', '--port', '8765']),
        /inapplicable_option/);
    const live = options(['workbench', '--endpoint', 'http://127.0.0.1:9/', '--allow-private-pixels', '--interactive']);
    assert.equal(live.interactive, true);
    assert.equal(live.durationMs, 300000);
});
