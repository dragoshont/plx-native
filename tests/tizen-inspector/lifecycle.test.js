'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { fake, image } = require('./fake');
const { options, versionSummary, run } = require('../../tools/tizen/inspector');
const { EXPRESSION, geometry, sanitizeGeometry } = require('../../tools/tizen/inspector/geometry');
const { acquireLock, outputPath, saveScreenshot, saveFrames } = require('../../tools/tizen/inspector/lifecycle');

function temporary(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plx-inspector-test-'));
    t.after(() => fs.rmSync(directory, { recursive: true }));
    return directory;
}

function geometryFixture() {
    const node = {
        tagName: 'INPUT', textContent: 'PRIVATE', value: 'PRIVATE', id: 'PRIVATE',
        scrollWidth: 300, clientWidth: 100, scrollHeight: 20, clientHeight: 20,
        getBoundingClientRect: () => ({ left: 1, top: 2, width: 100, height: 20, right: 101, bottom: 22 })
    };
    return vm.runInNewContext(EXPRESSION, {
        document: { getElementsByTagName: () => [node], activeElement: node },
        window: { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
            getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1',
                fontSize: '20px', lineHeight: 'normal', backgroundImage: 'PRIVATE' }) }
    });
}

test('fixed old-engine geometry expression collects useful numeric layout but no text or attributes', () => {
    const result = sanitizeGeometry(geometryFixture());
    assert.equal(result.kind, 'dom-css-geometry-not-pixels');
    assert.equal(result.entries[0].focused, true);
    assert.equal(result.entries[0].scrollOverflow, true);
    assert.equal(result.entries[0].fontSize, 20);
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    const poisoned = JSON.parse(JSON.stringify(geometryFixture()));
    poisoned.private = 'PRIVATE';
    poisoned.entries[0].private = 'PRIVATE';
    assert.equal(JSON.stringify(sanitizeGeometry(poisoned)).includes('PRIVATE'), false);
    poisoned.entries[0].tag = 'PRIVATE';
    assert.throws(() => sanitizeGeometry(poisoned), /invalid_geometry/);
    const invalid = JSON.parse(JSON.stringify(geometryFixture()));
    invalid.viewport.width = Infinity;
    assert.throws(() => sanitizeGeometry(invalid), /invalid_geometry/);
});

test('legacy thrown evaluation and missing values are explicit, do not expose exception details', async () => {
    for (const reply of [{ wasThrown: true, result: { description: 'PRIVATE' } },
        { exceptionDetails: { text: 'PRIVATE' } }, { result: { type: 'undefined' } }]) {
        await assert.rejects(geometry({ rpc: async () => reply }), { code: 'geometry_evaluation_failed' });
    }
});

test('lock is exclusive and released only by its matching owner', t => {
    const directory = temporary(t);
    const lock = path.join(directory, 'lock');
    const release = acquireLock(lock);
    assert.throws(() => acquireLock(lock), /device_lock_held/);
    const owner = path.join(lock, 'owner.json');
    const original = fs.readFileSync(owner, 'utf8');
    fs.writeFileSync(owner, '{"token":"replacement"}');
    assert.throws(release, /device_lock_cleanup_failed/);
    assert.equal(fs.existsSync(lock), true);
    fs.writeFileSync(owner, original);
    release();
    assert.equal(fs.existsSync(lock), false);
});

test('pixel files stay outside repository, no overwrite, private permissions and symlink-parent checks', t => {
    const directory = temporary(t);
    const target = outputPath(path.join(directory, 'image.png'));
    saveScreenshot(target, Buffer.from(image(), 'base64'));
    assert.equal(fs.statSync(target).mode & 0o777, 0o600);
    assert.throws(() => outputPath(target), /output_already_exists/);
    assert.throws(() => saveScreenshot(target, Buffer.from('changed')), /output_write_failed/);
    assert.throws(() => outputPath('relative.png'), /invalid_output_path/);
    assert.throws(() => outputPath(path.join(directory, 'missing', 'image.png')), /output_parent_missing/);
    assert.throws(() => outputPath(path.join(directory, 'image.jpg')), /output_must_be_png/);
    const repo = path.resolve(__dirname, '../..');
    assert.throws(() => outputPath(path.join(repo, 'private.png')), /output_inside_repository/);
    fs.symlinkSync(repo, path.join(directory, 'repo'));
    assert.throws(() => outputPath(path.join(directory, 'repo', 'private.png')), /output_inside_repository/);
    const frames = outputPath(path.join(directory, 'frames'), true);
    saveFrames(frames, { receipt: { status: 'captured', kind: 'inspector-pixel-frames' },
        frames: [{ image: Buffer.from(image(), 'base64'), width: 1, height: 1, receivedMs: 7 }] });
    assert.equal(fs.statSync(frames).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(frames, 'manifest.json')).mode & 0o777, 0o600);
    const manifest = JSON.parse(fs.readFileSync(path.join(frames, 'manifest.json')));
    assert.equal(manifest.timing, 'host-receive-time-not-video-fps');
    assert.equal(manifest.entries.length, 1);
});

