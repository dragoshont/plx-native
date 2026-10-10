"use strict";
var assert = require("assert");
var prefs = require("../../samsung/PlexTv/js/preferences.js");
var value;
var storage = {
    getItem: function () { return value || null; },
    setItem: function (key, next) { value = next; },
    removeItem: function () { value = null; }
};
assert.deepStrictEqual(prefs.load(storage), { quality: "1080", language: "en", autoNext: false, continueAction: "details" });
prefs.save(storage, { quality: "720", language: "es", autoNext: true, token: "synthetic-secret" });
assert.strictEqual(value.includes("secret"), false, "Only non-secret preference fields may be persisted");
assert.strictEqual(prefs.load(storage).language, "es");
assert.strictEqual(prefs.load(storage).continueAction, "details", "Preferences saved before the Continue Watching choice load as Open details");
prefs.save(storage, { quality: "720", language: "es", autoNext: true, continueAction: "play" });
assert.strictEqual(prefs.load(storage).continueAction, "play");
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", autoNext: true, continueAction: "delete" }); }, /invalid/);
value = "{invalid";
assert.throws(function () { prefs.load(storage); }, /invalid/);
prefs.reset(storage);
assert.strictEqual(value, null);
console.log("Tizen preference persistence/allowlist/reset tests: passed");
