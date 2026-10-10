'use strict';

const { InspectorError } = require('./client');
const { png } = require('./capture');

const MAX_BYTES = 32 * 1024 * 1024;

function drawableLayers(value) {
    if (!Array.isArray(value) || value.length > 100) throw new InspectorError('invalid_layer_tree');
    return value.filter(layer => {
        if (!layer || typeof layer !== 'object') throw new InspectorError('invalid_layer_tree');
        return layer.drawsContent === true && layer.invisible !== true;
    }).map(layer => {
        if (typeof layer.layerId !== 'string' || !layer.layerId.length || layer.layerId.length > 128 ||
            !Number.isFinite(layer.width) || !Number.isFinite(layer.height) ||
            !Number.isFinite(layer.offsetX) || !Number.isFinite(layer.offsetY) ||
            layer.width <= 0 || layer.height <= 0 || layer.width > 4096 || layer.height > 4096 ||
            layer.width * layer.height > 16 * 1024 * 1024 ||
            Math.abs(layer.offsetX) > 100000 || Math.abs(layer.offsetY) > 100000) {
            throw new InspectorError('invalid_layer_geometry');
        }
        return { id: layer.layerId, width: layer.width, height: layer.height,
            offsetX: layer.offsetX, offsetY: layer.offsetY,
            hasTransform: Object.hasOwn(layer, 'transform') };
    }).sort((a, b) => b.width * b.height - a.width * a.height);
}

async function layerCapture(client, waitMs = 1000) {
    if (!Number.isInteger(waitMs) || waitMs < 10 || waitMs > 15000) {
        throw new InspectorError('invalid_layer_wait');
    }
    let settle;
    let timer;
    let settled = false;
    const tree = new Promise(resolve => { settle = resolve; });
    const finish = value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        settle(value);
    };
    const notification = (method, params) => {
        if (method === 'LayerTree.layerTreeDidChange') {
            try { finish({ layers: drawableLayers(params && params.layers) }); }
            catch (error) { finish({ error }); }
        }
    };
    const disconnected = error => finish({ error });
    client.on('notification', notification);
    client.on('disconnected', disconnected);
    const frames = [];
    let totalBytes = 0;
    let releaseFailed = false;
    let disableFailed = false;
    let error;
    let totalLayers = 0;
    try {
        await client.rpc('LayerTree.enable');
        if (!settled) timer = setTimeout(() => finish({ error: new InspectorError('layer_tree_timeout') }), waitMs);
        const result = await tree;
        if (result.error) throw result.error;
        totalLayers = result.layers.length;
        if (!totalLayers) throw new InspectorError('no_drawable_layers');
        // Large documents must not create an unbounded renderer replay workload.
        for (const [index, layer] of result.layers.slice(0, 8).entries()) {
            let snapshot;
            try {
                const made = await client.rpc('LayerTree.makeSnapshot', { layerId: layer.id });
                if (typeof made.snapshotId !== 'string' || !made.snapshotId.length || made.snapshotId.length > 128) {
                    throw new InspectorError('invalid_snapshot_id');
                }
                snapshot = made.snapshotId;
                const replay = await client.rpc('LayerTree.replaySnapshot', { snapshotId: snapshot, scale: 1 });
                if (typeof replay.dataURL !== 'string' || !replay.dataURL.startsWith('data:image/png;base64,')) {
                    throw new InspectorError('invalid_layer_png');
                }
                const image = png(replay.dataURL.slice(22));
                totalBytes += image.bytes.length;
                if (totalBytes > MAX_BYTES) throw new InspectorError('layer_capture_bytes_exceeded');
                frames.push({ image: image.bytes, width: image.width, height: image.height,
                    layer: { index, width: layer.width, height: layer.height,
                        offsetX: layer.offsetX, offsetY: layer.offsetY, hasTransform: layer.hasTransform } });
            } finally {
                if (snapshot) {
                    try { await client.rpc('LayerTree.releaseSnapshot', { snapshotId: snapshot }); }
                    catch (_) { releaseFailed = true; }
                }
            }
            if (releaseFailed) throw new InspectorError('layer_snapshot_cleanup_failed');
        }
    } catch (caught) { error = caught; }
    finally {
        finish({});
        client.removeListener('notification', notification);
        client.removeListener('disconnected', disconnected);
        // Disable also clears the backend snapshot map if make timed out.
        try { await client.rpc('LayerTree.disable'); }
        catch (_) { disableFailed = true; }
    }
    if (releaseFailed || disableFailed) throw new InspectorError('layer_capture_cleanup_failed');
    if (error) throw error;
    return {
        receipt: { status: 'captured', kind: 'on-device-renderer-paint-replay-not-panel',
            format: 'png', layers: frames.length, drawableLayers: totalLayers,
            truncated: totalLayers > 8, bytes: totalBytes, cleanup: 'released-and-disabled',
            composition: 'separate-layers-not-a-composited-screenshot',
            timing: 'sequential-paint-replays-not-video' },
        frames
    };
}

module.exports = { drawableLayers, layerCapture };
