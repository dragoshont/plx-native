'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { InspectorError } = require('./client');
const { layerCapture } = require('./layers');
const { KEYS, readState, refuseOk, press } = require('./nav');
const { keyCommand, createSender } = require('./remote');

const KIND = 'live-on-device-renderer-paint-replay-not-panel';
const LABEL = 'Live native renderer paint layers replayed on the TV. Separate and incomplete: ' +
    'NOT the panel image (no hardware video plane, system UI, compositing or panel processing).';
const MAX_FAILURES = 3;
const GEOMETRY = ['width', 'height', 'offsetX', 'offsetY', 'hasTransform'];
const QUEUE_LIMIT = 2; // one command dispatching plus one waiting; anything more is refused, never queued
const BODY_LIMIT = 256;
const REFRESH_AFTER_INPUT_MS = 350;
const MIN_CAPTURE_GAP_MS = 500;
const INPUT = {
    transport: 'CDP Input.dispatchKeyEvent rawKeyDown/keyUp (synthetic; native remote fidelity unverified)',
    keyCodes: { ...KEYS },
    back: 'keyCode 10009; earlier device-observed on this app (detail to Home), not re-verified by the viewer',
    guard: 'fresh focus read per command; OK only on browse-allowlisted focus, a card only with its current ratingKey',
    click: 'unsupported: paint-layer replays have no hit-testing or panel coordinate mapping'
};
const METADATA = ['model', 'year', 'os', 'firmware'];

function code(error) {
    return error instanceof InspectorError ? error.code : 'internal_error';
}

