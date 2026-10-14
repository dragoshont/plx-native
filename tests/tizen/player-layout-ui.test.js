"use strict";
// LG-parity player interactions against a synthetic item and a mocked player. No Plex request,
// AVPlay session, timeline update or household account is used.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var JSDOM = require("jsdom").JSDOM;
var root = path.resolve(__dirname, "../..");
var item = {
    ratingKey: "synthetic-episode",
    type: "episode",
    title: "A Synthetic Journey",
    grandparentTitle: "Synthetic Show",
    grandparentThumb: "/library/metadata/show/thumb",
    parentTitle: "Season 2",
    parentIndex: 2,
    index: 4,
    summary: "A synthetic episode used only by this test.",
    year: 2025,
    contentRating: "TV-PG",
    duration: 60000,
    viewOffset: 45000,
    Chapter: [
        { id: 1, index: 0, tag: "Arrival", startTimeOffset: 0, thumb: "/chapter/arrival" },
        { id: 2, index: 1, tag: "Discovery", startTimeOffset: 20000, thumb: "/chapter/discovery" },
        { id: 3, index: 2, tag: "Return", startTimeOffset: 40000, thumb: "/chapter/return" }
    ],
    Marker: [{ id: 9, type: "credits", startTimeOffset: 54000, endTimeOffset: 60000, final: "1" }],
    Media: [{
        container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        Part: [{ id: 1, key: "/library/parts/synthetic/file", Stream: [
            { id: 11, streamType: 2, language: "English", languageCode: "eng", displayTitle: "English — Stereo", codec: "aac" },
            { id: 12, streamType: 2, language: "English", languageCode: "eng", displayTitle: "English — Commentary", codec: "aac" },
            { id: 13, streamType: 2, language: "French", languageCode: "fra", displayTitle: "French", codec: "aac" },
            { id: 21, streamType: 3, language: "English", languageCode: "eng", displayTitle: "English", codec: "srt" }
        ] }]
    }]
};

