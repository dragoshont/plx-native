"use strict";
var assert = require("assert");
var playback = require("../../samsung/PlexTv/js/playback.js");
var item = {
    ratingKey: "10", duration: 100000, viewOffset: 5000,
    Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        Part: [{ id: "20", key: "/library/parts/20/file.mp4", Stream: [] }] }]
};
function rig() {
    var calls = [];
    var state = "idle";
    var position = 0;
    var adapter = {
        snapshot: function () { return { state: state, position: position, duration: item.duration }; },
        open: function (url, offset) { calls.push(["open", url]); position = offset; state = "playing"; return Promise.resolve(); },
        close: function () { calls.push(["close"]); state = "idle"; },
        pause: function () { state = "paused"; },
        play: function () { state = "playing"; },
        seek: function (target) { position = target; return Promise.resolve(target); }
    };
    var client = {
        request: function (path, method, query) { calls.push(["decision", query]); return Promise.resolve({ generalDecisionCode: 1001 }); },
        streamUrl: function (path) { return "https://synthetic.invalid" + path; },
        timeline: function (media, time, phase) { calls.push(["timeline", time, phase]); return Promise.resolve(); },
        stopTranscode: function () { calls.push(["cleanup"]); return Promise.resolve(); },
        getMetadata: function () { calls.push(["readback"]); return Promise.resolve(item); }
    };
    return { calls: calls, adapter: adapter, client: client };
}
async function run() {
    var plan = playback.plan(item, { offset: 5000 });
    assert.strictEqual(plan.direct, false, "Unknown capabilities must not guess direct play");
    assert.strictEqual(plan.query.directPlay, 0);
    assert.strictEqual(plan.query.offset, 0, "AVPlay resumes in the source timeline, not an offset-relative HLS clock");
    assert.strictEqual(playback.plan(item, { profile: {
        evidence: "synthetic-measured-profile", containers: ["mp4"], video: ["h264"], audio: ["aac"],
        maxWidth: 1920, maxHeight: 1080
    } }).direct, true);
    assert.throws(function () { playback.plan({ ratingKey: "10" }); }, /no playable/);
    var multipart = JSON.parse(JSON.stringify(item));
    multipart.Media[0].Part.push({ id: "21", key: "/library/parts/21/file.mp4" });
    assert.throws(function () { playback.plan(multipart); }, /multi-part/,
        "Unsupported multi-part files must not silently play only their first part");
    var test = rig();
    var session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { offset: 5000 } });
    assert.strictEqual(test.calls.length, 0, "Browsing/session construction must not mutate progress");
    await session.start();
    await session.pause();
    assert(test.calls.some(function (call) { return call[0] === "timeline" && call[1] === 5000 && call[2] === "paused"; }));
    await session.seek(15000);
    await session.stop();
    assert(test.calls.some(function (call) { return call[0] === "timeline" && call[1] === 15000 && call[2] === "stopped"; }));
    assert(test.calls.some(function (call) { return call[0] === "cleanup"; }));
    assert(test.calls.some(function (call) { return call[0] === "readback"; }));
    assert.strictEqual(test.adapter.snapshot().state, "idle");
    await assert.rejects(session.start(), /cannot be started/);

    test = rig();
    test.client.request = function () { return Promise.resolve({ generalDecisionCode: 2001 }); };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item });
    await assert.rejects(session.start(), /refused playback/);
    assert(!test.calls.some(function (call) { return call[0] === "open" || call[0] === "timeline"; }));
    await session.stop();
    console.log("Tizen playback negotiation/progress/read-back tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
