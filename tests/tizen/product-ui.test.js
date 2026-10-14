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
    var scrubTimers = new Map();
    var seekTargets = [];
    var hudTimerId = 100000;
    var realSetTimeout = window.setTimeout.bind(window);
    var realClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = function (callback, delay) {
        if (delay === 300) { scrubTimers.set(++hudTimerId, callback); return hudTimerId; }
        if (delay === 5000) { hudTimers.set(++hudTimerId, callback); return hudTimerId; }
        return realSetTimeout(callback, delay);
    };
    window.clearTimeout = function (id) {
        if (scrubTimers.has(id)) { scrubTimers.delete(id); return; }
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
        seekTo: function (time, success) { seekTargets.push(time); position = time; success(); },
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
            assert.strictEqual(url.searchParams.get("subtitleStreamID"), "42",
                "Only the user's explicit text-overlay pick is recorded");
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
        "js/session.js", "js/recents.js", "js/home-hero.js", "js/item-menu.js", "js/skip-markers.js", "js/account-preferences.js", "js/file-info.js", "js/i18n.js", "main.js"].forEach(function (file) {
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
        // Samsung's Return key policy: Back on the app's home page asks before exiting; the app
        // exits only on an explicit Yes. developer.samsung.com/smarttv/develop/guides/fundamentals/
        // terminating-applications.html
        var exits = 0;
        window.tizen = { application: { getCurrentApplication: function () {
            return { exit: function () { exits += 1; } };
        } } };
        function back() {
            window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 10009, bubbles: true }));
        }
        var homeFocus = window.document.querySelector(".home-feature-primary");
        homeFocus.focus();
        back();
        var exitPrompt = window.document.getElementById("player-menu");
        assert(exitPrompt && /exit-prompt/.test(exitPrompt.className), "Back on Home asks before leaving the app");
        assert.strictEqual(exitPrompt.getAttribute("role"), "alertdialog");
        assert.strictEqual(exitPrompt.querySelector("h2").textContent, "Exit app?");
        assert.strictEqual(window.document.activeElement.textContent, "Stay",
            "Stay is focused, so a second accidental OK does not quit");
        assert.strictEqual(window.document.querySelector(".home-track") !== null, true, "Home stays underneath");
        back();
        assert(!window.document.getElementById("player-menu"), "Back dismisses the exit prompt");
        assert.strictEqual(window.document.activeElement, homeFocus, "Dismissing restores the focused Home control");
        assert.strictEqual(exits, 0);
        back();
        click("Stay");
        assert(!window.document.getElementById("player-menu"));
        assert.strictEqual(window.document.activeElement, homeFocus, "Stay restores focus");
        assert.strictEqual(exits, 0, "Only an explicit Exit closes the app");
        back();
        click("Exit");
        assert.strictEqual(exits, 1, "Exit calls tizen.application.getCurrentApplication().exit()");
        delete window.tizen;
        click("Exit");
        assert(window.document.querySelector(".status").textContent.indexOf("Hold Back") !== -1,
            "Without the Tizen Application API, Exit explains the remote's own force-exit");
        click("Stay");
        var selectedHome = window.document.querySelector('.home-navigation button[aria-current="page"]');
        selectedHome.focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 37, bubbles: true }));
        assert(window.document.activeElement.classList.contains("account-control"),
            "Left from the first Home destination must reach Account");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 13, bubbles: true }));
        assert.strictEqual(window.document.activeElement.textContent, "Settings",
            "OK on Account must open its utilities with Settings focused");
        back();
        assert(window.document.activeElement.classList.contains("account-control"),
            "Back from Account utilities must return focus to Account");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true }));
        assert(window.document.activeElement.classList.contains("account-control"),
            "Up at the fixed Home navigation must not jump into a shelf below it");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 39, bubbles: true }));
        assert.strictEqual(window.document.activeElement, selectedHome,
            "Right from Account must return to the selected Home destination");
        window.document.querySelector("#screen").scrollTop = 700;
        window.document.querySelector("#screen").classList.add("shelves-focused");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 40, bubbles: true }));
        assert(window.document.activeElement.classList.contains("home-feature-primary"),
            "Down from Home must reach the feature, not jump over it to a distant poster");
        assert.strictEqual(window.document.querySelector("#screen").scrollTop, 0,
            "Returning to the hero must reset scrolling before focusing its controls");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 40, bubbles: true }));
        assert(window.document.activeElement.classList.contains("media-card"),
            "Down from the feature must reach the first shelf");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true }));
        assert(window.document.activeElement.classList.contains("home-feature-primary"),
            "Up from the first shelf restores the visible feature");
        assert(!window.document.querySelector("#screen").classList.contains("shelves-focused"));
        var firstShelfCard = window.document.querySelector(".shelf-row .media-card");
        var homeScreen = window.document.querySelector("#screen");
        var stubbed = [[firstShelfCard.parentNode.parentNode, { left: 0, top: 800, right: 1920, bottom: 1200 }],
            [window.document.querySelector(".browse-header"), { left: 0, top: 0, right: 1920, bottom: 100 }],
            [homeScreen, { left: 0, top: 0, right: 1920, bottom: 1080 }],
            [firstShelfCard, { left: 100, top: 860, right: 340, bottom: 1220 }]];
        stubbed.forEach(function (pair) {
            pair.push(pair[0].getBoundingClientRect);
            pair[0].getBoundingClientRect = function () { return pair[1]; };
        });
        // After moveHome the card sits under the header; report that so the reveal pass is stable.
        stubbed[3][1] = { left: 100, top: 172, right: 340, bottom: 532 };
        firstShelfCard.focus();
        assert(/translate3d\(0,\s*-688px,\s*0\)/.test(window.document.querySelector(".home-track").style.transform),
            "A shelf below the hero is brought under the header by a GPU transform: " +
            window.document.querySelector(".home-track").style.transform);
        assert.strictEqual(homeScreen.scrollTop, 0,
            "Home must not scroll natively; a native scroll repaints the whole screen on older Tizen engines");
        stubbed.forEach(function (pair) { pair[0].getBoundingClientRect = pair[2]; });
        window.document.querySelector(".home-feature-primary").focus();
        assert(/translate3d\(0,\s*0px,\s*0\)/.test(window.document.querySelector(".home-track").style.transform),
            "Returning to the hero resets the Home track");
        var secondShelf = window.document.createElement("section");
        secondShelf.className = "shelf";
        var secondRow = window.document.createElement("div");
        secondRow.className = "shelf-row";
        var secondShelfCard = window.document.createElement("button");
        secondShelfCard.className = "media-card";
        secondShelfCard.plexCard = firstShelfCard.plexCard;
        secondRow.appendChild(secondShelfCard);
        secondShelf.appendChild(secondRow);
        window.document.querySelector(".home-shelves").appendChild(secondShelf);
        var firstBounds = firstShelfCard.getBoundingClientRect;
        firstShelfCard.getBoundingClientRect = function () {
            return { left: 100, top: -1200, right: 300, bottom: -900, width: 200, height: 300 };
        };
        secondShelfCard.getBoundingClientRect = function () {
            return { left: 100, top: 200, right: 300, bottom: 500, width: 200, height: 300 };
        };
        secondShelfCard.focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true }));
        assert.strictEqual(window.document.activeElement, firstShelfCard,
            "Up from a scrolled shelf must reach the adjacent shelf, not a geometrically nearer fixed nav");
        firstShelfCard.getBoundingClientRect = firstBounds;
        secondShelf.remove();
        window.document.querySelector(".home-feature-primary").focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true }));
        assert.strictEqual(window.document.activeElement, selectedHome,
            "Up from the hero must return to navigation, not the separate Account control");
        var emptyShelf = window.document.createElement("section");
        emptyShelf.className = "shelf";
        var emptyRow = window.document.createElement("div");
        emptyRow.className = "shelf-row";
        emptyShelf.appendChild(emptyRow);
        var shelfPanel = window.document.querySelector(".home-shelves");
        shelfPanel.insertBefore(emptyShelf, shelfPanel.firstChild);
        firstShelfCard.focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 38, bubbles: true }));
        assert(window.document.activeElement.classList.contains("home-feature-primary"),
            "An empty first hub must not trap Up from the first populated shelf");
        emptyShelf.remove();
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
        assert.strictEqual(Array.from(window.document.querySelectorAll(".settings-menu button")).filter(function (node) {
            return node.textContent.indexOf("Quality:") === 0;
        }).length, 1, "Settings must show one quality value, not every alternative");
        click("Quality: Original quality");
        assert.deepStrictEqual(Array.from(window.document.querySelectorAll(".screen button")).map(function (node) {
            return node.textContent; }).slice(0, 6), ["Original quality", "1080p · 20 Mbps (converts)",
            "1080p · 8 Mbps (converts)", "720p · 4 Mbps (converts)", "720p · 2 Mbps (converts)", "480p · 0.7 Mbps (converts)"],
            "Settings offers the LG quality ladder, Original first");
        assert.strictEqual(window.document.querySelector('button[aria-pressed="true"]').textContent, "Original quality",
            "Choice state must be visible independently of focus");
        click("720p · 4 Mbps (converts)");
        assert(window.document.querySelector(".settings-menu"), "Selecting quality must return to Settings");
        assert.strictEqual(window.document.activeElement.textContent, "Quality: 720p · 4 Mbps (converts)", "Choice pages restore parent focus");
        click("Quality: 720p · 4 Mbps (converts)");
        click("Original quality");
        var skipInterval = Array.from(window.document.querySelectorAll(".settings-menu button")).find(function (node) {
            return node.textContent === "Skip interval: 10 seconds";
        });
        skipInterval.focus();
        skipInterval.click();
        click("15 seconds");
        assert.strictEqual(window.document.activeElement.textContent, "Skip interval: 15 seconds");
        var nextEpisode = Array.from(window.document.querySelectorAll(".settings-menu button")).find(function (node) {
            return node.textContent === "Next episode: Countdown during credits";
        });
        nextEpisode.focus();
        nextEpisode.click();
        assert.deepStrictEqual(Array.from(window.document.querySelectorAll(".screen button")).map(function (node) {
            return node.textContent; }).slice(0, 3), ["Countdown during credits", "Play after credits", "Off"]);
        click("Play after credits");
        assert.strictEqual(window.document.activeElement.textContent, "Next episode: Play after credits",
            "Changing a preference must retain remote focus on that row");
        click("Direct play: Auto");
        assert.deepStrictEqual(Array.from(window.document.querySelectorAll(".screen button")).map(function (node) {
            return node.textContent; }).slice(0, 3), ["Auto", "Force", "Off"]);
        click("Auto");
        click("Back");
        await settle();
        click("Movies");
        await settle();
        assert(window.document.activeElement.classList.contains("media-card"),
            "Opening a library must land on its first title, not the Account control");
        assert.strictEqual(window.document.activeElement, window.document.querySelector(".item-list .media-card"));
        var libraryHome = window.document.querySelector(".home-navigation button");
        libraryHome.focus();
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 37, bubbles: true }));
        assert(window.document.activeElement.classList.contains("account-control"),
            "Library headers must retain the same Left path from Home to Account");
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 39, bubbles: true }));
        assert.strictEqual(window.document.activeElement, libraryHome,
            "Right from Account must return to the library header");
        click("Account");
        assert(!window.document.querySelector(".home-utilities").hidden,
            "Account must open the same utility panel in a library, not jump to Settings");
        assert(!window.document.querySelector(".settings-menu"));
        click("Refresh");
        await settle();
        assert(window.document.querySelector(".screen-library"),
            "Refresh from library Account utilities must stay in that library");
        assert.strictEqual(window.document.querySelector('.home-navigation button[aria-current="page"]').textContent, "Movies");
        click("Account");
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
        assert(!window.document.body.textContent.includes("identifiers and permissions"),
            "Search must not open on developer-facing copy");
        var searches = requests.filter(function (request) { return request.path === "/hubs/search"; }).length;
        click("Search"); await settle();
        assert.strictEqual(requests.filter(function (request) { return request.path === "/hubs/search"; }).length, searches,
            "Empty search must explain the missing title without requesting every library");
        window.document.querySelector('input[type="search"]').value = "Synthetic";
        click("Search");
        await settle();
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 1);
        assert(!window.document.body.textContent.includes("identifiers and permissions"),
            "Search results must not show developer-facing copy");
        assert.deepStrictEqual(JSON.parse(window.localStorage.getItem("plx-tizen-recent-searches") || "{}")
            [Object.keys(JSON.parse(window.localStorage.getItem("plx-tizen-recent-searches") || "{}"))[0]], ["Synthetic"],
            "A search that ran is remembered for the profile");
        var searchInput = window.document.querySelector('input[type="search"]');
        searchInput.value = "";
        searchInput.dispatchEvent(new window.Event("input", { bubbles: true }));
        var recentList = window.document.querySelector(".search-recents");
        assert(recentList && !recentList.hidden, "An empty query shows the profile's recent searches");
        assert(recentList.textContent.includes("RECENT SEARCHES"));
        var recentButton = Array.from(recentList.querySelectorAll("button")).filter(function (node) {
            return node.textContent === "Synthetic";
        })[0];
        assert(recentButton, "Each recent search is a focusable control");
        assert(Array.from(recentList.querySelectorAll("button")).some(function (node) {
            return node.textContent === "Clear recent searches";
        }), "Recent searches can be cleared");
        var searchesBefore = requests.filter(function (request) { return request.path === "/hubs/search"; }).length;
        recentButton.click();
        await settle();
        assert.strictEqual(searchInput.value, "Synthetic", "A recent search fills the query");
        assert(requests.filter(function (request) { return request.path === "/hubs/search"; }).length > searchesBefore,
            "A recent search runs the search");
        assert(window.document.querySelector(".search-recents").hidden, "Recents hide once a query is present");
        assert.strictEqual(window.document.querySelectorAll(".media-card").length, 1);
        window.document.querySelector(".media-card").click();
        assert.strictEqual(window.document.activeElement.textContent, "Back",
            "A pending detail request must retain a focused escape control");
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
        assert.strictEqual(window.document.querySelector(".playback-controls").querySelectorAll("button").length, 6,
            "Playback exposes the transport, direct track controls and More on the main overlay");
        var scrubSurface = window.document.querySelector(".playback-progress");
        assert.strictEqual(scrubSurface.getAttribute("role"), "slider",
            "Playback position is a remote-focusable scrub surface, not a passive progress bar");
        assert.strictEqual(scrubSurface.getAttribute("tabindex"), "0",
            "The scrub surface is reachable by remote focus");
        assert.strictEqual(scrubSurface.getAttribute("aria-valuenow"), "0",
            "The slider exposes its current position");
        function remote(type, key, repeat) {
            window.document.dispatchEvent(new window.KeyboardEvent(type, { keyCode: key, repeat: !!repeat, bubbles: true }));
        }
        var playerControls = Array.from(window.document.querySelectorAll(".playback-controls button"));
        assert.strictEqual(window.document.activeElement, playerControls[0], "Playback starts with rewind focused");
        playerControls[1].focus();
        remote("keydown", 38);
        assert.strictEqual(window.document.activeElement, scrubSurface, "Up from transport controls focuses playback position");
        remote("keydown", 40);
        assert.strictEqual(window.document.activeElement, playerControls[1], "Down returns to the transport control that opened the slider");
        var seeksBeforeNavigation = seekTargets.length;
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[2],
            "Right from focused Pause / Play must focus Forward rather than scrub");
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[3], "Right from Forward reaches Subtitles");
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[4], "Right from Subtitles reaches Audio");
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[5], "Right from Audio reaches More");
        remote("keydown", 37);
        assert.strictEqual(window.document.activeElement, playerControls[4], "Left from More returns to Audio");
        remote("keydown", 37);
        assert.strictEqual(window.document.activeElement, playerControls[3], "Left from Audio returns to Subtitles");
        remote("keydown", 37);
        assert.strictEqual(window.document.activeElement, playerControls[2], "Left from Subtitles returns to Forward");
        remote("keydown", 37);
        assert.strictEqual(window.document.activeElement, playerControls[1], "Left from Forward returns to Pause / Play");
        remote("keydown", 37);
        assert.strictEqual(window.document.activeElement, playerControls[0], "Left from Pause / Play reaches rewind");
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[1], "Right returns from rewind to Pause / Play");
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[2], "Right from Pause / Play reaches Forward");
        remote("keydown", 39);
        remote("keydown", 39);
        remote("keydown", 39);
        assert.strictEqual(window.document.activeElement, playerControls[5],
            "Right traverses track controls and Forward to More");
        assert.strictEqual(state, "PLAYING", "Directional traversal must not toggle playback");
        assert.strictEqual(seekTargets.length, seeksBeforeNavigation, "Focused HUD navigation must not seek");
        var seeksBeforeOptions = seekTargets.length;
        remote("keydown", 13);
        assert(window.document.getElementById("player-menu"), "OK on More must open playback options");
        assert.strictEqual(seekTargets.length, seeksBeforeOptions, "Opening More must not seek");
        var firstOption = window.document.activeElement;
        remote("keydown", 39);
        assert.notStrictEqual(window.document.activeElement, firstOption,
            "Directional arrows inside playback options must continue menu navigation");
        assert.strictEqual(seekTargets.length, seeksBeforeOptions, "Menu navigation must not seek");
        remote("keydown", 27);
        assert(!window.document.getElementById("player-menu"), "Back closes playback options");
        assert.strictEqual(window.document.activeElement, playerControls[5],
            "Back from playback options restores focus to More");
        var pauseControl = Array.from(window.document.querySelectorAll("button")).find(function (node) {
            return node.textContent === "Pause / Play";
        });
        pauseControl.focus();
        function arrow(type, key, repeat) {
            window.document.dispatchEvent(new window.KeyboardEvent(type, { keyCode: key, repeat: !!repeat, bubbles: true }));
        }
        hideHud();
        var seekCount = seekTargets.length, originalPosition = position;
        arrow("keydown", 39);
        for (var repeat = 0; repeat < 7; repeat++) { arrow("keydown", 39, true); }
        assert.strictEqual(seekTargets.length, seekCount, "A held arrow must not issue a seek per repeat");
        arrow("keyup", 39); await settle();
        assert.strictEqual(window.document.querySelector(".player-hud").hidden, false,
            "A hidden-HUD seek reveals the controls without redirecting the held input");
        assert.strictEqual(seekTargets.length, seekCount + 1, "Held Right must commit ONE seek on keyup");
        assert(position > originalPosition + 80000, "Held repeats accelerate the pending target");
        for (repeat = 0; repeat < 100; repeat++) { arrow("keydown", 39, repeat > 0); }
        var idleCommit = Array.from(scrubTimers.values())[0];
        assert(idleCommit, "An idle fallback is armed when keyup is lost"); idleCommit(); await settle();
        arrow("keyup", 39);
        assert.strictEqual(position, movie.duration, "Scrub is bounded to duration");
        assert.strictEqual(seekTargets.length, seekCount + 2, "Idle followed by keyup cannot double-commit");
        hideHud();
        for (repeat = 0; repeat < 100; repeat++) { arrow("keydown", 37, repeat > 0); }
        arrow("keyup", 37); await settle();
        assert.strictEqual(position, 0, "Hidden-HUD reverse scrub remains bounded to zero");
        assert.strictEqual(seekTargets.length, seekCount + 3,
            "Hidden-HUD reverse repeats commit one bounded seek");
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
        assert.strictEqual(hudTimers.size, 0, "Paused playback must not arm HUD hiding");
        assert.strictEqual(window.document.querySelector(".player-hud").hidden, false,
            "Pausing keeps the paused controls visible");
        var pausedPosition = position;
        pauseControl.focus();
        remote("keydown", 38);
        assert.strictEqual(window.document.activeElement, scrubSurface,
            "Up from paused transport focuses the scrub slider");
        var pausedSeeks = seekTargets.length;
        for (var pausedRepeat = 0; pausedRepeat < 7; pausedRepeat++) {
            remote("keydown", 39, pausedRepeat > 0);
        }
        assert(Number(scrubSurface.getAttribute("aria-valuenow")) > pausedPosition,
            "Held Right previews the pending scrub position accessibly");
        remote("keyup", 39);
        await settle();
        assert.strictEqual(seekTargets.length, pausedSeeks + 1, "Paused held scrub commits one seek");
        assert(position > pausedPosition && position <= movie.duration, "Paused scrub advances without exceeding duration");
        assert.strictEqual(state, "PAUSED", "Scrubbing while paused leaves playback paused");
        remote("keydown", 13);
        assert.strictEqual(state, "PAUSED", "OK on the slider commits but does not toggle playback");
        remote("keydown", 27);
        assert.strictEqual(window.document.activeElement, pauseControl, "Back from the slider restores its transport control");
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
        assert.strictEqual(window.document.querySelector(".playback-progress").getAttribute("aria-valuenow"), "12000");
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
        assert.strictEqual(window.document.querySelector(".player-hud").hidden, false);
        click("Forward 15 seconds");
        await settle();
        assert.strictEqual(position, 27000);
        await new Promise(function (resolve) { window.setTimeout(resolve, 200); });
        window.document.dispatchEvent(new window.KeyboardEvent("keydown", { keyCode: 417, bubbles: true }));
        await settle();
        assert.strictEqual(position, 42000, "The remote fast-forward key uses the saved 15-second interval");
        click("More");
        click("Chapters");
        assert.strictEqual(hudTimers.size, 0, "The chapter strip must suspend HUD hiding");
        var chapter = window.document.querySelector(".chapter-card");
        assert(chapter && chapter.textContent.indexOf("Chapter one") !== -1, "Chapter cards label their selection");
        chapter.click();
        await settle();
        assert.strictEqual(position, 20000);
        click("More");
        click("Markers");
        click("Close menu");
        assert(!requests.some(function (request) { return request.method === "PUT" && /^\/library\/parts\//.test(request.path); }),
            "Starting playback with no track choice must not overwrite the PMS stream selection");
        click("More");
        click("Audio and subtitles");
        click("Text size: Medium");
        assert(window.document.querySelector(".player-menu").textContent.includes("Text size: Large"),
            "Caption style controls update the persisted selection");
        click("English");
        click("Text overlay / English");
        await settle();
        var subtitleOverlay = window.document.getElementById("subtitle-text");
        assert(subtitleOverlay.classList.contains("subtitle-size-large"),
            subtitleOverlay.className + " | " + window.document.getElementById("status").textContent);
        assert(subtitleOverlay.classList.contains("subtitle-position-low"));
        var picks = requests.filter(function (request) { return request.method === "PUT" && /^\/library\/parts\//.test(request.path); });
        assert.strictEqual(picks.length, 1, "Choosing the text overlay records that one explicit pick on PMS");
        assert.notStrictEqual(picks[0].query.get("subtitleStreamID"), "0", "An overlay pick must not be written as Subtitles off");
        var overlayDecision = requests.filter(function (request) { return /decision$/.test(request.path); }).pop();
        assert.strictEqual(overlayDecision.query.get("subtitles"), "none", "An app-rendered text subtitle must never also be burned in");
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
        assert.strictEqual(window.localStorage.length, 3,
            "Only the device identifier, explicitly saved preferences and recent searches are stored");
        assert(window.localStorage.getItem("plx-tizen-recent-searches"));
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
