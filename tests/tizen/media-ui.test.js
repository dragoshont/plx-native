"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/PlexTv");
var tracks = [1, 2].map(function (id) {
    return { ratingKey: String(id), type: "track", title: "Track " + id, duration: 180000,
        Media: [{ container: "flac", audioCodec: "flac", Part: [{ id: String(20 + id), key: "/library/parts/" + (20 + id) + "/file.flac" }] }] };
});
var album = { ratingKey: "30", type: "album", title: "Synthetic Album" };
var photos = [1, 2].map(function (id) {
    return { ratingKey: String(40 + id), type: "photo", title: "Photo " + id,
        Media: [{ Part: [{ key: "/library/parts/" + (40 + id) + "/file.jpg" }] }] };
});
async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var calls = [];
    var revoked = [];
    var state = "NONE";
    var listener;
    var time = 0;
    window.URL.createObjectURL = function () { return "blob:synthetic-" + calls.length; };
    window.URL.revokeObjectURL = function (url) { revoked.push(url); };
    window.TextDecoder = TextDecoder;
    window.webapis = { avplay: {
        getState: function () { return state; }, open: function () { state = "IDLE"; },
        close: function () { state = "NONE"; }, stop: function () { state = "IDLE"; },
        setDisplayRect: function () {}, setDisplayMethod: function () {}, setListener: function (value) { listener = value; },
        prepareAsync: function (success) { state = "READY"; success(); }, getDuration: function () { return 180000; },
        getCurrentTime: function () { return time; }, play: function () { state = "PLAYING"; },
        pause: function () { state = "PAUSED"; }, seekTo: function (position, success) { time = position; success(); }
    } };
    window.fetch = function (target, options) {
        var url = new URL(target);
        calls.push({ path: url.pathname, method: options.method, query: url.searchParams });
        var container;
        if (url.pathname === "/library/sections") {
            container = { Directory: [{ key: "3", type: "artist", title: "Music" }, { key: "4", type: "photo", title: "Photos" }] };
        } else if (url.pathname === "/hubs/promoted") { container = { Hub: [] }; }
        else if (url.pathname === "/library/sections/3/all") { container = { Metadata: [album], totalSize: 1, offset: 0 }; }
        else if (url.pathname === "/library/sections/4/all") { container = { Metadata: photos, totalSize: 2, offset: 0 }; }
        else if (url.pathname === "/library/metadata/30") { container = { Metadata: [album] }; }
        else if (url.pathname === "/library/metadata/30/children") { container = { Metadata: tracks, totalSize: 2 }; }
        else if (/^\/library\/metadata\/[12]$/.test(url.pathname)) {
            container = { Metadata: [tracks[Number(url.pathname.split("/").pop()) - 1]] };
        } else if (url.pathname === "/music/:/transcode/universal/decision") {
            assert.strictEqual(url.searchParams.get("audioCodec"), "mp3"); container = { generalDecisionCode: 1001 };
        } else if (/^\/library\/parts\/2[12]$/.test(url.pathname) ||
                url.pathname === "/:/timeline" || url.pathname === "/music/:/transcode/universal/stop") { container = {}; }
        else if (url.pathname === "/photo/:/transcode") {
            assert.strictEqual(url.searchParams.get("width"), "1920");
            assert.strictEqual(options.headers["X-Plex-Token"], "");
            return Promise.resolve({ ok: true, status: 200, body: new ReadableStream({
                start: function (controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close(); }
            }) });
        } else { return Promise.resolve({ ok: false, status: 404 }); }
        return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({ MediaContainer: container }); } });
    };
    ["plex-api", "avplay", "playback", "queue", "photos", "subtitles", "preferences", "session", "i18n"].forEach(function (name) {
        window.eval(fs.readFileSync(path.join(app, "js", name + ".js"), "utf8"));
    });
    window.eval(fs.readFileSync(path.join(app, "main.js"), "utf8"));
    function click(label) {
        var node = Array.from(window.document.querySelectorAll("button")).find(function (button) { return button.textContent === label; });
        assert(node, "Missing control: " + label);
        node.click();
    }
    async function settle() {
        for (var i = 0; i < 50; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { window.setTimeout(resolve, 0); });
    }
    try {
        window.document.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        click("Connect"); await settle();
        click("Music"); await settle();
        window.document.querySelector(".media-card").click(); await settle();
        click("Play album"); await settle();
        assert.strictEqual(state, "PLAYING");
        assert(window.document.body.textContent.includes("Track 1"));
        click("Shuffle / On or off"); click("Repeat / Off, one, all");
        listener.onstreamcompleted(); await settle();
        assert(window.document.body.textContent.includes("Track 1"), "Repeat-one must replay the same track");
        click("Next track"); await settle();
        assert(window.document.body.textContent.includes("Track 2"), "Manual next must bypass repeat-one");
        click("Stop and return to details"); await settle();
        click("Back"); await settle();
        click("Back to Home"); await settle();
        click("Photos"); await settle();
        window.document.querySelector(".media-card").click(); await settle();
        var image = window.document.querySelector(".photo-display");
        assert(image.src.startsWith("blob:"));
        image.onload();
        assert.strictEqual(window.document.querySelector(".screen h2").textContent, "Photo 1");
        var timelines = calls.filter(function (call) { return call.path === "/:/timeline"; }).length;
        click("Next photo"); await settle();
        image.onload();
        assert.strictEqual(window.document.querySelector(".screen h2").textContent, "Photo 2");
        click("Back"); await settle();
        assert(revoked.length >= 2, "Viewer transitions and back must release object URLs");
        assert.strictEqual(calls.filter(function (call) { return call.path === "/:/timeline"; }).length, timelines,
            "Viewing/slideshow photos must not write viewing progress");
        console.log("Tizen host music album/queue/repeat/skip and photo viewer cleanup journey: passed");
    } finally { dom.window.close(); }
}
run().catch(function (error) { console.error(error); process.exit(1); });