function page(nonce, intervalMs, interactive) {
    const controls = interactive ? `<div id="controls" aria-label="TV remote">
<button data-key="up">Up</button><button data-key="down">Down</button><button data-key="left">Left</button>
<button data-key="right">Right</button><button data-key="ok">OK</button><button data-key="back">Back</button>
<span class="sep"></span><button id="refresh">Refresh now</button><button id="pause">Pause</button></div>
<div id="command">input: idle</div>` : '<div id="command">input disabled (view only)</div>';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Samsung native layers (not panel)</title>
<style>body{background:#111;color:#eee;font:14px system-ui,sans-serif;margin:16px}
#label{background:#7a1f1f;padding:8px 12px;font-weight:600}#status,#command,#focus,#meta{margin:6px 0;font-family:monospace}
#stale{display:none;background:#b8860b;color:#000;padding:6px 12px;font-weight:700}
#controls button{margin:2px;padding:6px 12px}.sep{display:inline-block;width:16px}
#surface{outline:2px solid #555;padding:6px;margin-top:8px}#surface:focus{outline:3px solid #4aa3ff}
figure{display:inline-block;vertical-align:top;margin:0 12px 12px 0;border:1px dashed #888;padding:6px;max-width:100%}
img{max-width:100%;background:repeating-conic-gradient(#333 0 25%,#222 0 50%) 0 0/16px 16px;display:block}
figcaption{font-family:monospace;font-size:12px;margin-top:4px}</style></head><body>
<div id="label"></div><div id="stale"></div><div id="status">connecting…</div><div id="meta"></div>
${controls}<div id="focus"></div>
<div id="surface" tabindex="0" role="application" aria-label="TV remote surface: arrows, Enter/Space = OK, Backspace = Back"><div id="layers"></div></div>
<script nonce="${nonce}">
'use strict';
const keyCommand = ${keyCommand.toString()};
const createSender = ${createSender.toString()};
const base = location.pathname;
const csrf = ${JSON.stringify(nonce)};
const interval = ${intervalMs};
let shown = '';
let state = null;
let fetched = 0;
function $(id) { return document.getElementById(id); }
function text(tag, value) { const node = document.createElement(tag); node.textContent = value; return node; }
async function post(route, body) {
  const response = await fetch(base + route, { method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Plx-Viewer': csrf }, body: JSON.stringify(body) });
  const type = response.headers.get('Content-Type') || '';
  return type.indexOf('application/json') === 0 ? response.json() : { status: 'rejected', reason: 'http_' + response.status };
}
function report(result) {
  const node = $('command');
  if (!node) return;
  node.textContent = 'input: ' + result.key + ' ' + result.status + (result.reason ? ' (' + result.reason + ')' : '') +
    (result.rttMs !== undefined ? ' server-RTT ' + result.rttMs + 'ms' : '') +
    (result.clientRttMs !== undefined ? ' round-trip ' + result.clientRttMs + 'ms' : '');
}
const sender = createSender((key, extra) => post('key', Object.assign({ key: key }, extra)), report);
function send(key) {
  const focus = state && state.focus;
  const extra = key === 'ok' && focus && focus.kind === 'card' && focus.ratingKey ? { ratingKey: focus.ratingKey } : {};
  sender.send(key, extra);
}
const surface = $('surface');
surface.addEventListener('keydown', event => {
  if (!$('controls')) return;
  const command = keyCommand(event, surface);
  if (!command) return;
  event.preventDefault();
  if (command.send) send(command.key);
});
surface.addEventListener('mousedown', () => surface.focus());
if ($('controls')) {
  for (const button of document.querySelectorAll('button[data-key]')) {
    button.addEventListener('click', () => send(button.dataset.key));
  }
  $('refresh').addEventListener('click', () => post('refresh', {}).then(report, () => {}));
  $('pause').addEventListener('click', () => post('pause', { paused: !(state && state.paused) }).then(tick, () => {}));
}
function render() {
  if (!state) return;
  const age = state.capturedAt ? ((Date.now() - Date.parse(state.capturedAt)) / 1000).toFixed(1) + 's' : 'none';
  const polled = ((Date.now() - fetched) / 1000).toFixed(0);
  const stale = state.state !== 'live' || state.lastError || Date.now() - fetched > 5000 ||
    (state.capturedAt && !state.paused && Date.now() - Date.parse(state.capturedAt) > 3 * interval + 5000);
  $('stale').style.display = stale ? 'block' : 'none';
  $('stale').textContent = 'STALE: last genuine capture shown; ' + (state.endReason ? 'ended ' + state.endReason :
    state.lastError ? 'last error ' + state.lastError : Date.now() - fetched > 5000 ? 'viewer unreachable ' + polled + 's' : 'capture overdue');
  $('status').textContent = 'state=' + state.state + (state.paused ? ' PAUSED' : '') + ' capture#' + state.sequence +
    ' frame age ' + age + ' (capture ' + state.captureMs + 'ms) cycles=' + state.cycles + ' changed=' + state.changedCycles +
    (state.truncated ? ' TRUNCATED to ' + state.layers.length + '/' + state.drawableLayers + ' layers' : '') +
    (state.input && state.input.enabled ? ' commands pending=' + state.input.pending : '');
  const meta = state.tvMetadata;
  $('meta').textContent = 'source=' + state.provenance.source + ' tv=' + (meta.provenance === 'unknown' ? 'unknown' :
    ['model', 'year', 'os', 'firmware'].filter(key => meta[key]).map(key => key + ':' + meta[key]).join(' ') + ' (' + meta.provenance + ')');
  const focus = state.focus;
  $('focus').textContent = focus ? 'focus ' + (focus.error ? 'unknown (' + focus.error + ')' : focus.kind + ' row=' + (focus.row || '-') +
    (focus.cardType ? ' ' + focus.cardType : '') + ' OK ' + (focus.okRefusal ? 'blocked: ' + focus.okRefusal : 'allowed')) : '';
  if ($('pause')) $('pause').textContent = state.paused ? 'Resume' : 'Pause';
  const key = state.sequence + ':' + state.layers.map(layer => layer.sha256).join(',');
  if (key !== shown && state.layers.length) {
    const reuse = shown.split(':')[1] === key.split(':')[1];
    shown = key;
    const caption = layer => 'layer ' + layer.index + ' ' + layer.width + 'x' + layer.height +
      ' parent-relative offset (' + layer.offsetX + ',' + layer.offsetY + ')' +
      (layer.hasTransform ? ' +transform (not applied)' : '') + (layer.changed ? ' CHANGED' : ' unchanged') + ' sha256:' + layer.sha256.slice(0, 12);
    if (reuse) {
      // Identical pixels: keep the loaded images but refresh captions, since geometry may have moved.
      const captions = $('layers').querySelectorAll('figcaption');
      state.layers.forEach((layer, index) => { if (captions[index]) captions[index].textContent = caption(layer); });
      return;
    }
    $('layers').replaceChildren(...state.layers.map(layer => {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = base + 'frame/' + state.sequence + '/' + layer.index + '.png';
      image.alt = 'separate renderer layer ' + layer.index;
      figure.append(image, text('figcaption', caption(layer)));
      return figure;
    }));
  }
}
async function tick() {
  try { state = await (await fetch(base + 'state', { cache: 'no-store' })).json(); fetched = Date.now(); $('label').textContent = state.label; }
  catch (_) { /* keep the last frame; render() marks it STALE */ }
  render();
}
setInterval(render, 250);
(function poll() { tick().then(() => { if (!state || state.state !== 'ended') setTimeout(poll, 1000); }); })();
</script></body></html>`;
}

function metadata(value) {
    const out = {};
    for (const key of METADATA) {
        const item = value && value[key];
        if (item === undefined) continue;
        if (typeof item !== 'string' || !/^[A-Za-z0-9 ._-]{1,40}$/.test(item)) throw new InspectorError('invalid_live_option');
        out[key] = item;
    }
    return Object.keys(out).length ? { ...out, provenance: 'operator-supplied-not-observed' } : { provenance: 'unknown' };
}

// Serialises every CDP use (captures, focus reads, key dispatch). Commands wait ahead of captures so
// a press never sits behind the next scheduled capture; nothing ever runs two CDP sequences at once.
class Exclusive {
    constructor() { this.held = false; this.waiting = { command: [], capture: [] }; }
    async run(kind, task) {
        if (this.held) await new Promise(resolve => this.waiting[kind].push(resolve));
        this.held = true;
        try { return await task(); } finally {
            const next = this.waiting.command.shift() || this.waiting.capture.shift();
            if (next) next(); else this.held = false;
        }
    }
}

class LiveView {
    constructor(client, { durationMs, intervalMs, waitMs, interactive = false, tv } = {}) {
        for (const [value, min, max] of [[durationMs, 1000, 1800000], [intervalMs, 500, 60000], [waitMs, 10, 15000]]) {
            if (!Number.isInteger(value) || value < min || value > max) throw new InspectorError('invalid_live_option');
        }
        Object.assign(this, { client, durationMs, intervalMs, waitMs, interactive: interactive === true });
        this.token = crypto.randomBytes(24).toString('hex');
        // One CSRF value per viewer, carried only by the page script; a cross-origin page cannot read it.
        this.nonce = crypto.randomBytes(16).toString('base64');
        this.frames = [];
        this.cdp = new Exclusive();
        this.commandId = 0;
        this.state = { state: 'starting', label: LABEL, kind: KIND, sequence: 0, cycles: 0, changedCycles: 0,
            failures: 0, captureStartedAt: null, capturedAt: null, captureMs: 0, intervalMs, paused: false,
            layers: [], drawableLayers: 0, truncated: false, lastError: null, endReason: null,
            storage: 'memory-only-latest-capture',
            provenance: { source: 'actual-tv-web-inspector', emulator: false, kind: KIND,
                timing: 'discrete-paint-replays-not-video', composition: 'separate-layers-not-panel' },
            tvMetadata: metadata(tv),
            input: { enabled: this.interactive, ...INPUT, queueLimit: QUEUE_LIMIT, pending: 0,
                pressed: 0, refused: 0, rejected: 0, errors: 0, last: null },
            focus: null };
        this.stopReason = null;
        this.wake = null;
        this.forced = false;
        this.nextAt = 0;
        this.lastBegan = -Infinity;
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
        this.origin = `http://127.0.0.1:${this.port}`;
        this.done = this.loop().finally(() => this.close());
        return `${this.origin}/${this.token}/`;
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

    // Brings the next capture forward without overlapping the one in flight; repeated requests coalesce.
    schedule(at, force = false) {
        if (force) this.forced = true;
        this.nextAt = Math.min(this.nextAt, Math.max(at, this.lastBegan + MIN_CAPTURE_GAP_MS));
        if (this.wake) this.wake();
    }

    async loop() {
        const deadline = Date.now() + this.durationMs;
        this.state.state = 'live';
        let consecutive = 0;
        while (!this.stopReason) {
            const now = Date.now();
            if (now >= deadline) { this.stop('duration_elapsed'); break; }
            const due = this.forced ? now >= this.lastBegan + MIN_CAPTURE_GAP_MS : !this.state.paused && now >= this.nextAt;
            if (!due) {
                const until = this.forced ? this.lastBegan + MIN_CAPTURE_GAP_MS : this.state.paused ? deadline : this.nextAt;
                await this.sleep(Math.max(0, Math.min(until, deadline) - now));
                continue;
            }
            this.forced = false;
            const began = Date.now();
            this.lastBegan = began;
            this.nextAt = began + this.intervalMs;
            try {
                await this.cdp.run('capture', async () => {
                    const locked = Date.now();
                    this.state.captureStartedAt = new Date(locked).toISOString();
                    this.publish(await layerCapture(this.client, this.waitMs), locked);
                    if (this.interactive) await this.readFocus();
                });
                consecutive = 0;
            } catch (error) {
                this.state.failures++;
                this.state.lastError = code(error);
                // Cleanup failures may leave renderer snapshots behind; never keep replaying after one.
                if (this.client.closed || ++consecutive >= MAX_FAILURES || /cleanup/.test(this.state.lastError)) {
                    this.stop(this.state.lastError);
                }
            }
        }
        this.state.state = 'ended';
        this.state.endReason = this.stopReason;
        this.frames = [];
        // Let an in-flight command finish before the caller closes the client.
        await this.cdp.run('capture', async () => {});
        return this.receipt();
    }

    // Focus is advisory for the page (which OK target to name); every press re-reads it fresh.
    async readFocus() {
        const readAt = new Date().toISOString();
        try {
            const state = await readState(this.client);
            const active = state.active;
            const card = active.kind === 'card';
            this.state.focus = { readAt, screen: state.screen, kind: active.kind, row: active.row || null,
                cardType: card ? active.cardType : null, ratingKey: card ? active.ratingKey || null : null,
                okRefusal: refuseOk(state, card ? active.ratingKey : undefined) };
        } catch (error) {
            if (this.client.closed) throw error;
            this.state.focus = { readAt, error: code(error) };
        }
    }

    publish(capture, began) {
        const previous = this.frames;
        let changed = false;
        const layers = capture.frames.map((frame, index) => {
            const sha256 = crypto.createHash('sha256').update(frame.image).digest('hex');
            const geometry = GEOMETRY.map(key => frame.layer[key]).join(',');
            const before = previous[index];
            const pixelsChanged = !before || before.sha256 !== sha256;
            const layerChanged = pixelsChanged || before.geometry !== geometry;
            changed = changed || layerChanged;
            return { ...frame.layer, imageWidth: frame.width, imageHeight: frame.height, sha256, changed: layerChanged,
                pixelsChanged };
        });
        if (previous.length !== layers.length) changed = true;
        this.frames = capture.frames.map((frame, index) => ({ image: frame.image, sha256: layers[index].sha256,
            geometry: GEOMETRY.map(key => frame.layer[key]).join(',') }));
        Object.assign(this.state, { sequence: this.state.sequence + 1, cycles: this.state.cycles + 1,
            changedCycles: this.state.changedCycles + (changed ? 1 : 0), capturedAt: new Date().toISOString(),
            captureMs: Date.now() - began, layers, drawableLayers: capture.receipt.drawableLayers,
            truncated: capture.receipt.truncated, lastError: null });
    }

    // One guarded remote key. Bounded: at most QUEUE_LIMIT commands exist; the rest are refused at once.
    async command(body) {
        const input = this.state.input;
        const key = body.key;
        if (!Object.hasOwn(KEYS, key) || (body.ratingKey !== undefined &&
            (key !== 'ok' || typeof body.ratingKey !== 'string' || !/^\d{1,12}$/.test(body.ratingKey))) ||
            Object.keys(body).some(name => !['key', 'ratingKey'].includes(name))) return [400, { status: 'invalid' }];
        if (this.stopReason || this.state.state !== 'live') return [409, { status: 'rejected', key, reason: 'viewer_ended' }];
        if (input.pending >= QUEUE_LIMIT) { input.rejected++; return [429, { status: 'rejected', key, reason: 'queue_full' }]; }
        const id = ++this.commandId;
        const queued = Date.now();
        input.pending++;
        let result;
        try {
            const started = await this.cdp.run('command', async () => {
                const begun = Date.now();
                // saveSignIn is never forwarded: the Settings save opt-in stays a separate explicit CLI command.
                const pressed = this.stopReason ? { status: 'rejected', reason: 'viewer_ended' } :
                    await press(this.client, key, { ratingKey: body.ratingKey });
                return { begun, pressed };
            });
            const { status, reason } = started.pressed;
            result = { id, key, status, reason: reason || null, queuedMs: started.begun - queued, rttMs: Date.now() - queued };
            if (status === 'pressed') { input.pressed++; this.schedule(Date.now() + REFRESH_AFTER_INPUT_MS, !this.state.paused); }
            else if (status === 'refused') input.refused++;
            else input.rejected++;
        } catch (error) {
            input.errors++;
            result = { id, key, status: 'error', reason: code(error), queuedMs: null, rttMs: Date.now() - queued };
        } finally {
            input.pending--;
        }
        input.last = { ...result, completedAt: new Date().toISOString() };
        return [200, result];
    }

    post(route, body) {
        if (route === 'key') return this.command(body);
        if (Object.keys(body).some(name => name !== 'paused')) return [400, { status: 'invalid' }];
        if (this.stopReason || this.state.state !== 'live') return [409, { status: 'rejected', reason: 'viewer_ended' }];
        if (route === 'refresh' && !Object.hasOwn(body, 'paused')) {
            this.schedule(Date.now(), true);
            return [202, { key: 'refresh', status: 'scheduled' }];
        }
        if (route === 'pause' && typeof body.paused === 'boolean') {
            this.state.paused = body.paused;
            if (!body.paused) this.schedule(Date.now());
            return [200, { key: 'pause', status: body.paused ? 'paused' : 'resumed' }];
        }
        return [400, { status: 'invalid' }];
    }

    receive(request, response, route) {
        const refuse = status => { response.statusCode = status; response.end(); };
        // A cross-site page cannot set this header without a preflight, which is never answered.
        if (request.headers.origin !== this.origin || typeof request.headers['x-plx-viewer'] !== 'string' ||
            request.headers['x-plx-viewer'] !== this.nonce ||
            !/^application\/json(;\s*charset=utf-8)?$/i.test(request.headers['content-type'] || '')) return refuse(403);
        if (Number(request.headers['content-length']) > BODY_LIMIT) return refuse(413);
        const chunks = [];
        let size = 0;
        request.on('data', chunk => {
            size += chunk.length;
            if (size > BODY_LIMIT) { refuse(413); request.destroy(); } else chunks.push(chunk);
        });
        request.on('end', async () => {
            if (response.writableEnded) return;
            let body;
            try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { return refuse(400); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) return refuse(400);
            let status;
            let result;
            try { [status, result] = await this.post(route, body); } catch (_) {
                [status, result] = [500, { status: 'error', reason: 'internal_error' }];
            }
            response.statusCode = status;
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(result));
        });
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
        const prefix = `/${this.token}/`;
        const url = request.url || '';
        const candidate = Buffer.from(url.slice(0, prefix.length));
        if (candidate.length !== prefix.length || !crypto.timingSafeEqual(candidate, Buffer.from(prefix))) {
            return refuse(404);
        }
        const route = url.slice(prefix.length);
        if (request.method === 'POST') {
            if (!this.interactive || !['key', 'refresh', 'pause'].includes(route)) return refuse(405);
            return this.receive(request, response, route);
        }
        if (request.method !== 'GET') return refuse(405);
        if (route === '') {
            const nonce = this.nonce;
            response.setHeader('Content-Security-Policy', `default-src 'none'; img-src 'self'; ` +
                `connect-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; ` +
                `base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            return response.end(page(nonce, this.intervalMs, this.interactive));
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
        const input = this.state.input;
        return { status: this.state.cycles ? 'ended' : 'unavailable', kind: KIND,
            reason: this.stopReason, cycles: this.state.cycles, changedCycles: this.state.changedCycles,
            failures: this.state.failures, lastLayers: this.state.layers.length,
            truncated: this.state.truncated, storage: 'memory-only-discarded',
            composition: 'separate-layers-not-a-composited-screenshot',
            timing: 'sequential-paint-replays-not-video',
            input: { enabled: input.enabled, pressed: input.pressed, refused: input.refused, rejected: input.rejected,
                errors: input.errors } };
    }
}

module.exports = { LiveView, LABEL, KIND, QUEUE_LIMIT, BODY_LIMIT };