function playerFixture(trackOptions) {
    var dom = new JSDOM(fs.readFileSync(path.join(root, "samsung/PlexTv/index.html"), "utf8"), {
        url: "https://player.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    Object.defineProperty(window.document, "hidden", { value: false, configurable: true });
    var callbacks = {};
    var adapters = 0;
    var seeks = [];
    var starts = 0;
    var plays = 0;
    var playerSettings = [];
    var timers = [];
    var timersNext = 1;
    window.fetch = function () { assert.fail("The player preview must not use the network"); };
    var i18nContext = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, "samsung/PlexTv/js/i18n.js"), "utf8"), i18nContext);
    window.PlexI18n = i18nContext.PlexI18n;
    window.PlexPreferences = {
        load: function () { return { quality: "original", nextEpisode: "countdown", language: "en",
            skipInterval: 10, subtitleDelayMs: trackOptions && trackOptions.initialDelay || 0,
            subtitleSize: "medium", subtitlePosition: "low",
            subtitleColor: "white", subtitleBackground: "off", directPlay: "auto" }; },
        save: function () {}
    };
    window.PlexSkipMarkers = require("../../samsung/PlexTv/js/skip-markers.js");
    window.PlexSubtitles = require("../../samsung/PlexTv/js/subtitles.js");
    window.PlexAvplay = { create: function (options) { adapters += 1; callbacks.avplay = options; return {}; } };
    window.PlexPlayback = {
        create: function (options) {
            playerSettings.push(options.settings);
            var state = "idle";
            return {
                start: function () {
                    starts += 1;
                    if (trackOptions && trackOptions.failFirstStart && starts === 1) {
                        return Promise.reject(new Error("Synthetic stream negotiation failure"));
                    }
                    state = "playing";
                    return Promise.resolve();
                },
                snapshot: function () { return { state: state, position: 45000, duration: item.duration }; },
                pause: function () { state = "paused"; return Promise.resolve(); },
                play: function () { plays += 1; state = "playing"; return Promise.resolve(); },
                seek: function (position) { seeks.push(position); return Promise.resolve(position); },
                stop: function () { state = "idle"; return Promise.resolve(item); },
                selection: function () { return { audioId: 11, subtitleId: 21 }; },
                part: function () { return item.Media[0].Part[0]; },
                quality: function () { return { source: item.Media[0], stream: item.Media[0], mode: "direct", limit: "original" }; },
                tracks: function () { return []; },
                setSubtitleOffset: function (offset) { callbacks.subtitleOffset = offset; }
            };
        }
    };
    var client = {
        nextEpisode: function () {
            return Promise.resolve({ ratingKey: "synthetic-next", type: "episode", title: "Next Synthetic Episode",
                grandparentTitle: "Synthetic Show", parentIndex: 2, index: 5,
                thumb: "/library/metadata/next/thumb" });
        },
        getMetadata: function () { return Promise.resolve({ ratingKey: "synthetic-next", type: "episode", title: "Next Synthetic Episode" }); },
        image: function () { return Promise.reject(new Error("No image request is permitted in this fixture")); }
    };
    var source = fs.readFileSync(path.join(root, "samsung/PlexTv/main.js"), "utf8");
    var boot = source.lastIndexOf('    addConnectForm("");');
    assert(boot !== -1, "The app boot boundary remains available to isolated UI tests");
    source = source.slice(0, boot) +
        '    startPlayer(' + JSON.stringify(item) + ', window.__syntheticClient, 45000, 0, ' +
        JSON.stringify(trackOptions || null) + '); }());';
    window.__syntheticClient = client;
    vm.runInNewContext(source, {
        document: window.document,
        window: window,
        navigator: window.navigator,
        console: console,
        Promise: Promise,
        URL: window.URL,
        Blob: window.Blob,
        setTimeout: function (callback, delay) {
            var id = timersNext++;
            timers.push({ id: id, callback: callback, delay: delay, interval: false });
            return id;
        },
        clearTimeout: function (id) { timers.forEach(function (timer) { if (timer.id === id) { timer.callback = null; } }); },
        setInterval: function (callback, delay) {
            var id = timersNext++;
            timers.push({ id: id, callback: callback, delay: delay, interval: true });
            return id;
        },
        clearInterval: function (id) { timers.forEach(function (timer) { if (timer.id === id) { timer.callback = null; } }); }
    });
    function findButton(label, scope) {
        return Array.prototype.slice.call((scope || window.document).querySelectorAll("button")).filter(function (button) {
            return button.textContent.trim() === label;
        })[0] || null;
    }
    function click(label, scope) {
        var control = findButton(label, scope);
        assert(control, "Missing button: " + label);
        control.click();
        return control;
    }
    function key(code, repeat) {
        var event = new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, repeat: !!repeat });
        Object.defineProperty(event, "keyCode", { value: code });
        window.document.dispatchEvent(event);
    }
    async function settle() { for (var i = 0; i < 8; i += 1) { await Promise.resolve(); } }
    return {
        dom: dom, window: window, document: window.document, callbacks: callbacks, seeks: seeks,
        starts: function () { return starts; }, plays: function () { return plays; },
        adapters: function () { return adapters; },
        playerSettings: playerSettings, timers: timers,
        findButton: findButton, click: click, key: key, settle: settle
    };
}

async function hudAndPanels() {
    var app = playerFixture();
    try {
        var controls = Array.prototype.slice.call(app.document.querySelectorAll(".playback-controls button"))
            .map(function (button) { return button.textContent.trim(); });
        ["Subtitles", "Audio", "More"].forEach(function (name) {
            assert(controls.indexOf(name) !== -1, "The transport exposes " + name + " directly");
        });
        assert(app.findButton("Info"), "The HUD includes an Info tab");
        assert(app.findButton("Chapters"), "An item with chapter metadata includes a Chapters tab");
        assert(app.document.querySelector(".playback-remaining"), "The HUD shows a negative time-left clock");
        assert(app.document.querySelector(".playback-context").textContent.indexOf("Synthetic Show") !== -1,
            "The episode HUD identifies its show");

        app.click("Info");
        var info = app.document.querySelector("#player-info");
        assert(info && info.textContent.indexOf("Synthetic Show") !== -1, "Info shows playing-item context");
        assert(info.querySelector(".info-artwork"), "Info uses the item's artwork");
        assert(info.textContent.indexOf("TV-PG") !== -1, "Info includes its rating");
        app.callbacks.avplay.onEvent({ type: "time", position: 50000, duration: item.duration });
        assert(info.querySelector(".player-info-position").textContent.indexOf("0:50") !== -1,
            "The Info playback facts follow the live playback position");

        app.click("Chapters");
        var cards = app.document.querySelectorAll("#chapter-strip .chapter-card");
        assert.strictEqual(cards.length, 3, "The chapter strip renders the chapter list");
        assert.strictEqual(cards[1].querySelector("img").getAttribute("data-artwork-source"), "/chapter/discovery",
            "Chapter cards use Plex Chapter.thumb");
        assert(cards[2].textContent.indexOf("00:40") !== -1, "Chapter cards show their timestamps");
    } finally { app.dom.window.close(); }
}

