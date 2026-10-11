"use strict";

// Device failure (UE55MU6172, 2026-10-11): "Remove from Continue Watching" was accepted by PMS
// (PUT 200) yet the item stayed on a freshly reloaded Home deck. PMS hides the item from
// /hubs/continueWatching and home.ondeck but NOT from home.continue, which /hubs/promoted returns.
// The LG client sources its deck from the dedicated hub for the same reason (rust-modules/data/src/pms.rs).

var assert = require("assert");
var createClient = require("../../samsung/PlexTv/js/plex-api.js").createClient;

function response(status, payload) {
    return { status: status, ok: status >= 200 && status < 300,
        json: function () { return Promise.resolve(payload); } };
}

function client(continueWatching) {
    return createClient({
        baseUrl: "http://localhost:32400/",
        token: "synthetic-test-token",
        fetch: function (url) {
            if (url.indexOf("/hubs/promoted") !== -1) {
                return Promise.resolve(response(200, { MediaContainer: { Hub: [
                    { hubIdentifier: "home.continue", title: "Continue Watching",
                        Metadata: [{ ratingKey: "7546", title: "Hidden" }, { ratingKey: "1", title: "Kept" }] },
                    { hubIdentifier: "home.ondeck", title: "On Deck", Metadata: [{ ratingKey: "2", title: "Next" }] },
                    { hubIdentifier: "home.movies.recent", title: "Recently Added", Metadata: [{ ratingKey: "3" }] }
                ] } }));
            }
            if (url.indexOf("/hubs/continueWatching") !== -1) { return continueWatching(); }
            return Promise.resolve(response(404, {}));
        }
    });
}

function dedicated() {
    return Promise.resolve(response(200, { MediaContainer: { Hub: [
        { hubIdentifier: "continueWatching", title: "Continue Watching",
            Metadata: [{ ratingKey: "1", title: "Kept" }, { ratingKey: "2", title: "Next" }] }
    ] } }));
}

function ids(hubs) {
    return hubs.map(function (hub) {
        return hub.hubIdentifier + ":" + (hub.Metadata || []).map(function (item) { return item.ratingKey; }).join(",");
    });
}

client(dedicated).getHomeHubs().then(function (hubs) {
    assert.deepStrictEqual(ids(hubs), ["continueWatching:1,2", "home.movies.recent:3"],
        "the deck must come from /hubs/continueWatching, replacing home.continue and home.ondeck");
    return client(function () { return Promise.resolve(response(404, {})); }).getHomeHubs();
}).then(function (hubs) {
    assert.deepStrictEqual(ids(hubs), ["home.continue:7546,1", "home.ondeck:2", "home.movies.recent:3"],
        "a server without the dedicated hub keeps the promoted rows");
    return client(function () { return Promise.resolve(response(200, { MediaContainer: { Hub: [] } })); }).getHomeHubs();
}).then(function (hubs) {
    assert.deepStrictEqual(ids(hubs), ["home.movies.recent:3"], "an empty dedicated deck means no deck row");
    console.log("Tizen Home deck tests: passed");
}).catch(function (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
