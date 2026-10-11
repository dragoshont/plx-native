"use strict";
// AVPlay cannot send request headers, so the PMS token must ride in the stream URL
// (as on LG). This guards the compensating control: the token-bearing URL never
// reaches an error, event or anything else the UI can render or log.
var assert = require("assert");
var av = require("../../samsung/PlexTv/js/avplay.js");

var SECRET = "synthetic-token-7f3a";
var URL = "https://pms.synthetic.invalid/library/parts/1/file.mkv?X-Plex-Token=" + SECRET;

function leaks(value) { return JSON.stringify(value === undefined ? null : value).indexOf(SECRET) !== -1; }

function nativeThat(fail) {
    var listener;
    return {
        getState: function () { return "NONE"; },
        open: function (url) { if (fail === "open") { throw new Error("native open failed for " + url); } },
        close: function () {}, stop: function () {},
        setDisplayRect: function () {}, setDisplayMethod: function () {},
        setListener: function (value) { listener = value; },
        prepareAsync: function (success, failure) {
            if (fail === "prepare") { failure(new Error("prepare failed: " + URL)); return; }
            if (fail === "onerror") { listener.onerror("PLAYER_ERROR_CONNECTION_FAILED " + URL); return; }
            success();
        },
        getDuration: function () { return 1000; }, getCurrentTime: function () { return 0; },
        seekTo: function (t, ok) { ok(); }, play: function () {}, pause: function () {},
        getTotalTrackInfo: function () { return []; }
    };
}

async function run() {
    for (var mode of ["open", "prepare", "onerror"]) {
        var events = [];
        var adapter = av.create({ avplay: nativeThat(mode), prepareTimeout: 50, onEvent: function (e) { events.push(e); } });
        var failure = null;
        try { await adapter.open(URL, 0); } catch (error) { failure = error; }
        assert(failure, mode + ": open must reject");
        assert(!leaks(failure.message) && !leaks(failure.code), mode + ": the rejection must not carry the token: " + failure.message);
        assert(!leaks(events), mode + ": no emitted event may carry the token");
    }
    console.log("Tizen stream-URL token exposure guard: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
