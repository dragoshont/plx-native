"use strict";
var assert = require("assert");
var api = require("../../samsung/Vemm/js/plex-api");
var calls = [];
var refused = false;
var client = api.createClient({
    baseUrl: "https://pms.synthetic.invalid",
    token: "synthetic-profile-server-token",
    fetch: function (url, options) {
        calls.push({ url: new URL(url), options: options });
        return Promise.resolve({ ok: !refused, status: refused ? 403 : 204 });
    }
});
async function run() {
    assert.strictEqual(calls.length, 0, "Constructing a client must not change watch history");
    await assert.rejects(client.setWatched("10", "true"), /explicitly/);
    await assert.rejects(client.selectStreams("20", -1, 0), /Invalid/);
    assert.strictEqual(calls.length, 0, "Invalid actions must not issue a request");
    await client.setWatched("10", true);
    await client.setWatched("10", false);
    await client.removeContinueWatching("10");
    assert.deepStrictEqual(calls.slice(0, 3).map(function (call) {
        return [call.url.pathname, call.options.method];
    }), [["/:/scrobble", "GET"], ["/:/unscrobble", "GET"], ["/actions/removeFromContinueWatching", "PUT"]]);
    assert.strictEqual(calls[0].url.searchParams.get("key"), "10");
    assert.strictEqual(calls[0].url.searchParams.get("identifier"), "com.plexapp.plugins.library");
    assert.strictEqual(calls[2].url.searchParams.get("ratingKey"), "10");
    assert.strictEqual(calls[2].url.searchParams.get("time"), null);
    await client.selectStreams("20", 0, 0);
    assert.strictEqual(calls[3].url.searchParams.get("audioStreamID"), null);
    assert.strictEqual(calls[3].url.searchParams.get("subtitleStreamID"), "0");
    assert.strictEqual(calls[3].url.searchParams.get("allParts"), "1");
    await client.selectStreams("20", 31, 42);
    assert.strictEqual(calls[4].url.searchParams.get("audioStreamID"), "31");
    assert.strictEqual(calls[4].url.searchParams.get("subtitleStreamID"), "42");
    calls.forEach(function (call) {
        assert.strictEqual(call.options.headers["X-Plex-Token"], "synthetic-profile-server-token");
        assert(!call.url.href.includes("synthetic-profile-server-token"));
        assert.strictEqual(call.options.redirect, "error");
    });
    refused = true;
    await assert.rejects(client.setWatched("10", true), function (error) {
        return error.status === 403 && error.scope === "server";
    });
    console.log("Tizen explicit watch mutations and server stream-selection contracts: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
