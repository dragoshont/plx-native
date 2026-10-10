"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/PlexTv");
var movie = {
    ratingKey: "10", type: "movie", title: "Synthetic Movie", duration: 100000,
    summary: "Synthetic metadata", Chapter: [{ startTimeOffset: 20000, tag: "Chapter one" }],
    Marker: [{ type: "intro", startTimeOffset: 0, endTimeOffset: 5000 }],
    Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", videoResolution: "1080",
        Part: [{ id: "20", key: "/library/parts/20/file.mp4", Stream: [{ id: 1, streamType: 2, codec: "aac" }] }] }]
};
async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var requests = [];
    var nativeCalls = [];
    var state = "NONE";
    var position = 0;
    var listener;
    window.webapis = { avplay: {
        getState: function () { return state; },
        open: function () { nativeCalls.push("open"); state = "IDLE"; },
        close: function () { nativeCalls.push("close"); state = "NONE"; },
        stop: function () { nativeCalls.push("stop"); state = "IDLE"; },
        setDisplayRect: function () {}, setDisplayMethod: function () {},
        setListener: function (value) { listener = value; },
        prepareAsync: function (success) { state = "READY"; success(); },
        getDuration: function () { return movie.duration; },
        getCurrentTime: function () { return position; },
        play: function () { nativeCalls.push("play"); state = "PLAYING"; },
        pause: function () { nativeCalls.push("pause"); state = "PAUSED"; },
        seekTo: function (time, success) { position = time; success(); },
        getTotalTrackInfo: function () { return [{ type: "AUDIO", index: 0 }]; },
        setSelectTrack: function () {}, setSilentSubtitle: function () {}
    } };
    window.fetch = function (target, options) {
        var url = new URL(target);
        requests.push({ path: url.pathname, query: url.searchParams, method: options.method });
        var container;
        if (url.pathname === "/library/sections") {
            container = { size: 1, Directory: [{ key: "1", type: "movie", title: "Movies" }] };
        } else if (url.pathname === "/hubs/promoted") {
            container = { size: 1, Hub: [{ title: "Continue Watching", Metadata: [movie] }] };
        } else if (url.pathname === "/library/sections/1/all") {
            var start = Number(url.searchParams.get("X-Plex-Container-Start"));
            var size = Number(url.searchParams.get("X-Plex-Container-Size"));
            if (url.searchParams.get("includeMeta")) {
                container = { Meta: { Type: [{ active: true, Sort: [{ key: "titleSort", title: "Title" }], Filter: [] }] } };
            } else {
                container = { offset: start, totalSize: 250, Metadata: [] };
                for (var i = start; i < Math.min(250, start + size); i += 1) {
                    container.Metadata.push(Object.assign({}, movie, { ratingKey: String(i + 10), title: "Movie " + i }));
                }
            }
        } else if (url.pathname === "/library/metadata/10") { container = { Metadata: [movie] }; }
        else if (url.pathname === "/hubs/search") { container = { Hub: [{ title: "Movies", Metadata: [movie] }] }; }
        else if (url.pathname === "/video/:/transcode/universal/decision") { container = { generalDecisionCode: 1001 }; }
        else if (url.pathname === "/:/timeline" || url.pathname === "/video/:/transcode/universal/stop") { container = {}; }
        else if (url.pathname === "/library/parts/20") {
            assert.strictEqual(options.method, "PUT");
            assert.strictEqual(url.searchParams.get("allParts"), "1");
            assert.strictEqual(url.searchParams.get("subtitleStreamID"), "0");
            assert(!url.searchParams.has("audioStreamID"), "Preserve default audio when no audio switch is requested");
            container = {};
        }
        else if (url.pathname === "/:/scrobble" || url.pathname === "/:/unscrobble") {
            assert.strictEqual(options.method, "GET");
            assert.strictEqual(url.searchParams.get("key"), "10");
            assert.strictEqual(url.searchParams.get("identifier"), "com.plexapp.plugins.library");
            container = {};
        }
        else if (url.pathname === "/actions/removeFromContinueWatching") {
            assert.strictEqual(options.method, "PUT");
            assert.strictEqual(url.searchParams.get("ratingKey"), "10");
            assert(!url.searchParams.has("time"), "Hiding a tile is not clearing its resume point");
            container = {};
        }
        else { return Promise.resolve({ ok: false, status: 404 }); }
        return Promise.resolve({
            ok: true, status: 200,
            json: function () { return Promise.resolve({ MediaContainer: container }); }
        });
    };
    ["js/plex-api.js", "js/avplay.js", "js/playback.js", "js/subtitles.js", "js/preferences.js", "js/session.js", "js/i18n.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    function click(text) {
        var control = Array.from(window.document.querySelectorAll("button")).find(function (node) {
            return node.textContent === text;
        });
        assert(control, "Missing control: " + text);
        assert(!control.disabled, "Disabled control: " + text);
        control.click();
    }
    function clickPlay() {
        var hasRestart = Array.from(window.document.querySelectorAll("button")).some(function (node) {
            return node.textContent === "Play from beginning";
        });
        click(hasRestart ? "Play from beginning" : "Play");
    }
    async function settle() {
        for (var i = 0; i < 30; i += 1) { await Promise.resolve(); }
        await new Promise(function (resolve) { window.setTimeout(resolve, 0); });
    }
    try {
        window.document.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
        click("Connect");
        await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 1);
        assert.strictEqual(nativeCalls.length, 0, "Home must not start playback");
        click("Movies");
        await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 50);
        for (var page = 0; page < 4; page += 1) { click("Load more"); await settle(); }
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 200, "Bound DOM and metadata retained after 250 items");
        click("Back to Home");
        await settle();
        click("Search");
        window.document.querySelector('input[type="search"]').value = "Synthetic";
        click("Search");
        await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 1);
        window.document.querySelector(".media-card").click();
        await settle();
        assert(window.document.querySelector(".synopsis").textContent.includes("Synthetic metadata"));
        assert.strictEqual(requests.filter(function (request) { return request.path === "/:/timeline"; }).length, 0);
        var mutations = function () {
            return requests.filter(function (request) {
                return ["/:/scrobble", "/:/unscrobble", "/actions/removeFromContinueWatching"].indexOf(request.path) !== -1;
            });
        };
        click("Mark unwatched");
        assert(window.document.body.textContent.includes("saved resume position"));
        assert.strictEqual(mutations().length, 0, "Opening a confirmation must not mutate Plex");
        click("Cancel");
        await settle();
        assert.strictEqual(mutations().length, 0, "Cancellation must not mutate Plex");
        click("Mark watched");
        click("Confirm mark watched");
        Array.from(window.document.querySelectorAll("button")).find(function (node) {
            return node.textContent === "Confirm mark watched";
        }).click();
        await settle();
        assert.strictEqual(mutations().length, 1, "Repeated confirmation must produce exactly one write");
        click("Mark unwatched");
        click("Confirm mark unwatched");
        await settle();
        click("Remove from Continue Watching");
        click("Confirm remove from continue watching");
        await settle();
        assert.deepStrictEqual(mutations().map(function (request) { return request.path; }),
            ["/:/scrobble", "/:/unscrobble", "/actions/removeFromContinueWatching"]);
        clickPlay();
        await settle();
        assert.strictEqual(state, "PLAYING");
        assert.strictEqual(window.document.body.className, "playing");
        listener.oncurrentplaytime(12000);
        assert(window.document.getElementById("playback-time").textContent.startsWith("0:12"));
        click("Pause / Play");
        await settle();
        assert.strictEqual(state, "PAUSED");
        click("Forward 30 seconds");
        await settle();
        assert.strictEqual(position, 42000);
        click("Chapters and markers");
        click("Chapter one");
        await settle();
        assert.strictEqual(position, 20000);
        click("Close menu");
        click("Stop and return to details");
        await settle();
        assert.strictEqual(state, "NONE");
        assert.strictEqual(window.document.body.className, "");
        var writes = requests.filter(function (request) { return request.path === "/:/timeline"; });
        assert(writes.every(function (request) { return request.method === "POST"; }));
        assert(writes.some(function (request) { return request.query.get("state") === "stopped" && request.query.get("time") === "20000"; }));
        clickPlay(); await settle();
        Object.defineProperty(window.document, "hidden", { configurable: true, value: true });
        window.document.dispatchEvent(new window.Event("visibilitychange")); await settle();
        assert.strictEqual(state, "NONE", "Backgrounding must stop native playback");
        var opens = nativeCalls.filter(function (call) { return call === "open"; }).length;
        Object.defineProperty(window.document, "hidden", { configurable: true, value: false });
        window.document.dispatchEvent(new window.Event("visibilitychange")); await settle();
        assert.strictEqual(nativeCalls.filter(function (call) { return call === "open"; }).length, opens,
            "Foregrounding must never start playback automatically");
        assert(window.document.querySelector(".synopsis"), "Foreground recovery must restore fresh details");
        assert.strictEqual(window.localStorage.length, 1, "Only the non-secret device identifier is stored");
        console.log("Tizen host DOM product journey: 250-item browse/search/details/playback/progress passed");
    } finally { dom.window.close(); }
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
