"use strict";
var assert = require("assert");
var fs = require("fs");
var vm = require("vm");
async function run() {
    var tick;
    var context = { module: { exports: {} }, Promise: Promise,
        setInterval: function (callback) { tick = callback; return 1; }, clearInterval: function () {} };
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/PlexTv/js/playback"), "utf8"), context);
    var item = { ratingKey: "1", type: "movie", Media: [{ videoCodec: "h264",
        Part: [{ id: "2", key: "/library/parts/2/file.mp4", Stream: [{ streamType: 1, codec: "h264" }] }] }] };
    var position = 0, state = "playing", calls = [], release;
    var session = context.module.exports.create({
        item: item,
        client: {
            selectStreams: function () { return Promise.resolve(); },
            request: function () { return Promise.resolve({ generalDecisionCode: 1001 }); },
            streamUrl: function () { return "https://synthetic.invalid/stream"; },
            timeline: function (movie, time, status) {
                calls.push({ time: time, state: status });
                return new Promise(function (resolve) { release = resolve; });
            },
            stopTranscode: function () { return Promise.resolve(); }, getMetadata: function () { return Promise.resolve(item); }
        },
        adapter: {
            open: function () { return Promise.resolve(); }, close: function () { state = "idle"; },
            snapshot: function () { return { state: state, position: position }; }
        }
    });
    async function settle() { for (var i = 0; i < 20; i += 1) { await Promise.resolve(); } }
    await session.start(); await settle();
    for (var i = 0; i < 500; i += 1) { position += 10000; tick(); }
    assert.strictEqual(calls.length, 1, "Slow/offline progress must not create concurrent writes");
    var stopped = session.stop();
    release(); await settle();
    assert.strictEqual(calls.length, 2, "Intermediate samples must be coalesced, not replayed hundreds of times");
    assert.deepStrictEqual(calls[1], { time: 5000000, state: "stopped" });
    release(); await stopped;
    console.log("Tizen progress queue bounded/coalesced with preserved final stop: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
