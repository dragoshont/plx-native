"use strict";
var assert = require("assert");
var prefs = require("../../samsung/PlexTv/js/preferences.js");
var value;
var storage = {
    getItem: function () { return value || null; },
    setItem: function (key, next) { value = next; },
    removeItem: function () { value = null; }
};
assert.deepStrictEqual(prefs.load(storage), { quality: "original", language: "en", nextEpisode: "countdown",
    continueAction: "details", skipInterval: 10, subtitleSize: "medium", subtitlePosition: "low",
    subtitleColor: "white", subtitleBackground: "off", subtitleDelayMs: 0, directPlay: "auto", enhancedGraphics: false });
value = JSON.stringify({ quality: "720", language: "en", autoNext: false });
assert.deepStrictEqual(prefs.load(storage), { quality: "720", language: "en", nextEpisode: "off",
    continueAction: "details", skipInterval: 10, subtitleSize: "medium", subtitlePosition: "low",
    subtitleColor: "white", subtitleBackground: "off", subtitleDelayMs: 0, directPlay: "auto", enhancedGraphics: false }, "Preferences from earlier app versions receive safe defaults; auto-play off stays off");
value = JSON.stringify({ quality: "720", language: "en", autoNext: true });
assert.strictEqual(prefs.load(storage).nextEpisode, "countdown", "Auto-play on becomes the LG credits countdown");
assert.strictEqual("autoNext" in prefs.load(storage), false);
prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", token: "synthetic-secret",
    skipInterval: 15, subtitleSize: "large", subtitlePosition: "middle", subtitleColor: "yellow", subtitleDelayMs: 500 });
assert.strictEqual(value.includes("secret"), false, "Only non-secret preference fields may be persisted");
assert.strictEqual(prefs.load(storage).language, "es");
assert.strictEqual(prefs.load(storage).skipInterval, 15);
assert.strictEqual(prefs.load(storage).subtitleDelayMs, 500);
prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: -60000 });
assert.strictEqual(prefs.load(storage).subtitleDelayMs, -60000, "Sidecar timing supports the LG 60-second earlier bound");
prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: 60000 });
assert.strictEqual(prefs.load(storage).subtitleDelayMs, 60000, "Subtitle timing supports the LG 60-second later bound");
assert.throws(function () {
    prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: 50 });
}, /invalid/, "Timing offsets must use the LG 100 ms step");
assert.throws(function () {
    prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: 60100 });
}, /invalid/, "Timing offsets must stay inside the LG 60-second bound");
assert.strictEqual(prefs.load(storage).continueAction, "details", "Preferences saved before the Continue Watching choice load as Open details");
prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", continueAction: "play",
    skipInterval: 60, subtitleSize: "small", subtitlePosition: "high", subtitleColor: "white", subtitleDelayMs: -500 });
assert.strictEqual(prefs.load(storage).continueAction, "play");
assert.strictEqual(prefs.load(storage).skipInterval, 60);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", continueAction: "delete" }); }, /invalid/);
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off" });
assert.strictEqual(prefs.load(storage).quality, "original", "Original quality is a saved choice");
assert.throws(function () { prefs.save(storage, { quality: "4k", language: "en", nextEpisode: "off" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", skipInterval: 45 }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitlePosition: "center" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "es", nextEpisode: "countdown", subtitleDelayMs: 2501 }); }, /invalid/);
prefs.save(storage, { quality: "1080", language: "en", nextEpisode: "off", directPlay: "off" });
assert.strictEqual(prefs.load(storage).directPlay, "off");
prefs.save(storage, { quality: "1080h", language: "en", nextEpisode: "after_credits", directPlay: "force",
    subtitleSize: "extra_large", subtitleColor: "grey_55" });
assert.strictEqual(prefs.load(storage).quality, "1080h", "The LG ladder's 1080p 20 Mbps rung is a saved choice");
assert.strictEqual(prefs.load(storage).directPlay, "force");
assert.strictEqual(prefs.load(storage).subtitleSize, "extra_large");
assert.strictEqual(prefs.load(storage).subtitleColor, "grey_55");
assert.strictEqual(prefs.load(storage).subtitleBackground, "off", "Subtitles default to the LG outline, no box");
prefs.save(storage, { quality: "720", language: "en", nextEpisode: "off", subtitleBackground: "on" });
assert.strictEqual(prefs.load(storage).subtitleBackground, "on");
assert.throws(function () { prefs.save(storage, { quality: "720", language: "en", nextEpisode: "off", subtitleBackground: "grey" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "720", language: "en", nextEpisode: "always" }); }, /invalid/);
assert.throws(function () { prefs.save(storage, { quality: "1080", language: "en", nextEpisode: "off", directPlay: "always" }); }, /invalid/);
value = "{invalid";
assert.throws(function () { prefs.load(storage); }, /invalid/);
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", enhancedGraphics: true });
assert.strictEqual(prefs.load(storage).enhancedGraphics, true);
prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", enhancedGraphics: false });
assert.strictEqual(prefs.load(storage).enhancedGraphics, false);
[1, "true", null, {}].forEach(function (invalid) {
    assert.throws(function () {
        prefs.save(storage, { quality: "original", language: "en", nextEpisode: "off", enhancedGraphics: invalid });
    }, /invalid/);
});
prefs.reset(storage);
assert.strictEqual(value, null);
console.log("Tizen preference persistence/allowlist/reset tests: passed");