test('strict CLI options and errors never echo endpoints, output paths or unexpected user input', t => {
    const directory = temporary(t);
    const endpoint = ['--endpoint', 'http://127.0.0.1:1234'];
    assert.equal(options(['probe', ...endpoint]).timeoutMs, 15000);
    for (const args of [
        ['rpc', ...endpoint], ['probe', ...endpoint, '--expression', 'PRIVATE'],
        ['probe', ...endpoint, '--timeout-ms', '0'], ['probe', ...endpoint, '--timeout-ms', '15001'],
        ['probe', ...endpoint, '--target-index', '-1'], ['probe', ...endpoint, '--timeout-ms', 'NaN'],
        ['probe', ...endpoint, '--endpoint', 'PRIVATE'],
        ['probe', ...endpoint, '--duration-ms', '100'], ['probe', ...endpoint, '--allow-private-pixels'],
        ['screenshot', ...endpoint, '--output', path.join(directory, 'image.png')],
        ['screencast', ...endpoint, '--allow-private-pixels', '--output', path.join(directory, 'frames'),
            '--duration-ms', '30001']
    ]) assert.throws(() => options(args));
    const child = spawnSync(process.execPath, ['tools/tizen/inspector.js', 'probe',
        '--endpoint', 'http://PRIVATE:1234/?token=PRIVATE'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' });
    assert.equal(child.status, 1);
    assert.equal(child.stderr.includes('PRIVATE'), false);
    assert.deepEqual(JSON.parse(child.stderr), { status: 'error', reason: 'invalid_endpoint' });
    assert.deepEqual(versionSummary({ Browser: 'Chrome/47.0.2526.69 PRIVATE', 'Protocol-Version': '1.1',
        token: 'PRIVATE' }), { chromium: '47.0.2526.69', protocol: '1.1' });
});

test('end-to-end fake probe exposes only allowlisted fields and releases connection and lock', async t => {
    const directory = temporary(t);
    const lock = path.join(directory, 'lock');
    const server = await fake((request, reply) => {
        if (request.method === 'Runtime.evaluate') reply({ result: { value: geometryFixture() } });
        else if (request.method === 'Page.canScreencast') reply({ result: false });
        else reply();
    });
    t.after(() => server.close());
    const result = await run(options(['probe', '--endpoint', server.endpoint]), () => acquireLock(lock));
    assert.equal(result.status, 'inspected');
    assert.equal(result.screencast.status, 'unsupported');
    assert.equal(result.screenshot.status, 'not_attempted');
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    assert.equal(fs.existsSync(lock), false);
    assert.deepEqual(server.requests.map(request => request.method), [
        'Page.enable', 'Runtime.evaluate', 'Page.canScreencast'
    ]);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(server.sockets.size, 0);
});

test('failed connect, RPC and interrupted session release lock without app mutations', async t => {
    const directory = temporary(t);
    const lock = path.join(directory, 'lock');
    const server = await fake(() => {});
    t.after(() => server.close());
    await assert.rejects(run(options(['probe', '--endpoint', server.endpoint, '--timeout-ms', '100']),
        () => acquireLock(lock)), { code: 'rpc_timeout' });
    assert.equal(fs.existsSync(lock), false);
    const running = run(options(['probe', '--endpoint', server.endpoint, '--timeout-ms', '100']),
        () => acquireLock(lock));
    setTimeout(() => process.emit('SIGINT'), 20);
    await assert.rejects(running);
    assert.equal(fs.existsSync(lock), false);
    assert.ok(server.requests.every(request => request.method === 'Page.enable'));
});