async function upNextAndTracks() {
    var app = playerFixture();
    try {
        app.callbacks.avplay.onEvent({ type: "time", position: 56000, duration: item.duration });
        await app.settle();
        assert(app.document.querySelector(".up-next-card"), "Final credits reveal the Up Next card");
        assert(app.findButton("Watch Credits"), "The viewer can choose to watch credits");
        assert(app.findButton("Next Episode"), "The next-episode action is explicit");
        assert(app.document.querySelector(".up-next-countdown"), "Up Next shows its countdown");

        app.click("Audio");
        assert(app.findButton("English"), "Tracks open on a language-selection step");
        assert(app.findButton("Other languages"), "Other languages remain discoverable");
        assert(app.findButton("Subtitles off"), "Subtitles off is available from the menu");
        app.click("English");
        assert(app.findButton("English — Stereo"), "A language step lists tracks within that language");
        assert(app.findButton("Back to languages"), "The track language step has an explicit return");
        app.click("Back to languages");
        app.click("Other languages");
        assert(app.findButton("French"), "Other languages opens the remaining language choices");
        app.click("French");
        assert(app.findButton("French"), "The selected language step lists its matching track");
    } finally { app.dom.window.close(); }
}

async function timingStatsAndErrors() {
    var app = playerFixture({ cues: [
        { start: 44000, end: 44999, text: "Earlier cue" },
        { start: 45000, end: 46000, text: "Current cue" }
    ] });
    try {
        app.callbacks.avplay.onEvent({ type: "time", position: 45000, duration: item.duration });
        assert.strictEqual(app.document.getElementById("subtitle-text").textContent, "Current cue");
        app.click("Subtitles");
        app.click("Subtitle timing");
        var timing = app.document.querySelector(".subtitle-timing");
        assert(timing, "Subtitle timing opens a live on-screen capsule");
        var before = timing.textContent;
        app.key(39);
        assert.notStrictEqual(timing.textContent, before, "RIGHT changes the subtitle offset live");
        assert.strictEqual(timing.querySelector(".subtitle-timing-value").textContent, "+0.1 s",
            "A fresh LG timing key advances exactly 100 ms");
        assert.strictEqual(app.document.getElementById("subtitle-text").textContent, "Earlier cue",
            "The live delay immediately changes the rendered text subtitle");
        for (var repeat = 0; repeat < 8; repeat += 1) { app.key(39, true); }
        assert.strictEqual(timing.querySelector(".subtitle-timing-value").textContent, "+1.3 s",
            "The eighth held repeat advances by the LG 500 ms fast step");
        app.key(13);
        assert(!app.document.querySelector(".subtitle-timing"), "OK closes subtitle timing");

        app.click("More");
        app.click("Stats for nerds");
        assert(app.document.querySelector(".playback-stats"), "Stats for nerds opens a playback overlay");
        app.callbacks.avplay.onEvent({ type: "time", position: 51000, duration: item.duration });
        assert(app.document.querySelector(".playback-stats-position").textContent.indexOf("0:51") !== -1,
            "Stats follow the live playback position");

        app.callbacks.avplay.onEvent({ type: "error", detail: "Synthetic decoder failure" });
        var error = app.document.querySelector(".playback-error");
        assert(error, "A playback error owns a recovery panel");
        assert(error.querySelectorAll("button").length > 0, "The recovery panel offers actionable controls");
        assert(Array.prototype.some.call(error.querySelectorAll("button"), function (button) {
            return /back/i.test(button.textContent);
        }), "The recovery panel always offers Back");
    } finally { app.dom.window.close(); }
}

