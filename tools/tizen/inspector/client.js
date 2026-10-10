'use strict';

const http = require('node:http');
const { EventEmitter } = require('node:events');
const WebSocket = require('ws');

const MAX_MESSAGE = 12 * 1024 * 1024;

class InspectorError extends Error {
    constructor(code, method, protocolCode) {
        super(code);
        this.code = code;
        this.method = method;
        if (Number.isInteger(protocolCode)) this.protocolCode = protocolCode;
    }
}

function localEndpoint(value) {
    let url;
    try { url = new URL(value); } catch (_) { throw new InspectorError('invalid_endpoint'); }
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
        !url.port || url.username || url.password || url.search || url.hash ||
        url.pathname !== '/') throw new InspectorError('invalid_endpoint');
    return url;
}

function jsonRequest(endpoint, route, timeoutMs) {
    return new Promise((resolve, reject) => {
        const request = http.get(new URL(route, endpoint), { agent: false }, response => {
            if (response.statusCode !== 200) {
                response.destroy();
                reject(new InspectorError('discovery_http_error'));
                return;
            }
            const chunks = [];
            let bytes = 0;
            response.on('data', chunk => {
                bytes += chunk.length;
                if (bytes > 256 * 1024) {
                    response.destroy(new InspectorError('discovery_too_large'));
                } else chunks.push(chunk);
            });
            response.on('error', error => reject(error instanceof InspectorError ?
                error : new InspectorError('discovery_connection_error')));
            response.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
                catch (_) { reject(new InspectorError('discovery_invalid_json')); }
            });
        });
        // An absolute deadline also covers a peer that keeps sending small chunks.
        const timer = setTimeout(() => request.destroy(new InspectorError('discovery_timeout')), timeoutMs);
        request.on('error', error => reject(error instanceof InspectorError ?
            error : new InspectorError('discovery_connection_error')));
        request.on('close', () => clearTimeout(timer));
    });
}

async function discover(endpoint, timeoutMs) {
    const [version, targets] = await Promise.all([
        jsonRequest(endpoint, '/json/version', timeoutMs),
        jsonRequest(endpoint, '/json/list', timeoutMs)
    ]);
    if (!version || typeof version !== 'object' || Array.isArray(version) ||
        !Array.isArray(targets) || targets.length > 100) {
        throw new InspectorError('discovery_invalid_shape');
    }
    return { version, targets };
}

function selectTarget(endpoint, targets, index) {
    const pages = targets.map((target, i) => ({ target, index: i }))
        .filter(entry => entry.target && entry.target.type === 'page');
    let selected;
    if (index === undefined) {
        if (pages.length !== 1) throw new InspectorError('target_selection_required');
        selected = pages[0].target;
    } else {
        if (!Number.isInteger(index) || index < 0) throw new InspectorError('invalid_target');
        selected = targets[index];
        if (!selected || selected.type !== 'page') throw new InspectorError('invalid_target');
    }
    let url;
    try { url = new URL(selected.webSocketDebuggerUrl); }
    catch (_) { throw new InspectorError('invalid_target_url'); }
    if (url.protocol !== 'ws:' || url.hostname !== endpoint.hostname ||
        url.port !== endpoint.port || url.username || url.password || url.search || url.hash ||
        !url.pathname.startsWith('/devtools/page/')) throw new InspectorError('invalid_target_url');
    return url;
}

class Client extends EventEmitter {
    constructor(socket, timeoutMs) {
        super();
        this.socket = socket;
        this.timeoutMs = timeoutMs;
        this.nextId = 1;
        this.pending = new Map();
        this.closed = false;
        socket.on('message', (data, binary) => this.receive(data, binary));
        socket.on('error', () => this.fail(new InspectorError('websocket_error')));
        socket.on('close', () => this.fail(new InspectorError('websocket_closed')));
    }

    static connect(url, timeoutMs) {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(url, {
                perMessageDeflate: false,
                maxPayload: MAX_MESSAGE,
                handshakeTimeout: timeoutMs,
                followRedirects: false
            });
            const timer = setTimeout(() => {
                socket.terminate();
                reject(new InspectorError('connect_timeout'));
            }, timeoutMs);
            const failed = () => {
                clearTimeout(timer);
                reject(new InspectorError('connect_failed'));
            };
            socket.on('error', failed);
            socket.once('open', () => {
                clearTimeout(timer);
                const client = new Client(socket, timeoutMs);
                socket.removeListener('error', failed);
                resolve(client);
            });
        });
    }

    receive(data, binary) {
        let message;
        try {
            if (binary) throw new Error();
            message = JSON.parse(data.toString('utf8'));
            if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error();
        } catch (_) {
            this.fail(new InspectorError('invalid_protocol_message'));
            return;
        }
        if (Object.hasOwn(message, 'id')) {
            if (!Number.isInteger(message.id)) {
                this.fail(new InspectorError('invalid_protocol_message'));
                return;
            }
            const pending = this.pending.get(message.id);
            // A timed-out RPC may still receive its asynchronous reply later.
            if (!pending) return;
            this.pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) {
                pending.reject(new InspectorError('protocol_error', pending.method, message.error.code));
            } else if (!message.result || typeof message.result !== 'object' || Array.isArray(message.result)) {
                pending.reject(new InspectorError('invalid_protocol_result', pending.method));
            } else pending.resolve(message.result);
        } else if (typeof message.method === 'string') {
            this.emit('notification', message.method, message.params);
        } else this.fail(new InspectorError('invalid_protocol_message'));
    }

    rpc(method, params = {}) {
        if (this.closed) return Promise.reject(new InspectorError('websocket_closed', method));
        if (this.pending.size >= 16) return Promise.reject(new InspectorError('too_many_requests', method));
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new InspectorError('rpc_timeout', method));
            }, this.timeoutMs);
            this.pending.set(id, { resolve, reject, timer, method });
            this.socket.send(JSON.stringify({ id, method, params }), error => {
                if (error) this.fail(new InspectorError('websocket_send_error', method));
            });
        });
    }

    fail(error) {
        if (this.closed) return;
        this.closed = true;
        for (const request of this.pending.values()) {
            clearTimeout(request.timer);
            request.reject(new InspectorError(error.code, request.method));
        }
        this.pending.clear();
        this.emit('disconnected', error);
        this.socket.terminate();
    }

    close() {
        this.fail(new InspectorError('websocket_closed'));
    }
}

module.exports = { Client, InspectorError, localEndpoint, jsonRequest, discover, selectTarget };
