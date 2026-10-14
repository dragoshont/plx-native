"use strict";
var assert = require("assert");
var plex = require("../../samsung/Vemm/js/plex-api");
async function run() {
    var calls = [];
    var api = plex.createAccountClient({
        token: "synthetic-account-token", clientIdentifier: "synthetic-client",
        fetch: function (target, options) {
            var url = new URL(target);
            calls.push({ url: url, options: options });
            var item = { type: "movie", guid: "plex://movie/5d776b59ad5437001f79c6f8",
                key: "/library/metadata/5d776b59ad5437001f79c6f8" };
            var container = url.pathname === "/library/search" ? { SearchResults: [
                { id: "local", SearchResult: [{ Metadata: item }] },
                { id: "external", SearchResult: [{ Metadata: item }] }
            ] } : url.hostname === "metadata.provider.plex.tv" ? { Metadata: [item] } : { Metadata: [], size: 0 };
            return Promise.resolve({ ok: true, status: 200, json: function () {
                return Promise.resolve({ MediaContainer: container });
            } });
        }
    });
    await api.watchlist("all", 50);
    var call = calls.pop();
    assert.strictEqual(call.url.origin, "https://discover.provider.plex.tv");
    assert.strictEqual(call.url.pathname, "/library/sections/watchlist/all");
    assert.strictEqual(call.url.searchParams.get("X-Plex-Container-Start"), "50");
    assert.strictEqual(call.options.headers["X-Plex-Token"], "synthetic-account-token");
    assert.strictEqual(call.options.redirect, "error");
    assert(!call.url.searchParams.has("X-Plex-Token"));
    var guid = "plex://movie/5d776b59ad5437001f79c6f8";
    await api.setWatchlist(guid, true);
    call = calls.pop();
    assert.strictEqual(call.url.pathname, "/actions/addToWatchlist");
    assert.strictEqual(call.url.searchParams.get("ratingKey"), guid.split("/").pop());
    assert.strictEqual(call.options.method, "PUT");
    await api.setWatchlist(guid, false);
    assert.strictEqual(calls.pop().url.pathname, "/actions/removeFromWatchlist");
    assert.throws(function () { api.setWatchlist("123", true); }, /catalogue identifier/);
    await assert.rejects(api.watchlist("evil", 0), /filter/);
    assert.strictEqual(calls.length, 0, "Invalid identifiers must never reach the network");
    var results = await api.searchCatalogue("Synthetic");
    assert.strictEqual(results.length, 1, "Only the external catalogue group belongs to Discover");
    call = calls.pop();
    assert.strictEqual(call.url.pathname, "/library/search");
    assert.strictEqual(call.url.searchParams.get("includeMetadata"), "1");
    assert.strictEqual(call.url.searchParams.get("searchProviders"), "discover");
    await api.catalogueDetails(results[0]);
    call = calls.pop();
    assert.strictEqual(call.url.hostname, "metadata.provider.plex.tv");
    assert.strictEqual(call.url.searchParams.get("includeUserState"), "1");
    await assert.rejects(api.catalogueDetails({ guid: guid, key: "//evil.invalid" }), /detail path/);
    var server = plex.createClient({ baseUrl: "https://pms.synthetic.invalid", token: "synthetic-server-token",
        fetch: function (target, options) {
            assert.strictEqual(options.headers["X-Plex-Token"], "synthetic-server-token");
            var url = new URL(target);
            assert.strictEqual(url.pathname, "/library/sections/1/all");
            assert.strictEqual(url.searchParams.get("guid"), guid);
            return Promise.resolve({ ok: true, status: 200, json: function () {
                return Promise.resolve({ MediaContainer: { Metadata: [
                    { ratingKey: "60", guid: guid }, { ratingKey: "61", guid: "plex://movie/000000000000000000000000" }
                ] } });
            } });
        } });
    assert.deepStrictEqual((await server.findGuid(1, guid)).map(function (item) { return item.ratingKey; }), ["60"]);
    console.log("Tizen Watchlist account-token/GUID/paging/explicit PUT contracts: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
