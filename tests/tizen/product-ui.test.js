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
        Part: [{ id: "20", key: "/library/parts/20/file.mp4", Stream: [
            { id: 1, streamType: 2, codec: "aac" },
            { id: 42, streamType: 3, codec: "srt", language: "English", key: "/library/streams/42" }
        ] }] }]
};
var onDeck = Object.assign({}, movie, { ratingKey: "99", type: "episode", title: "Next episode", viewOffset: 20000 });
async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    window.TextDecoder = TextDecoder;
    var requests = [];
    var nativeCalls = [];
    var state = "NONE";
    var position = 0;
    var listener;
    var hudTimers = new Map();
    var hudTimerId = 100000;
    var realSetTimeout = window.setTimeout.bind(window);
    var realClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = function (callback, delay) {
        if (delay === 5000) { hudTimers.set(++hudTimerId, callback); return hudTimerId; }
        return realSetTimeout(callback, delay);
    };
    window.clearTimeout = function (id) {
        if (hudTimers.has(id)) { hudTimers.delete(id); } else { realClearTimeout(id); }
    };
    function hideHud() {
        assert.strictEqual(hudTimers.size, 1, "Playback must arm exactly one five-second HUD timer");
        var callbacks = Array.from(hudTimers.values());
        hudTimers.clear();
        callbacks[0]();
    }
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
        else if (url.pathname === "/library/sections/1/collections") {
            var collectionStart = Number(url.searchParams.get("X-Plex-Container-Start") || 0);
            container = { offset: collectionStart, totalSize: 51, Metadata: [] };
            for (var c = collectionStart; c < Math.min(51, collectionStart + 50); c += 1) {
                container.Metadata.push(Object.assign({}, movie, { title: "Collection title " + c }));
            }
        }
        else if (url.pathname === "/library/metadata/99") { container = { Metadata: [onDeck] }; }
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
        else if (url.pathname === "/library/streams/42") {
            var subtitleBytes = Buffer.from("1\n00:00:01,000 --> 00:00:02,500\nSynthetic caption");
            return Promise.resolve({ ok: true, status: 200, body: new ReadableStream({
                start: function (controller) { controller.enqueue(new Uint8Array(subtitleBytes)); controller.close(); }
            }) });
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
    ["js/plex-api.js", "js/avplay.js", "js/playback.js", "js/subtitles.js", "js/preferences.js",
        "js/session.js", "js/item-menu.js", "js/file-info.js", "js/i18n.js", "main.js"].forEach(function (file) {
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
        assert(window.document.querySelector('.home-navigation button[aria-current="page"]'),
            "Home must be a real selected destination alongside the libraries");
        assert.strictEqual(window.document.querySelectorAll(".home-hero-description").length, 1,
            "The LG-style hero has a short synopsis, not a separate text panel");
        assert(window.document.querySelector(".home-hero .home-feature-primary"),
            "The feature needs a distinct primary action");
        assert(window.document.querySelector(".account-control"),
            "Utilities must be reachable from the top navigation");
        var selectedHome = window.document.querySelector('.home-navigation button[aria-current="page"]');
        selectedHome.focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 40, bubbles: true }));
        assert(window.document.activeElement.classList.contains("home-feature-primary"),
            "Down from Home must reach the feature, not jump over it to a distant poster");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 40, bubbles: true }));
        assert(window.document.activeElement.classList.contains("media-card"),
            "Down from the feature must reach the first shelf");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true }));
        assert(window.document.activeElement.classList.contains("home-feature-primary"),
            "Up from the first shelf restores the visible feature");
        assert(!window.document.querySelector("#screen").classList.contains("shelves-focused"));
        var navigation = window.document.querySelector(".home-navigation");
        assert(navigation, "Home navigation belongs above the shelves, not below them");
        assert(navigation.querySelector(".menu-icon-search"), "Search needs a visible icon");
        assert(window.document.querySelector(".home-utilities .menu-icon-settings"), "Settings needs a visible icon");
        assert(window.document.querySelector(".library-button"), "Library choices need visible labels");
        click("Account");
        assert(window.document.querySelector(".home-utilities .menu-icon-refresh"),
            "Refresh must use its own icon rather than unexplained More dots");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 27, bubbles: true }));
        assert(window.document.querySelector(".home-utilities").hidden,
            "Back must close account controls before leaving Home");
        assert(window.document.activeElement.classList.contains("account-control"));
        click("Account");
        click("Settings");
        assert(window.document.querySelector(".settings-menu"), "Settings uses a grouped menu surface");
        assert(window.document.querySelector('.settings-menu button[aria-pressed]'),
            "Toggle state must be visible independently of focus");
        assert.strictEqual(Array.from(window.document.querySelectorAll(".settings-menu button")).filter(function (node) {
            return node.textContent.indexOf("Transcode quality:") === 0;
        }).length, 1, "Settings must show one quality value, not every alternative");
        click("Transcode quality: 1080p");
        assert.strictEqual(window.document.querySelector('button[aria-pressed="true"]').textContent, "1080p server transcode");
        click("720p server transcode");
        assert(window.document.querySelector(".settings-menu"), "Selecting quality must return to Settings");
        assert.strictEqual(window.document.activeElement.textContent, "Transcode quality: 720p", "Choice pages restore parent focus");
        click("Transcode quality: 720p");
        click("1080p server transcode");
        var skipInterval = Array.from(window.document.querySelectorAll(".settings-menu button")).find(function (node) {
            return node.textContent === "Skip interval: 10 seconds";
        });
        skipInterval.focus();
        skipInterval.click();
        click("15 seconds");
        assert.strictEqual(window.document.activeElement.textContent, "Skip interval: 15 seconds");
        var autoNext = Array.from(window.document.querySelectorAll(".settings-menu button")).find(function (node) {
            return node.textContent === "Auto-play next episode: Off";
        });
        autoNext.focus();
        autoNext.click();
        assert.strictEqual(window.document.activeElement.textContent, "Auto-play next episode: On",
            "Changing a preference must retain remote focus on that row");
        assert.strictEqual(window.document.activeElement.getAttribute("aria-pressed"), "true");
        click("Auto-play next episode: On");
        click("Back");
        await settle();
        click("Movies");
        await settle();
        click("Account");
        assert(!window.document.querySelector(".home-utilities").hidden,
            "Account must open the same utility panel in a library, not jump to Settings");
        assert(!window.document.querySelector(".settings-menu"));
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 27, bubbles: true }));
        assert(window.document.querySelector(".home-utilities").hidden);
        assert(window.document.activeElement.classList.contains("account-control"));
        await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 50);
        assert(window.document.querySelector(".screen-library .page-toolbar"), "Browse tools belong to one navigation row");
        click("Sort and filters");
        await settle();
        assert(window.document.querySelector(".screen-filters .menu-icon-sort-asc"));
        assert(window.document.querySelector(".screen-filters .menu-icon-sort-desc"));
        assert(window.document.querySelector(".screen-filters .menu-icon-sort-asc").textContent.indexOf("Ascending") !== -1);
        assert.strictEqual(window.document.querySelector(".screen-filters .menu-icon-more"), null,
            "Filter choices must not impersonate More menus");
        click("Back");
        await settle();
        var retainedCard = window.document.querySelectorAll(".media-card")[30];
        retainedCard.focus();
        click("Load more"); await settle();
        assert.strictEqual(window.document.activeElement.plexCard.item.ratingKey, retainedCard.plexCard.item.ratingKey,
            "Appending a page must preserve the focused title, not leave focus on the removed node");
        for (var page = 0; page < 3; page += 1) { click("Load more"); await settle(); }
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 200, "Bound DOM and metadata retained after 250 items");
        click("Collections");
        await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 50);
        window.document.querySelector(".media-card").click();
        await settle();
        click("Back");
        await settle();
        assert(Array.from(window.document.querySelectorAll("button")).some(function (node) {
            return node.textContent === "Load more";
        }), "Returning from details must preserve the listing's remaining pages");
        click("Load more");
        await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 51,
            "Collection pages must advance rather than append the first page again");
        click("Back");
        await settle();
        click("Back to Home");
        await settle();
        click("Search");
        var searches = requests.filter(function (request) { return request.path === "/hubs/search"; }).length;
        click("Search"); await settle();
        assert.strictEqual(requests.filter(function (request) { return request.path === "/hubs/search"; }).length, searches,
            "Empty search must explain the missing title without requesting every library");
        window.document.querySelector('input[type="search"]').value = "Synthetic";
        click("Search");
        await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 1);
        window.document.querySelector(".media-card").click();
        await settle();
        assert(window.document.querySelector(".synopsis").textContent.includes("Synthetic metadata"));
        assert(window.document.querySelector(".detail-expand"),
            "A clamped synopsis must have a full-description route");
        assert(window.document.querySelector(".detail-overflow[hidden]"),
            "Secondary detail actions must not form a visible wall of pills");
        click("Read more");
        assert(window.document.querySelector(".detail-synopsis").classList.contains("expanded"));
        click("Read less");
        assert.strictEqual(requests.filter(function (request) { return request.path === "/:/timeline"; }).length, 0);
        click("More");
        click("File information");
        var fileInfo = window.document.querySelector(".file-info-panel");
        assert(fileInfo && !fileInfo.hidden, "The detail inspector opens as a separate read-only panel");
        assert(fileInfo.textContent.includes("Version 1 / Container: mp4"));
        assert(!fileInfo.textContent.includes("Size:"), "Unreported file size must be omitted rather than called zero");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 27, bubbles: true }));
        assert(fileInfo.hidden, "Back closes the inspector without leaving item details");
        var mutations = function () {
            return requests.filter(function (request) {
                return ["/:/scrobble", "/:/unscrobble", "/actions/removeFromContinueWatching"].indexOf(request.path) !== -1;
            });
        };
        click("More");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 27, bubbles: true }));
        assert(window.document.querySelector(".detail-overflow").hidden);
        assert.strictEqual(window.document.activeElement.getAttribute("aria-label"), "More");
        click("More");
        click("Mark unwatched");
        assert(window.document.body.textContent.includes("saved resume position"));
        assert.strictEqual(mutations().length, 0, "Opening a confirmation must not mutate Plex");
        click("Cancel");
        await settle();
        assert.strictEqual(mutations().length, 0, "Cancellation must not mutate Plex");
        click("More");
        click("Mark watched");
        click("Confirm mark watched");
        Array.from(window.document.querySelectorAll("button")).find(function (node) {
            return node.textContent === "Confirm mark watched";
        }).click();
        await settle();
        assert.strictEqual(mutations().length, 1, "Repeated confirmation must produce exactly one write");
        click("More");
        click("Mark unwatched");
        click("Confirm mark unwatched");
        await settle();
        click("More");
        click("Remove from Continue Watching");
        click("Confirm remove from continue watching");
        await settle();
        assert.deepStrictEqual(mutations().map(function (request) { return request.path; }),
            ["/:/scrobble", "/:/unscrobble", "/actions/removeFromContinueWatching"]);
        clickPlay();
        await settle();
        assert.strictEqual(state, "PLAYING");
        assert.strictEqual(window.document.body.className, "playing");
        assert.strictEqual(window.document.querySelector(".playback-controls").querySelectorAll("button").length, 4,
            "Playback should expose only transport and More on the main overlay");
        var pauseControl = Array.from(window.document.querySelectorAll("button")).find(function (node) {
            return node.textContent === "Pause / Play";
        });
        pauseControl.focus();
        hideHud();
        assert.strictEqual(window.document.querySelector(".player-hud").hidden, true,
            "Controls must disappear during uninterrupted playback");
        assert(window.document.querySelector(".app-shell").classList.contains("hud-hidden"),
            "The non-error status must disappear with the playback controls");
        var plays = nativeCalls.filter(function (call) { return call === "pause"; }).length;
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 13, bubbles: true }));
        assert.strictEqual(window.document.querySelector(".player-hud").hidden, false, "OK reveals hidden controls");
        assert.strictEqual(window.document.activeElement, pauseControl, "Revealing the HUD restores its focused control");
        assert.strictEqual(nativeCalls.filter(function (call) { return call === "pause"; }).length, plays,
            "Revealing controls must not also activate the focused button");
        hideHud();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 19, bubbles: true }));
        await settle();
        assert.strictEqual(state, "PAUSED", "Media Pause must still work while the HUD is hidden");
        assert.strictEqual(hudTimers.size, 0);
        click("Pause / Play");
        await settle();
        assert.strictEqual(state, "PLAYING");
        click("More");
        assert.strictEqual(hudTimers.size, 0);
        click("Close menu");
        hideHud();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 40, bubbles: true }));
        assert.strictEqual(window.document.querySelector(".player-hud").hidden, false);
        listener.oncurrentplaytime(12000);
        assert(window.document.getElementById("playback-time").textContent.startsWith("0:12"));
        assert.strictEqual(window.document.querySelector(".playback-progress").getAttribute("aria-valuenow"), "12");
        listener.onbufferingstart();
        assert.strictEqual(hudTimers.size, 0, "Buffering must keep controls visible");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 40, bubbles: true }));
        assert.strictEqual(hudTimers.size, 0, "Remote activity during buffering must not arm hiding");
        listener.onbufferingcomplete();
        assert.strictEqual(hudTimers.size, 1, "Buffering completion must restart hiding");
        click("Pause / Play");
        await settle();
        assert.strictEqual(state, "PAUSED");
        assert.strictEqual(hudTimers.size, 0, "Paused playback must not hide its controls");
        click("Forward 15 seconds");
        await settle();
        assert.strictEqual(position, 27000);
        await new Promise(function (resolve) { window.setTimeout(resolve, 200); });
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 417, bubbles: true }));
        await settle();
        assert.strictEqual(position, 42000, "The remote fast-forward key uses the saved 15-second interval");
        click("More");
        click("Chapters and markers");
        assert.strictEqual(hudTimers.size, 0, "An open menu must suspend HUD hiding");
        click("Chapter one");
        await settle();
        assert.strictEqual(position, 20000);
        click("Close menu");
        click("More");
        click("Audio and subtitles");
        click("Text size: medium");
        assert(window.document.querySelector(".player-menu").textContent.includes("Text size: large"),
            "Caption style controls update the persisted selection");
        click("Text overlay / English");
        await settle();
        var subtitleOverlay = window.document.getElementById("subtitle-text");
        assert(subtitleOverlay.classList.contains("subtitle-size-large"),
            subtitleOverlay.className + " | " + window.document.getElementById("status").textContent);
        assert(subtitleOverlay.classList.contains("subtitle-position-low"));
        listener.oncurrentplaytime(1000);
        assert.strictEqual(subtitleOverlay.textContent, "Synthetic caption",
            "The owned external text renderer applies the selected cue at the playback position");
        click("More");
        click("Stop and return to details");
        await settle();
        assert.strictEqual(state, "NONE");
        assert.strictEqual(window.document.body.className, "");
        assert.strictEqual(hudTimers.size, 0, "Teardown must cancel the HUD timer");
        assert(!window.document.querySelector(".app-shell").classList.contains("hud-hidden"));
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
        assert.strictEqual(window.localStorage.length, 2, "Only the device identifier and explicitly saved preferences are stored");
        assert(window.localStorage.getItem("plx-tizen-preferences"));
        assert.strictEqual(window.localStorage.getItem("plx-tizen-account"), null, "Preference changes must not persist account credentials");
        movie.type = "show";
        movie.OnDeck = { Metadata: onDeck };
        click("Back"); await settle();
        window.document.querySelector(".media-card").click(); await settle();
        assert(Array.from(window.document.querySelectorAll("button")).some(function (node) { return node.textContent === "Resume"; }),
            "A show's primary action must resume the server's on-deck episode, not force another season browse");
        click("Resume"); await settle();
        assert.strictEqual(position, 20000);
        assert(requests.some(function (request) { return request.path === "/library/metadata/99"; }),
            "Show playback must resolve the episode identity, never play or update the show itself");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 413, bubbles: true }));
        await settle();
        console.log("Tizen host DOM product journey: browse, subtitle settings, inspector, skip, show playback passed");
    } finally { dom.window.close(); }
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
