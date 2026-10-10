'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { InspectorError } = require('./client');
const { layerCapture } = require('./layers');

const KIND = 'live-on-device-renderer-paint-replay-not-panel';
const LABEL = 'Live native renderer paint layers replayed on the TV. Separate and incomplete: ' +
    'NOT the panel image (no hardware video plane, system UI, compositing or panel processing).';
const MAX_FAILURES = 3;

function code(error) {
    return error instanceof InspectorError ? error.code : 'internal_error';
}

function page(nonce, intervalMs) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Samsung native layers (not panel)</title>
<style>body{background:#111;color:#eee;font:14px system-ui,sans-serif;margin:16px}
#label{background:#7a1f1f;padding:8px 12px;font-weight:600}#status{margin:8px 0;font-family:monospace}
figure{display:inline-block;vertical-align:top;margin:0 12px 12px 0;border:1px dashed #888;padding:6px;max-width:100%}
img{max-width:100%;background:repeating-conic-gradient(#333 0 25%,#222 0 50%) 0 0/16px 16px;display:block}
figcaption{font-family:monospace;font-size:12px;margin-top:4px}</style></head><body>
<div id="label"></div><div id="status">connecting…</div><div id="layers"></div>
<script nonce="${nonce}">
'use strict';
const base = location.pathname;
let shown = -1;
function text(tag, value) { const node = document.createElement(tag); node.textContent = value; return node; }
async function tick() {
  let state;
  try { state = await (await fetch(base + 'state', { cache: 'no-store' })).json(); }
  catch (_) { document.getElementById('status').textContent = 'viewer stopped (session ended or disconnected)'; return; }
  document.getElementById('label').textContent = state.label;
  const age = state.capturedAt ? ((Date.now() - Date.parse(state.capturedAt)) / 1000).toFixed(1) + 's ago' : 'none yet';
  document.getElementById('status').textContent = 'state=' + state.state + ' capture#' + state.sequence +
    ' captured ' + age + ' in ' + state.captureMs + 'ms; cycles=' + state.cycles + ' changed=' + state.changedCycles +
    (state.truncated ? ' TRUNCATED to ' + state.layers.length + '/' + state.drawableLayers + ' layers' : '') +
    (state.lastError ? ' lastError=' + state.lastError : '') + (state.endReason ? ' ended=' + state.endReason : '');
  if (state.sequence !== shown) {
    shown = state.sequence;
    const root = document.getElementById('layers');
    root.replaceChildren(...state.layers.map(layer => {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = base + 'frame/' + state.sequence + '/' + layer.index + '.png';
      image.alt = 'separate renderer layer ' + layer.index;
      figure.append(image, text('figcaption', 'layer ' + layer.index + ' ' + layer.width + 'x' + layer.height +
        ' parent-relative offset (' + layer.offsetX + ',' + layer.offsetY + ')' +
        (layer.hasTransform ? ' +transform (not applied)' : '') + (layer.changed ? ' CHANGED' : ' unchanged') +
        ' sha256:' + layer.sha256.slice(0, 12)));
      return figure;
    }));
  }
  if (state.state !== 'ended') setTimeout(tick, ${intervalMs});
}
tick();
</script></body></html>`;
}

class LiveView {
    constructor(client, { durationMs, intervalMs, waitMs }) {
        for (const [value, min, max] of [[durationMs, 1000, 1800000], [intervalMs, 500, 10000], [waitMs, 10, 15000]]) {
            if (!Number.isInteger(value) || value < min || value > max) throw new InspectorError('invalid_live_option');
        }
        Object.assign(this, { client, durationMs, intervalMs, waitMs });
        this.token = crypto.randomBytes(24).toString('hex');
        this.frames = [];
        this.state = { state: 'starting', label: LABEL, kind: KIND, sequence: 0, cycles: 0, changedCycles: 0,
            failures: 0, capturedAt: null, captureMs: 0, layers: [], drawableLayers: 0, truncated: false,
            lastError: null, endReason: null, storage: 'memory-only-latest-capture' };
        this.stopReason = null;
        this.wake = null;
    }

    async start() {
        this.server = http.createServer((request, response) => this.serve(request, response));
        this.server.maxConnections = 8;
        this.server.requestTimeout = 10000;
        this.server.headersTimeout = 5000;
        await new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(0, '127.0.0.1', resolve);
        });
        this.port = this.server.address().port;
        this.done = this.loop().finally(() => this.close());
        return `http://127.0.0.1:${this.port}/${this.token}/`;
    }

    stop(reason) {
        if (!this.stopReason) this.stopReason = reason;
        if (this.wake) this.wake();
    }

    sleep(ms) {
        return new Promise(resolve => {
            const timer = setTimeout(done, ms);
            function done() { clearTimeout(timer); resolve(); }
            this.wake = done;
        }).finally(() => { this.wake = null; });
    }

    async loop() {
        const deadline = Date.now() + this.durationMs;
        this.state.state = 'live';
        let consecutive = 0;
        while (!this.stopReason) {
            if (Date.now() >= deadline) { this.stop('duration_elapsed'); break; }
            const began = Date.now();
            try {
                this.publish(await layerCapture(this.client, this.waitMs), began);
                consecutive = 0;
            } catch (error) {
                this.state.failures++;
                this.state.lastError = code(error);
                // Cleanup failures may leave renderer snapshots behind; never keep replaying after one.
                if (this.client.closed || ++consecutive >= MAX_FAILURES || /cleanup/.test(this.state.lastError)) {
                    this.stop(this.state.lastError);
                }
            }
            if (this.stopReason) break;
            const remaining = deadline - Date.now();
            await this.sleep(Math.max(0, Math.min(this.intervalMs - (Date.now() - began), remaining)));
        }
        this.state.state = 'ended';
        this.state.endReason = this.stopReason;
        this.frames = [];
        return this.receipt();
    }

    publish(capture, began) {
        const previous = this.frames;
        let changed = false;
        const layers = capture.frames.map((frame, index) => {
            const sha256 = crypto.createHash('sha256').update(frame.image).digest('hex');
            const before = previous[index];
            const layerChanged = !before || before.sha256 !== sha256;
            changed = changed || layerChanged;
            return { ...frame.layer, imageWidth: frame.width, imageHeight: frame.height, sha256, changed: layerChanged };
        });
        if (previous.length !== layers.length) changed = true;
        this.frames = capture.frames.map((frame, index) => ({ image: frame.image, sha256: layers[index].sha256 }));
        Object.assign(this.state, { sequence: this.state.sequence + 1, cycles: this.state.cycles + 1,
            changedCycles: this.state.changedCycles + (changed ? 1 : 0), capturedAt: new Date().toISOString(),
            captureMs: Date.now() - began, layers, drawableLayers: capture.receipt.drawableLayers,
            truncated: capture.receipt.truncated, lastError: null });
    }

    serve(request, response) {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('X-Frame-Options', 'DENY');
        response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        const refuse = status => { response.statusCode = status; response.end(); };
        // Exact Host defeats DNS rebinding; the token keeps other local pages and users from guessing the URL.
        if (request.headers.host !== `127.0.0.1:${this.port}`) return refuse(421);
        if (request.method !== 'GET') return refuse(405);
        const prefix = `/${this.token}/`;
        const url = request.url || '';
        const candidate = Buffer.from(url.slice(0, prefix.length));
        if (candidate.length !== prefix.length || !crypto.timingSafeEqual(candidate, Buffer.from(prefix))) {
            return refuse(404);
        }
        const route = url.slice(prefix.length);
        if (route === '') {
            const nonce = crypto.randomBytes(16).toString('base64');
            response.setHeader('Content-Security-Policy', `default-src 'none'; img-src 'self'; ` +
                `connect-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; ` +
                `base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            return response.end(page(nonce, this.intervalMs));
        }
        if (route === 'state') {
            response.setHeader('Content-Type', 'application/json');
            return response.end(JSON.stringify(this.state));
        }
        const match = route.match(/^frame\/(\d{1,9})\/(\d)\.png$/);
        if (!match) return refuse(404);
        // Only the current capture is retained; an older URL never resolves to a reused image.
        const frame = Number(match[1]) === this.state.sequence ? this.frames[Number(match[2])] : undefined;
        if (!frame) return refuse(410);
        response.setHeader('Content-Type', 'image/png');
        response.end(frame.image);
    }

    close() {
        if (!this.server) return Promise.resolve();
        const server = this.server;
        this.server = null;
        return new Promise(resolve => {
            server.close(() => resolve());
            server.closeAllConnections();
        });
    }

    receipt() {
        return { status: this.state.cycles ? 'ended' : 'unavailable', kind: KIND,
            reason: this.stopReason, cycles: this.state.cycles, changedCycles: this.state.changedCycles,
            failures: this.state.failures, lastLayers: this.state.layers.length,
            truncated: this.state.truncated, storage: 'memory-only-discarded',
            composition: 'separate-layers-not-a-composited-screenshot',
            timing: 'sequential-paint-replays-not-video' };
    }
}

module.exports = { LiveView, LABEL, KIND };
