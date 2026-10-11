"use strict";
var assert = require("assert");
var av = require("../../samsung/PlexTv/js/avplay.js");

function fake() {
    var state = "NONE";
    var listener;
    var time = 0;
    var calls = [];
    return {
        calls: calls,
        getState: function () { return state; },
        open: function () { calls.push("open"); state = "IDLE"; },
        close: function () { calls.push("close"); state = "NONE"; },
        stop: function () { calls.push("stop"); state = "IDLE"; },
        setDisplayRect: function (x, y, width, height) { assert.strictEqual(width, 1920); assert.strictEqual(height, 1080); },
        setDisplayMethod: function (method) { assert.strictEqual(method, "PLAYER_DISPLAY_MODE_LETTER_BOX"); },
        setListener: function (value) { listener = value; },
        prepareAsync: function (success) { state = "READY"; success(); },
        getDuration: function () { return 100000; },
        getCurrentTime: function () { return time; },
        seekTo: function (target, success) { time = Math.floor(target / 1000) * 1000; success(); },
        play: function () { calls.push("play"); state = "PLAYING"; },
        pause: function () { calls.push("pause"); state = "PAUSED"; },
        getTotalTrackInfo: function () { return [{ type: "AUDIO", index: 0 }]; },
        setSelectTrack: function (type, index) { calls.push(type + index); },
        setSilentSubtitle: function () {},
        send: function (type, value) { listener[type](value); }
    };
}

async function run() {
    var native = fake();
    var events = [];
    var adapter = av.create({ avplay: native, onEvent: function (event) { events.push(event); } });
    assert.strictEqual(native.calls.length, 0, "Constructing the adapter must not play");
    await adapter.open("https://synthetic.invalid/stream", 5000);
    assert.strictEqual(adapter.snapshot().state, "playing");
    assert.strictEqual(adapter.snapshot().position, 5000, "The first timeline must use the native resume position");
    adapter.pause();
    assert.strictEqual(adapter.snapshot().state, "paused");
    assert.strictEqual(await adapter.seek(12555), 12000, "Seek must report native landed time, not requested time");
    adapter.play();
    adapter.selectTrack("AUDIO", 0);
    native.send("onsubtitlechange", 1500);
    assert.strictEqual(adapter.tracks().length, 1);
    native.send("oncurrentplaytime", 30000);
    assert.strictEqual(adapter.snapshot().position, 30000);
    native.send("onstreamcompleted");
    assert.strictEqual(adapter.snapshot().state, "ended");
    assert.strictEqual(adapter.snapshot().position, 100000, "Native completion must report the full clip, not the last cached callback");
    adapter.close();
    assert.strictEqual(adapter.snapshot().state, "idle");
    await assert.rejects(adapter.seek(10), /Cannot seek/);
    await assert.rejects(av.create({}).open("https://synthetic.invalid"), /unavailable/);

    native = fake();
    var prepare;
    native.prepareAsync = function (success) { prepare = success; };
    adapter = av.create({ avplay: native });
    var pending = adapter.open("https://synthetic.invalid");
    adapter.close();
    await assert.rejects(pending, /cancelled/);
    prepare();
    assert(!native.calls.includes("play"), "Stale prepare callback must not start playback");

    native = fake();
    native.prepareAsync = function () {};
    adapter = av.create({ avplay: native, prepareTimeout: 5 });
    await assert.rejects(adapter.open("https://synthetic.invalid"), /prepare-timeout/);
    adapter.close();

    native = fake();
    adapter = av.create({ avplay: native });
    await adapter.open("https://synthetic.invalid", 0);
    var completeSeek;
    native.seekTo = function (target, success) { completeSeek = success; };
    var seeking = adapter.seek(50000);
    var seekFailure = assert.rejects(seeking, /cancelled/);
    adapter.close();
    completeSeek();
    await seekFailure;
    assert.strictEqual(adapter.snapshot().position, 0, "An old seek callback must not change a closed player");

    native = fake();
    adapter = av.create({ avplay: native, seekTimeout: 5 });
    await adapter.open("https://synthetic.invalid", 0);
    native.seekTo = function (target, success) { completeSeek = success; };
    seeking = adapter.seek(50000);
    var timeoutFailure = assert.rejects(seeking, /seek-timeout/);
    await assert.rejects(adapter.seek(10000), /already/);
    await timeoutFailure;
    completeSeek();
    assert.strictEqual(adapter.snapshot().position, 0, "A timed-out seek must not later mutate the playhead");
    adapter.close();
    // Tizen 3.0 (UE55MU6172): reopening a transcode at 6690 s after an audio switch left AVPlay
    // READY forever, because a READY-state seekTo on HLS never called back.
    native = fake();
    var seeks = [];
    native.seekTo = function (target, success) {
        seeks.push(native.getState());
        if (native.getState() === "PLAYING") { success(); }
    };
    adapter = av.create({ avplay: native, resumeSeekTimeout: 5 });
    await adapter.open("https://synthetic.invalid/stream", 6690000);
    assert.strictEqual(adapter.snapshot().state, "playing", "A silent READY seek must not strand the player in READY");
    assert.deepStrictEqual(seeks, ["READY", "PLAYING"], "The resume seek must be retried once playback has started");
    assert.strictEqual(native.getState(), "PLAYING");
    adapter.close();

    native = fake();
    native.seekTo = function () {};
    events = [];
    adapter = av.create({ avplay: native, resumeSeekTimeout: 5, onEvent: function (event) { events.push(event); } });
    await adapter.open("https://synthetic.invalid/stream", 6690000);
    assert.strictEqual(adapter.snapshot().state, "playing", "A resume that never lands still plays rather than hanging");
    await new Promise(function (done) { setTimeout(done, 30); });
    assert(events.some(function (event) { return event.type === "resume-failed"; }), "A lost resume position must be reported");
    adapter.close();
    console.log("Tizen AVPlay state/cancellation/seek tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
