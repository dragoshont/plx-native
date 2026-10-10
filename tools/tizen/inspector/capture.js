'use strict';

const { InspectorError } = require('./client');
const MAX_PNG = 8 * 1024 * 1024;
const MAX_FRAMES_BYTES = 32 * 1024 * 1024;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function png(data) {
    if (typeof data !== 'string' || data.length > Math.ceil(MAX_PNG / 3) * 4 ||
        !data.length || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
        throw new InspectorError('invalid_or_oversized_png');
    }
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length > MAX_PNG || bytes.toString('base64') !== data ||
        !bytes.subarray(0, 8).equals(SIGNATURE)) throw new InspectorError('invalid_or_oversized_png');
    let offset = 8;
    let width;
    let height;
    let hasData = false;
    let ended = false;
    while (offset + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const end = offset + 12 + length;
        if (end > bytes.length) throw new InspectorError('invalid_or_oversized_png');
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) {
            throw new InspectorError('invalid_or_oversized_png');
        }
        if (offset === 8) {
            if (type !== 'IHDR' || length !== 13) throw new InspectorError('invalid_or_oversized_png');
            width = bytes.readUInt32BE(offset + 8);
            height = bytes.readUInt32BE(offset + 12);
            if (!width || !height || width > 4096 || height > 4096 || width * height > 16 * 1024 * 1024) {
                throw new InspectorError('png_dimensions_exceeded');
            }
        } else if (type === 'IHDR') throw new InspectorError('invalid_or_oversized_png');
        if (type === 'IDAT' && length) hasData = true;
        if (type === 'IEND') {
            if (length !== 0 || end !== bytes.length) throw new InspectorError('invalid_or_oversized_png');
            ended = true;
        }
        offset = end;
    }
    if (!ended || !hasData) throw new InspectorError('invalid_or_oversized_png');
    return { bytes, width, height };
}

function failure(error) {
    if (!(error instanceof InspectorError)) throw error;
    const result = { status: error.code === 'protocol_error' && error.protocolCode === -32601 ?
        'unsupported' : 'unavailable', reason: error.code };
    if (error.protocolCode !== undefined) result.protocolCode = error.protocolCode;
    return result;
}

async function screencastCapability(client) {
    try {
        const value = await client.rpc('Page.canScreencast');
        if (typeof value.result !== 'boolean') throw new InspectorError('invalid_capability_result');
        return { status: value.result ? 'advertised' : 'unsupported', advertised: value.result };
    } catch (error) { return failure(error); }
}

async function screenshot(client) {
    try {
        // Chromium 47's screenshot command has no format/fromSurface parameters.
        const value = await client.rpc('Page.captureScreenshot');
        const image = png(value.data);
        return { receipt: { status: 'captured', kind: 'inspector-pixels',
            format: 'png', width: image.width, height: image.height, bytes: image.bytes.length },
        image: image.bytes };
    } catch (error) { return { receipt: failure(error) }; }
}

async function screencast(client, durationMs, maxFrames) {
    if (!Number.isInteger(durationMs) || durationMs < 100 || durationMs > 30000 ||
        !Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 120) {
        throw new InspectorError('invalid_recording_limit');
    }
    const capability = await screencastCapability(client);
    if (capability.status !== 'advertised') return { receipt: capability, frames: [] };
    const frames = [];
    const acknowledgements = [];
    let bytes = 0;
    let done = false;
    let timer;
    let finish;
    const finished = new Promise(resolve => { finish = resolve; });
    function settle(error) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        finish(error);
    }
    const disconnected = error => settle(error);
    const notification = (method, params) => {
        if (method !== 'Page.screencastFrame' || done) return;
        try {
            if (!params) throw new InspectorError('invalid_screencast_frame');
            const old = Object.hasOwn(params, 'frameNumber');
            const id = old ? params.frameNumber : params.sessionId;
            if (!Number.isInteger(id) || id < 0 || id > 2147483647) {
                throw new InspectorError('invalid_screencast_frame');
            }
            const image = png(params.data);
            bytes += image.bytes.length;
            if (bytes > MAX_FRAMES_BYTES) throw new InspectorError('recording_bytes_exceeded');
            frames.push({ image: image.bytes, width: image.width, height: image.height,
                receivedMs: Math.round(performance.now() - started) });
            const ack = client.rpc('Page.screencastFrameAck', old ? { frameNumber: id } : { sessionId: id });
            acknowledgements.push(ack);
            ack.catch(settle);
            if (frames.length >= maxFrames) settle();
        } catch (error) { settle(error); }
    };
    const started = performance.now();
    client.on('notification', notification);
    client.on('disconnected', disconnected);
    timer = setTimeout(() => settle(), durationMs);
    let receipt;
    let cleanup;
    try {
        await client.rpc('Page.startScreencast', { format: 'png', maxWidth: 1920, maxHeight: 1080 });
        const error = await finished;
        await Promise.all(acknowledgements);
        if (error) throw error;
        receipt = frames.length ? { status: 'captured', kind: 'inspector-pixel-frames',
            format: 'png', frames: frames.length, bytes, elapsedMs: Math.round(performance.now() - started) } :
            { status: 'unavailable', reason: 'no_frames_before_deadline' };
    } catch (error) { receipt = failure(error); }
    finally {
        done = true;
        clearTimeout(timer);
        client.removeListener('notification', notification);
        client.removeListener('disconnected', disconnected);
        // Start may time out after the device has already enabled the stream.
        try { await client.rpc('Page.stopScreencast'); cleanup = 'stopped'; }
        catch (error) { cleanup = failure(error); }
    }
    if (cleanup !== 'stopped') {
        receipt = { status: 'unavailable', reason: 'screencast_cleanup_failed',
            capture: receipt, cleanup };
    } else receipt.cleanup = cleanup;
    return { receipt, frames: receipt.status === 'captured' ? frames : [] };
}

module.exports = { png, crc32, screenshot, screencastCapability, screencast, MAX_PNG };
