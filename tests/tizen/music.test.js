"use strict";
var assert = require("assert");
var playback = require("../../samsung/PlexTv/js/playback");
var track = { ratingKey: "10", type: "track", duration: 180000,
    Media: [{ audioCodec: "flac", container: "flac", Part: [{ id: "20", key: "/library/parts/20/file.flac",
        Stream: [{ streamType: 2, codec: "flac" }] }] }] };
async function run() {
    var plan = playback.plan(track);
    assert.strictEqual(plan.kind, "music");
    assert.strictEqual(plan.query.protocol, "http");
    assert.strictEqual(plan.query.audioCodec, "mp3");
    assert.strictEqual(plan.query.videoCodec, undefined);
    var calls = [];
    var state = "idle";
    var session = playback.create({
        item: track,
        client: {
            selectStreams: function () { calls.push("select"); return Promise.resolve(); },
            request: function (path) { calls.push(path); return Promise.resolve({ generalDecisionCode: 1001 }); },
            streamUrl: function (path) { calls.push(path); return "https://synthetic.invalid" + path; },
            timeline: function () { return Promise.resolve(); },
            stopTranscode: function (id, kind) { calls.push(kind); return Promise.resolve(); },
            getMetadata: function () { return Promise.resolve(track); }
        },
        adapter: {
            open: function () { state = "playing"; return Promise.resolve(); },
            close: function () { state = "idle"; },
            snapshot: function () { return { state: state, position: 1000 }; }
        }
    });
    await session.start();
    assert(calls.includes("/music/:/transcode/universal/decision"));
    assert(calls.includes("/music/:/transcode/universal/start.mp3"));
    await session.stop();
    assert(calls.includes("music"));
    console.log("Tizen music transcoder/session/timeline/cleanup contracts: passed");
}
run().catch(function (error) { console.error(error); process.exit(1); });
