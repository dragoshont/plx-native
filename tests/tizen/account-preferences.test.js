"use strict";
var assert = require("assert");
var prefs = require("../../samsung/Vemm/js/account-preferences");
var plex = require("../../samsung/Vemm/js/plex-api");

var catalog = require("./fixtures/account-languages.json");
assert.deepStrictEqual(prefs.LANGUAGES, catalog.languages, "language catalog retains the inherited 190-entry picker");
assert.strictEqual(catalog.languages.length, 190);
assert(!prefs.picker().some(function (language) { return language.code === "pb"; }));
assert.strictEqual(prefs.label("pb"), prefs.label("pt-BR"));
assert.strictEqual(prefs.label("xx-YY"), "xx-YY");

var parsed = prefs.parse({ profile: { autoSelectAudio: true, defaultAudioLanguage: "en",
    defaultSubtitleLanguage: "-1", autoSelectSubtitle: 1, defaultSubtitleForced: "2" } });
assert.deepStrictEqual(parsed, { autoSelectAudio: true, audioLanguage: "en", subtitleLanguage: null,
    subtitleMode: 1, subtitleForced: 2 });
var aliases = prefs.parse({ subtitleMode: 2, subtitleForced: 9, defaultAudioLanguage: "" });
assert.strictEqual(aliases.subtitleMode, 2);
assert.strictEqual(aliases.subtitleForced, 0);
assert.strictEqual(aliases.audioLanguage, null);
assert.strictEqual(aliases.autoSelectAudio, null);
assert.throws(function () { prefs.parse(null); });

var off = { autoSelectAudio: false, audioLanguage: null, subtitleLanguage: "en", subtitleMode: 0, subtitleForced: 0 };
var original = prefs.update(off, { audioLanguage: "" });
assert.deepStrictEqual(original.query, { autoSelectAudio: "true" });
assert.strictEqual(original.next.autoSelectAudio, true);
var french = prefs.update(original.next, { audioLanguage: "fr" });
assert.deepStrictEqual(french.query, { defaultAudioLanguage: "fr" });
assert.deepStrictEqual(prefs.update(off, { subtitleLanguage: "" }).query, { defaultSubtitleLanguage: "" });
assert.deepStrictEqual(prefs.update(off, { subtitleMode: 0 }).query, {});
assert.deepStrictEqual(prefs.update(off, { subtitleForced: 3 }).query, { defaultSubtitleForced: "3" });
assert.throws(function () { prefs.update(off, { subtitleMode: 3 }); });
assert.throws(function () { prefs.update(off, { subtitleForced: 4 }); });
assert.throws(function () { prefs.update(off, { audioLanguage: "en&x=1" }); });

async function run() {
    var calls = [];
    var status = 200;
    var api = plex.createAccountClient({ token: "synthetic-account-token", clientIdentifier: "synthetic-client",
        fetch: function (target, options) {
            calls.push({ url: new URL(target), options: options });
            return Promise.resolve({ ok: status < 400, status: status, json: function () {
                return Promise.resolve({ profile: { autoSelectSubtitle: 1 } });
            } });
        } });
    assert.strictEqual(prefs.parse(await api.accountPreferences()).subtitleMode, 1);
    var get = calls.pop();
    assert.strictEqual(get.url.href, "https://clients.plex.tv/api/v2/user/profile");
    assert.strictEqual(get.options.method, "GET");
    assert.strictEqual(get.options.headers["X-Plex-Token"], "synthetic-account-token");
    await api.saveAccountPreferences({ defaultSubtitleLanguage: "", autoSelectSubtitle: "2" });
    var put = calls.pop();
    assert.strictEqual(put.options.method, "PUT");
    assert.strictEqual(put.url.searchParams.get("defaultSubtitleLanguage"), "");
    assert.strictEqual(put.url.searchParams.get("autoSelectSubtitle"), "2");
    assert(!put.url.searchParams.has("X-Plex-Token"));
    await api.saveAccountPreferences({});
    assert.strictEqual(calls.length, 0);
    await assert.rejects(api.saveAccountPreferences({ token: "x" }));
    status = 403;
    await assert.rejects(api.accountPreferences(), function (error) { return error.status === 403; });
    console.log("account-preferences ok");
}
run().catch(function (error) { console.error(error); process.exit(1); });
