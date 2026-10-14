"use strict";
var assert = require("assert");
var av = require("../../samsung/Vemm/js/avplay");
function fake() {
    var state = "NONE", time = 0;
    var native = { listeners: [], prepares: [], seeks: [], plays: 0,
        getState: function () { return state; }, open: function () { state = "IDLE"; },
        close: function () { state = "NONE"; }, stop: function () { state = "IDLE"; },
        setDisplayRect: function () {}, setDisplayMethod: function () {},
        setListener: function (value) { native.listeners.push(value); },
        prepareAsync: function (ok, fail) { native.prepares.push({ ok: function () { state = "READY"; ok(); }, fail: fail }); },
        seekTo: function (target, ok, fail) { native.seeks.push({ ok: ok, fail: fail }); },
        getDuration: function () { return 100000; }, getCurrentTime: function () { return time; },
        play: function () { native.plays++; state = "PLAYING"; }, pause: function () { state = "PAUSED"; }
    };
    return native;
}
async function run() {
    // A terminal native event must retire the still-pending READY resume callback.
    var native = fake(), events = [];
    var player = av.create({ avplay: native, onEvent: function (event) { events.push(event); } });
    var opening = player.open("https://synthetic.invalid/a", 5000);
    var cancelled = assert.rejects(opening, /cancelled/);
    native.prepares[0].ok();
    native.listeners[0].onstreamcompleted();
    native.seeks[0].ok();
    assert.strictEqual(native.plays, 0, "Completion must invalidate the pending resume: a late callback must not restart playback");
    await cancelled;
    player.close();
    for (var change of ["subtitle", "audio", "version"]) {
        for (var phase of ["preparing", "paused", "seeking", "completing"]) {
            native = fake(); events = [];
            player = av.create({ avplay: native, onEvent: function (event) { events.push(event); } });
            opening = player.open("https://synthetic.invalid/old", 0);
            var oldFailure = opening.catch(function () {});
            if (phase !== "preparing") { native.prepares[0].ok(); await opening; }
            if (phase === "paused") { player.pause(); }
            var seekFailure;
            if (phase === "seeking") { seekFailure = player.seek(70000).catch(function () {}); }
            if (phase === "completing") { native.listeners[0].onstreamcompleted(); }
            var replacement = player.open("https://synthetic.invalid/" + change, 0, phase === "paused");
            native.prepares[1].ok(); await replacement;
            var snapshot = player.snapshot(), count = events.length;
            native.prepares[0].ok(); native.prepares[0].fail();
            if (native.seeks.length) { native.seeks[0].ok(); native.seeks[0].fail(); }
            native.listeners[0].oncurrentplaytime(99999); native.listeners[0].onsubtitlechange(1000, "old");
            native.listeners[0].onbufferingstart(); native.listeners[0].onbufferingcomplete();
            native.listeners[0].onstreamcompleted(); native.listeners[0].onerror();
            assert.deepStrictEqual(player.snapshot(), snapshot, change + " during " + phase + " ignores stale state");
            assert.strictEqual(events.length, count, change + " during " + phase + " ignores stale events");
            assert.strictEqual(snapshot.state, phase === "paused" ? "paused" : "playing", "Replacement preserves pause intent");
            await oldFailure; if (seekFailure) { await seekFailure; } player.close();
        }
    }
    console.log("Tizen subtitle/audio/version transition matrix: passed (12 stale-callback journeys)");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