async function subtitleTimingUsesTrackBounds() {
    var sidecar = playerFixture({ cues: [], subtitleSidecar: true, initialDelay: 60000 });
    try {
        sidecar.click("Subtitles");
        sidecar.click("Subtitle timing");
        sidecar.key(39);
        assert.strictEqual(sidecar.document.querySelector(".subtitle-timing-value").textContent, "+60.0 s",
            "Sidecar timing clamps at the LG +60 s bound");
        sidecar.key(37);
        assert.strictEqual(sidecar.document.querySelector(".subtitle-timing-value").textContent, "+59.9 s",
            "Sidecar timing can move earlier by one 100 ms step");
    } finally { sidecar.dom.window.close(); }

    var sidecarMinimum = playerFixture({ cues: [], subtitleSidecar: true, initialDelay: -60000 });
    try {
        sidecarMinimum.click("Subtitles");
        sidecarMinimum.click("Subtitle timing");
        sidecarMinimum.key(37);
        assert.strictEqual(sidecarMinimum.document.querySelector(".subtitle-timing-value").textContent, "-60.0 s",
            "Sidecar timing clamps at the LG -60 s bound");
        sidecarMinimum.key(39);
        assert.strictEqual(sidecarMinimum.document.querySelector(".subtitle-timing-value").textContent, "-59.9 s",
            "Sidecar timing can move later by one 100 ms step");
    } finally { sidecarMinimum.dom.window.close(); }

    var embedded = playerFixture({ cues: [], subtitleSidecar: false, initialDelay: 0 });
    try {
        embedded.click("Subtitles");
        embedded.click("Subtitle timing");
        embedded.key(37);
        assert.strictEqual(embedded.document.querySelector(".subtitle-timing-value").textContent, "0.0 s",
            "Embedded text subtitles cannot advance before their not-yet-read cues");
    } finally { embedded.dom.window.close(); }
}

async function subtitleTimingZeroDetentAndTrackAvailability() {
    var sidecar = playerFixture({ cues: [], subtitleSidecar: true, initialDelay: 100 });
    try {
        sidecar.click("Subtitles");
        sidecar.click("Subtitle timing");
        for (var repeat = 0; repeat < 8; repeat += 1) { sidecar.key(37, true); }
        assert.strictEqual(sidecar.document.querySelector(".subtitle-timing-value").textContent, "0.0 s",
            "The held-key sweep detents at zero rather than crossing immediately");
        sidecar.key(37);
        assert.strictEqual(sidecar.document.querySelector(".subtitle-timing-value").textContent, "-0.1 s",
            "A fresh press passes through the zero detent");
    } finally { sidecar.dom.window.close(); }

    var native = playerFixture({ cues: null, subtitleId: 21 });
    try {
        native.click("Subtitles");
        assert.strictEqual(native.findButton("Subtitle timing"), null,
            "Device-native subtitles are not offered a live app-overlay timing control");
        native.click("More");
        assert.strictEqual(native.findButton("Subtitle timing"), null,
            "Device-native subtitle timing is also absent from the More menu");
    } finally { native.dom.window.close(); }
}

async function failedPlayerRecoveryRestartsThePipeline() {
    var app = playerFixture({ cues: [], subtitleSidecar: true, audioId: 11, subtitleId: 21, failFirstStart: true });
    try {
        await app.settle();
        assert(app.document.querySelector(".playback-error"), "A failed startup offers recovery");
        app.click("Retry playback");
        await app.settle();
        assert.strictEqual(app.starts(), 2, "Retry creates and starts a fresh player pipeline");
        assert.strictEqual(app.plays(), 0, "Retry does not call play on the failed AVPlay instance");
        assert.strictEqual(app.playerSettings[1].audioId, 11, "Retry preserves the selected audio stream");
        assert.strictEqual(app.playerSettings[1].subtitleId, 21, "Retry preserves the selected subtitle stream");
        assert.strictEqual(app.playerSettings[1].offset, 45000, "Retry preserves the failed session position");
        assert.strictEqual(app.adapters(), 2, "Retry allocates a fresh AVPlay adapter");
        assert.strictEqual(app.playerSettings[1].subtitleSidecar, true, "Retry preserves sidecar identity");
        app.callbacks.avplay.onEvent({ type: "error", detail: "Synthetic decoder failure" });
        app.click("Restart");
        await app.settle();
        assert.strictEqual(app.starts(), 3, "Restart also resolves and starts a fresh pipeline");
        assert.strictEqual(app.playerSettings[2].offset, 0, "Restart starts the fresh pipeline at zero");
        assert.strictEqual(app.playerSettings[2].audioId, 11, "Restart preserves explicit audio selection");
        assert.strictEqual(app.playerSettings[2].subtitleId, 21, "Restart preserves explicit subtitle selection");
        assert.strictEqual(app.adapters(), 3, "Restart allocates another fresh AVPlay adapter");
    } finally { app.dom.window.close(); }
}

async function run() {
    await hudAndPanels();
    await upNextAndTracks();
    await timingStatsAndErrors();
    await subtitleTimingUsesTrackBounds();
    await subtitleTimingZeroDetentAndTrackAvailability();
    await failedPlayerRecoveryRestartsThePipeline();
    console.log("Tizen LG-style player HUD, panels, Up Next, tracks, timing, stats and recovery: passed (synthetic player)");
}
run().catch(function (error) { console.error(error.stack || error); process.exitCode = 1; });
