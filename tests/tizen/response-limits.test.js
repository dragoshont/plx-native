"use strict";
var assert = require("assert");
var fs = require("fs");
var vm = require("vm");
function rig(response) {
    var timers = new Map();
    var next = 0;
    var context = {
        module: { exports: {} }, Promise: Promise, TextDecoder: TextDecoder, Blob: Blob,
        setTimeout: function (callback) { var id = ++next; timers.set(id, callback); return id; },
        clearTimeout: function (id) { timers.delete(id); }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/js/plex-api"), "utf8"), context);
    var client = context.module.exports.createClient({
        baseUrl: "https://server.synthetic.invalid", token: "synthetic-server-token",
        fetch: function () { return Promise.resolve(response); }
    });
    return { client: client, timers: timers };
}
async function settle() { for (var i = 0; i < 20; i += 1) { await Promise.resolve(); } }
async function run() {
    var fixture = rig({
        ok: true, status: 200,
        text: function () { return new Promise(function () {}); },
        body: { getReader: function () { return {
            read: function () { return new Promise(function () {}); }, cancel: function () { return Promise.resolve(); }
        }; } }
    });
    var pending = fixture.client.getSections();
    await settle();
    assert.strictEqual(fixture.timers.size, 1, "Receiving headers must not disable the body-read deadline");
    fixture.timers.forEach(function (callback) { callback(); });
    await assert.rejects(pending, /timed out/);

    var cancelled = 0;
    var reads = 0;
    fixture = rig({
        ok: true, status: 200,
        text: function () { assert.fail("Oversized streaming bodies must not be buffered by text()"); },
        body: { getReader: function () { return {
            read: function () {
                reads += 1;
                return Promise.resolve({ done: false, value: new Uint8Array(4 * 1024 * 1024 + 1) });
            },
            cancel: function () { cancelled += 1; return Promise.resolve(); }
        }; } }
    });
    await assert.rejects(fixture.client.getSections(), /limit/);
    assert.strictEqual(reads, 1);
    assert.strictEqual(cancelled, 1);
    assert.strictEqual(fixture.timers.size, 0);

    var title = "Synthetic \u00e9 \ud83d\udcfa";
    var bytes = new TextEncoder().encode(JSON.stringify({ MediaContainer: {
        Directory: [{ key: "1", type: "movie", title: title }]
    } }));
    var split = bytes.indexOf(0xf0) + 1;
    var chunks = [bytes.slice(0, split), bytes.slice(split)];
    fixture = rig({
        ok: true, status: 200,
        body: { getReader: function () { return {
            read: function () { return Promise.resolve(chunks.length ? { done: false, value: chunks.shift() } : { done: true }); },
            cancel: function () { assert.fail("An accepted body must not be cancelled"); }
        }; } }
    });
    assert.strictEqual((await fixture.client.getSections())[0].title, title, "UTF-8 split across network chunks must survive decoding");
    assert.strictEqual(fixture.timers.size, 0);

    chunks = [new Uint8Array(4 * 1024 * 1024)];
    fixture = rig({
        ok: true, status: 200,
        body: { getReader: function () { return {
            read: function () { return Promise.resolve(chunks.length ? { done: false, value: chunks.shift() } : { done: true }); },
            cancel: function () { assert.fail("The exact limit is permitted"); }
        }; } }
    });
    assert.strictEqual((await fixture.client.image("/synthetic-poster")).size, 4 * 1024 * 1024);
    assert.strictEqual(fixture.timers.size, 0);

    fixture = rig({ ok: true, status: 200, text: function () { assert.fail("Unbounded legacy text() must not run"); } });
    await assert.rejects(fixture.client.getSections(), /runtime is not supported yet/);
    assert.strictEqual(fixture.timers.size, 0);
    var aborted = 0;
    fixture = rig({
        ok: true, status: 200,
        body: { getReader: function () { return {
            read: function () { return new Promise(function () {}); },
            cancel: function () { aborted += 1; return Promise.resolve(); }
        }; } }
    });
    pending = fixture.client.getSections();
    await settle();
    fixture.client.cancelRequests();
    await assert.rejects(pending, /cancelled/);
    assert.strictEqual(aborted, 1, "Leaving a view must cancel its active response reader");
    assert.strictEqual(fixture.timers.size, 0);

    fixture = rig({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: { Directory: [] } }); } });
    pending = fixture.client.getSections();
    fixture.client.cancelRequests();
    await assert.rejects(pending, /cancelled|unreachable/);
    assert.strictEqual((await fixture.client.getSections()).length, 0, "Cancellation must not permanently disable the client");

    console.log("Tizen full-body deadline and incremental response-size limits: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
