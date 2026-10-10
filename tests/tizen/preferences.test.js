"use strict";
var assert = require("assert");
var prefs = require("../../samsung/PlexTv/js/preferences.js");
var value;
var storage = {
    getItem: function () { return value || null; },
    setItem: function (key, next) { value = next; },
    removeItem: function () { value = null; }
};
assert.deepStrictEqual(prefs.load(storage), { quality: "1080", language: "en", autoNext: false,
    continueAction: "details", skipInterval: 10, subtitleSize: "medium", subtitlePosition: "low",
    subtitleColor: "white", subtitleDelayMs: 0 });
value = JSON.stringify({ quality: "720", language: "en", autoNext: false });
assert.deepStrictEqual(prefs.load(storage), { quality: "720", language: "en", autoNext: false,
    continueAction: "details", skipInterval: 10, subtitleSize: "medium", subtitlePosition: "low",
    subtitleColor: "white", subtitleDelayMs: 0 }, "Preferences from earlier app versions receive safe defaults");
prefs.save(storage, { quality: "720", language: "es", autoNext: true, token: "synthetic-secret",
    skipInterval: 15, subtitleSize: "large", subtitlePosition: "middle", subtitleColor: "yellow", subtitleDelayMs: 500 });
assert.strictEqual(value.includes("secret"), false, "Only non-secret preference fields may be persisted");
assert.strictEqual(prefs.load(storage).language, "es");
assert.strictEqual(prefs.load(storage).skipInterval, 15);
assert.strictEqual(prefs.load(storage).subtitleDelayMs, 500);
assert.strictEqual(prefs.load(storage).continueAction, "details", "Preferences saved before the Continue Watching choice load as Open details");
prefs.save(storage, { quality: "720", language: "es", autoNext: true, continueAction: "play",
    skipInterval: 60, subtitleSize: "small", subtitlePosition: "high", subtitleColor: "white", subtitleDelayMs: -500 });
assert.strictEqual(prefs.load(storage).continueAction, "play");
assert.strictEqual(prefs.load(storage).skipInterval, 60);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", autoNext: true, continueAction: "delete" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", autoNext: true, skipInterval: 45 }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", autoNext: true, subtitlePosition: "center" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", autoNext: true, subtitleDelayMs: 2501 }); }, /invalid/);
value = "{invalid";
assert.throws(function () { prefs.load(storage); }, /invalid/);
prefs.reset(storage);
assert.strictEqual(value, null);
console.log("Tizen preference persistence/allowlist/reset tests: passed");
