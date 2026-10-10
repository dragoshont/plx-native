"use strict";
var assert = require("assert");
var api = require("../../samsung/PlexTv/js/plex-api");
var calls = [];
var account = api.createAccountClient({
    token: "synthetic-account-token",
    fetch: function (url, options) {
        calls.push({ url: url, options: options });
        return Promise.resolve({
            ok: true, status: 200,
            json: function () {
                return Promise.resolve({ MediaContainer: url.endsWith("/credits") ?
                    { CreditGroup: [{ title: "Acting", Credit: [{ Metadata: {
                        ratingKey: "5d776827151a60001f24ab18", title: "Catalogue title"
                    } }] }] } : { Metadata: [{ summary: "Synthetic biography" }] } });
            }
        });
    }
});
async function run() {
    var tag = "5d776827151a60001f24ab18";
    var profile = await account.personProfile(tag);
    assert.strictEqual(profile.Metadata[0].summary, "Synthetic biography");
    var groups = await account.personCredits(tag);
    assert.strictEqual(groups[0].Credit[0].Metadata.ratingKey, tag);
    calls.forEach(function (call) {
        assert(call.url.startsWith("https://discover.provider.plex.tv/library/people/"));
        assert.strictEqual(call.options.headers["X-Plex-Token"], "synthetic-account-token");
        assert.strictEqual(call.options.redirect, "error");
        assert(!call.url.includes("token"));
    });
    await assert.rejects(account.personProfile("https://synthetic.invalid"), /catalogue identifier/);
    assert.strictEqual(calls.length, 2);
    var server = api.createClient({
        baseUrl: "https://server.synthetic.invalid",
        token: "synthetic-server-token",
        fetch: function (url, options) {
            var parsed = new URL(url);
            assert.strictEqual(parsed.pathname, "/library/people/921/media");
            assert.strictEqual(parsed.searchParams.get("X-Plex-Container-Start"), "50");
            assert.strictEqual(options.headers["X-Plex-Token"], "synthetic-server-token");
            return Promise.resolve({ ok: true, status: 200, json: function () {
                return Promise.resolve({ MediaContainer: { Metadata: [], offset: 50, totalSize: 50 } });
            } });
        }
    });
    await server.getPerson(null, 921, 50);

    var index = api.localCatalogueIndex([
        { type: "movie", guid: "plex://movie/5d776827151a60001f24ab18", ratingKey: 41 },
        { type: "show", guid: "plex://show/5d9c08804eefaa001f5df5fc", ratingKey: "42" },
        { type: "episode", guid: "plex://episode/ep1", ratingKey: "43" },
        { type: "movie", ratingKey: "44" }
    ]);
    assert.strictEqual(api.matchCredit(index, "5d776827151a60001f24ab18"), "41");
    assert.strictEqual(api.matchCredit(index, "5d9c08804eefaa001f5df5fc"), "42");
    assert.strictEqual(api.matchCredit(index, "ep1"), null);
    assert.strictEqual(api.matchCredit(index, ""), null);
    assert.strictEqual(api.matchCredit(index, "toString"), null);

    var starts = [];
    var paged = api.createClient({
        baseUrl: "https://server.synthetic.invalid",
        token: "synthetic-server-token",
        fetch: function (url) {
            var start = Number(new URL(url).searchParams.get("X-Plex-Container-Start"));
            starts.push(start);
            var rows = [];
            for (var i = 0; i < 50; i += 1) {
                rows.push({ type: "movie", guid: "plex://movie/m" + (start + i), ratingKey: String(start + i) });
            }
            return Promise.resolve({ ok: true, status: 200, json: function () {
                return Promise.resolve({ MediaContainer: { Metadata: rows, offset: start, totalSize: 900 } });
            } });
        }
    });
    var result = await paged.personLibraryIndex(921);
    assert.strictEqual(starts.length, 18, "A large career must not stop matching at 500 titles");
    assert.strictEqual(result.complete, true);
    assert.strictEqual(api.matchCredit(result.index, "m499"), "499");
    assert.strictEqual(api.matchCredit(result.index, "m899"), "899");
    var invalid = api.createClient({
        baseUrl: "https://server.synthetic.invalid", token: "synthetic-server-token",
        fetch: function () {
            return Promise.resolve({ ok: true, status: 200, json: function () {
                return Promise.resolve({ MediaContainer: { Metadata: [], offset: 0, totalSize: 1 } });
            } });
        }
    });
    await assert.rejects(invalid.personLibraryIndex(921), /incomplete person-library page/,
        "A truncated page must not be advertised as a complete availability index");
    console.log("Tizen person biography/catalogue/local identity and paging tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
