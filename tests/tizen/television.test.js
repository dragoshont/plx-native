"use strict";
var assert = require("assert");
var tv = require("../../samsung/PlexTv/js/television");
var spec = require("../../docs/plex-openapi.json");
async function run() {
    var calls = [];
    var api = tv.create({ request: function (path, method, query, empty) {
        calls.push({ path: path, method: method, query: query, empty: empty });
        var c = { size: 0 };
        if (path === "/media/providers") { c.MediaProvider = [{ identifier: "tv.plex.providers.epg.cloud:12" }, { identifier: "bad" }]; }
        if (path === "/media/subscriptions/template") {
            c.SubscriptionTemplate = [{ MediaSubscription: [{ title: "This episode", type: 4, parameters: "hints%5Bguid%5D=plex%3A%2F%2Fepisode%2Fabc" }] }];
        }
        return Promise.resolve(c);
    } });
    assert.strictEqual((await api.providers()).length, 1);
    assert.deepStrictEqual(await api.dvrs(), []);
    await api.channels("lineup://synthetic");
    assert.strictEqual(calls.pop().query.lineup, "lineup://synthetic");
    await assert.rejects(api.channels("https://evil.invalid"), /lineup/);
    await api.grid({ identifier: "tv.plex.providers.epg.cloud:12" }, "channel-one", "2026-10-10");
    assert.strictEqual(calls.pop().path, "/tv.plex.providers.epg.cloud:12/grid");
    assert.throws(function () { api.browse("//evil.invalid", 0); }, /provider path/);
    var templates = await api.templates("plex://episode/abc");
    await api.record(templates[0], 2);
    var create = calls.pop();
    assert.strictEqual(create.method, "POST");
    assert.strictEqual(create.query["hints[guid]"], "plex://episode/abc");
    assert.strictEqual(create.query.targetLibrarySectionID, "2");
    assert.throws(function () { tv.templateQuery({ type: 4, parameters: "X-Plex-Token=bad" }, 2); }, /Unsupported/);
    assert.throws(function () { tv.templateQuery({ type: 4, parameters: "hints%5Bguid%5D=a&hints%5Bguid%5D=b" }, 2); }, /Unsupported/);
    await api.remove(18);
    assert.deepStrictEqual(calls.pop(), { path: "/media/subscriptions/18", method: "DELETE", query: null, empty: true });
    await api.edit(18, [{ id: "newnessPolicy", value: "1" }]);
    assert.strictEqual(calls.pop().query["prefs[newnessPolicy]"], "1");
    assert.strictEqual(spec.paths["/media/subscriptions/{subscriptionId}"].put.parameters.find(function (parameter) {
        return parameter.name === "prefs";
    }).style, "deepObject", "DVR preference bracket encoding is defined by OpenAPI deepObject");
    var query = tv.templateQuery({ type: 4, parameters: "hints%5BratingKey%5D=plex%253A%252F%252Fepisode%252Fabc" }, 2);
    assert.strictEqual(query["hints[ratingKey]"], "plex%3A%2F%2Fepisode%2Fabc",
        "Template nested percent encoding must be decoded only once before request serialization");
    console.log("Tizen source-backed guide/provider/DVR template and mutation contracts: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
