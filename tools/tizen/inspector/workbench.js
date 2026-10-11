'use strict';

// One local page for Samsung work: the desktop preview of samsung/PlexTv beside the
// live native paint layers from the TV. The preview needs no TV; the live pane exists
// only when the operator started the workbench with an endpoint and pixel consent.

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const APP = path.resolve(__dirname, '../../../samsung/PlexTv');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.xml': 'application/xml' };

function page(nonce, live) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Samsung workbench</title>
<style>
:root{color-scheme:dark;--bg:#141414;--panel:#1c1c1c;--line:#2e2e2e;--text:#ececec;--muted:#9a9a9a;--warn:#d6a740}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,sans-serif}
header{display:flex;align-items:baseline;gap:16px;padding:14px 20px;border-bottom:1px solid var(--line)}
h1{font-size:16px;margin:0;font-weight:600}header p{margin:0;color:var(--muted)}
main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:16px 20px}
@media (max-width:1100px){main{grid-template-columns:1fr}}
section{background:var(--panel);border:1px solid var(--line);border-radius:8px;overflow:hidden;display:flex;flex-direction:column}
section>h2{display:flex;justify-content:space-between;gap:12px;margin:0;padding:10px 14px;font-size:13px;font-weight:600;border-bottom:1px solid var(--line)}
section>h2 span{color:var(--muted);font-weight:400}
.stage{position:relative;aspect-ratio:16/9;background:#000;overflow:hidden}
.stage iframe{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;transform-origin:0 0}
.live{flex:1;min-height:420px;border:0;width:100%;background:var(--bg)}
.empty{flex:1;padding:24px;display:grid;align-content:center;gap:10px;min-height:300px}
.empty strong{font-size:15px}.empty p{margin:0;color:var(--muted);max-width:60ch}
code{background:#000;border:1px solid var(--line);border-radius:4px;padding:8px 10px;display:block;white-space:pre-wrap;color:var(--text);font-size:12px}
.badge{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--muted);margin-right:6px}
.badge.on{background:#e8e8e8}.badge.held{background:var(--warn)}
footer{padding:0 20px 16px;color:var(--muted);font-size:12px}
a{color:var(--text)}:focus-visible{outline:2px solid #fff;outline-offset:2px}
</style></head><body>
<header><h1>Samsung workbench</h1><p>Desktop preview and the TV's native paint layers on one page.</p></header>
<main>
<section aria-labelledby="ph"><h2 id="ph">Desktop preview <span>samsung/PlexTv · Chrome, not Tizen · 1920×1080 scaled</span></h2>
<div class="stage" id="stage"><iframe id="preview" title="Desktop preview of the Samsung app" src="app/index.html"></iframe></div>
<footer style="padding:10px 14px"><a href="app/index.html" target="_blank" rel="noopener">Open preview full size</a> · Click the preview, then use the arrow keys, Enter and Backspace.</footer></section>
<section aria-labelledby="lh"><h2 id="lh">Actual TV <span id="lstate"></span></h2>
${live ? `<iframe class="live" title="Live native paint layers from the TV" src="${live}"></iframe>` :
        `<div class="empty"><strong><span class="badge" id="dot"></span><span id="ltitle">Not connected</span></strong>
<p id="lwhy">This workbench was started without a TV endpoint, so no TV has been contacted and no private pixels are shown.</p>
<p>To add the live pane, forward the TV's Web Inspector port, make sure no other lane holds the device lock, and restart with:</p>
<code>node tools/tizen/inspector.js workbench --endpoint http://127.0.0.1:PORT --allow-private-pixels [--interactive]</code></div>`}
</section></main>
<footer>Live frames are separate paint layers replayed on the TV, not a photograph of the panel; the video plane and some overlays are absent. Private pixels stay in memory on this machine.</footer>
<script nonce="${nonce}">
'use strict';
const stage = document.getElementById('stage'), frame = document.getElementById('preview');
function fit() { frame.style.transform = 'scale(' + (stage.clientWidth / 1920) + ')'; }
new ResizeObserver(fit).observe(stage); fit();
async function poll() {
  try {
    const state = await (await fetch('state', { cache: 'no-store' })).json();
    document.getElementById('lstate').textContent = state.live ? 'connected' : state.lock === 'held' ? 'device lane in use' : 'not connected';
    const dot = document.getElementById('dot');
    if (dot) {
      dot.className = 'badge' + (state.lock === 'held' ? ' held' : '');
      if (state.lock === 'held') {
        document.getElementById('ltitle').textContent = 'Device lane in use';
        document.getElementById('lwhy').textContent = 'Another job holds the Samsung device lock. Wait for it to finish; this page never breaks a lock.';
      }
    }
  } catch (_) { document.getElementById('lstate').textContent = 'workbench stopped'; }
}
poll(); setInterval(poll, 5000);
</script></body></html>`;
}

class Workbench {
    constructor({ port = 0, appDir = APP, lockPath, live } = {}) {
        if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('invalid_port');
        Object.assign(this, { port, appDir: path.resolve(appDir), lockPath, live: live || null });
        this.token = crypto.randomBytes(24).toString('hex');
    }

    lockState() {
        if (!this.lockPath) return 'unknown';
        try { fs.lstatSync(this.lockPath); return 'held'; } catch (error) { return error.code === 'ENOENT' ? 'free' : 'unknown'; }
    }

    async start() {
        this.server = http.createServer((request, response) => this.serve(request, response));
        this.server.maxConnections = 32;
        this.server.requestTimeout = 10000;
        this.server.headersTimeout = 5000;
        await new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(this.port, '127.0.0.1', resolve);
        });
        this.port = this.server.address().port;
        this.origin = `http://127.0.0.1:${this.port}`;
        return `${this.origin}/${this.token}/`;
    }

    serve(request, response) {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Referrer-Policy', 'no-referrer');
        const refuse = status => { response.statusCode = status; response.end(); };
        if (request.headers.host !== `127.0.0.1:${this.port}`) return refuse(421);
        if (request.method !== 'GET' && request.method !== 'HEAD') return refuse(405);
        const prefix = `/${this.token}/`;
        const url = (request.url || '').split('?')[0];
        const candidate = Buffer.from(url.slice(0, prefix.length));
        if (candidate.length !== prefix.length || !crypto.timingSafeEqual(candidate, Buffer.from(prefix))) return refuse(404);
        const route = url.slice(prefix.length);
        if (route === '') {
            const nonce = crypto.randomBytes(16).toString('base64');
            const liveOrigin = this.live ? new URL(this.live).origin : '';
            response.setHeader('X-Frame-Options', 'DENY');
            response.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; ` +
                `script-src 'nonce-${nonce}'; connect-src 'self'; frame-src 'self' ${liveOrigin}; ` +
                `base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            return response.end(page(nonce, this.live));
        }
        if (route === 'state') {
            response.setHeader('Content-Type', 'application/json');
            return response.end(JSON.stringify({ live: Boolean(this.live), lock: this.lockState() }));
        }
        if (!route.startsWith('app/')) return refuse(404);
        let relative;
        try { relative = decodeURIComponent(route.slice(4)); } catch (_) { return refuse(400); }
        if (relative === '' || relative.endsWith('/')) relative += 'index.html';
        const file = path.resolve(this.appDir, relative);
        if (!file.startsWith(this.appDir + path.sep) || relative.split(/[\\/]/).some(part => part.startsWith('.'))) return refuse(404);
        fs.readFile(file, (error, body) => {
            if (error) return refuse(404);
            // The preview is the app's own code, framed only by this page.
            response.setHeader('X-Frame-Options', 'SAMEORIGIN');
            response.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
            response.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
            response.end(request.method === 'HEAD' ? undefined : body);
        });
    }

    close() {
        if (!this.server) return Promise.resolve();
        const server = this.server;
        this.server = null;
        return new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
    }
}

module.exports = { Workbench, APP };
