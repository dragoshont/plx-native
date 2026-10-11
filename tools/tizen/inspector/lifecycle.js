'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { InspectorError } = require('./client');

const REPO = path.resolve(__dirname, '../../..');
const LOCK = '/tmp/plx-samsung-device.lock';

function acquireLock(lock = LOCK) {
    try { fs.mkdirSync(lock, { mode: 0o700 }); }
    catch (error) {
        throw new InspectorError(error.code === 'EEXIST' ? 'device_lock_held' : 'device_lock_failed');
    }
    const identity = fs.lstatSync(lock);
    const owner = path.join(lock, 'owner.json');
    const token = crypto.randomUUID();
    try {
        fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, token }), { flag: 'wx', mode: 0o600 });
    } catch (_) {
        fs.rmdirSync(lock);
        throw new InspectorError('device_lock_failed');
    }
    return () => {
        try {
            const current = fs.lstatSync(lock);
            const value = JSON.parse(fs.readFileSync(owner, 'utf8'));
            if (current.ino !== identity.ino || current.dev !== identity.dev || value.token !== token) {
                throw new Error();
            }
            fs.unlinkSync(owner);
            fs.rmdirSync(lock);
        } catch (_) { throw new InspectorError('device_lock_cleanup_failed'); }
    };
}

function outputPath(value, directory = false) {
    if (typeof value !== 'string' || !path.isAbsolute(value)) throw new InspectorError('invalid_output_path');
    const target = path.resolve(value);
    let parent;
    try { parent = fs.realpathSync(path.dirname(target)); }
    catch (_) { throw new InspectorError('output_parent_missing'); }
    const resolved = path.join(parent, path.basename(target));
    const repo = fs.realpathSync(REPO);
    if (resolved === repo || resolved.startsWith(repo + path.sep)) throw new InspectorError('output_inside_repository');
    if (fs.existsSync(resolved) || fs.existsSync(target)) throw new InspectorError('output_already_exists');
    if (!directory && path.extname(resolved).toLowerCase() !== '.png') throw new InspectorError('output_must_be_png');
    return resolved;
}

function saveScreenshot(target, image) {
    try { fs.writeFileSync(target, image, { flag: 'wx', mode: 0o600 }); }
    catch (_) { throw new InspectorError('output_write_failed'); }
}

function saveFrames(target, capture) {
    try {
        fs.mkdirSync(target, { mode: 0o700 });
        const entries = capture.frames.map((frame, index) => {
            const filename = 'frame-' + String(index + 1).padStart(4, '0') + '.png';
            fs.writeFileSync(path.join(target, filename), frame.image, { flag: 'wx', mode: 0o600 });
            return { filename, width: frame.width, height: frame.height,
                ...(frame.layer ? { layer: frame.layer } : { receivedMs: frame.receivedMs }) };
        });
        fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({
            ...capture.receipt, timing: capture.receipt.timing || 'host-receive-time-not-video-fps', entries
        }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    } catch (_) { throw new InspectorError('output_write_failed'); }
}

module.exports = { LOCK, acquireLock, outputPath, saveScreenshot, saveFrames };
