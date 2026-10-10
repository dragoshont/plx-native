'use strict';

const http = require('node:http');
const zlib = require('node:zlib');
const { WebSocketServer } = require('../../tools/tizen/inspector/node_modules/ws');
const { Client, crc32 } = {
    ...require('../../tools/tizen/inspector/client'),
    ...require('../../tools/tizen/inspector/capture')
};

function image(width = 1, height = 1, padding = 0) {
    function chunk(type, data) {
        const name = Buffer.from(type);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
        return Buffer.concat([length, name, data, crc]);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(Buffer.alloc(5))),
        ...(padding ? [chunk('tEXt', Buffer.alloc(padding))] : []),
        chunk('IEND', Buffer.alloc(0))
    ]).toString('base64');
}

async function fake(handler, httpHandler) {
    const requests = [];
    const headers = [];
    const sockets = new Set();
    const server = http.createServer((request, response) => {
        if (httpHandler) return httpHandler(request, response);
        response.setHeader('Content-Type', 'application/json');
        if (request.url === '/json/version') {
            response.end(JSON.stringify({ Browser: 'Chrome/47.0.2526.69 PRIVATE',
                'Protocol-Version': '1.1', token: 'PRIVATE' }));
        } else if (request.url === '/json/list') response.end(JSON.stringify([
            { type: 'page', title: 'PRIVATE', url: 'PRIVATE', id: 'PRIVATE',
                webSocketDebuggerUrl: endpoint.replace('http:', 'ws:') + '/devtools/page/PRIVATE' }
        ]));
        else { response.statusCode = 404; response.end(); }
    });
    const websocket = new WebSocketServer({ server, perMessageDeflate: false });
    websocket.on('connection', (socket, request) => {
        sockets.add(socket);
        headers.push(request.headers);
        socket.on('error', () => {});
        socket.on('close', () => sockets.delete(socket));
        socket.on('message', data => {
            const request = JSON.parse(data.toString());
            requests.push(request);
            const reply = (result = {}) => socket.send(JSON.stringify({ id: request.id, result }));
            handler(request, reply, socket);
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const endpoint = 'http://127.0.0.1:' + server.address().port;
    return { endpoint, requests, headers, sockets,
        connect: (timeout = 100) => Client.connect(endpoint.replace('http:', 'ws:') + '/devtools/page/PRIVATE', timeout),
        close: async () => {
            for (const socket of sockets) socket.terminate();
            await new Promise(resolve => websocket.close(resolve));
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        } };
}

module.exports = { fake, image };
