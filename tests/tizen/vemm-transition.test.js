"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var playback = require("../../samsung/Vemm/js/playback.js");
var product = require("../../samsung/Vemm/js/product.js");

var root = path.resolve(__dirname, "../..");
var app = path.join(root, "samsung/Vemm");
var config = fs.readFileSync(path.join(app, "config.xml"), "utf8");
var index = fs.readFileSync(path.join(app, "index.html"), "utf8");
var build = fs.readFileSync(path.join(root, "samsung/build.py"), "utf8");
var api = fs.readFileSync(path.join(app, "js/plex-api.js"), "utf8");

assert.deepStrictEqual(product, {
    name: "Vemm",
    pronunciation: "/vem/",
    tagline: "Your media. At its best.",
    platform: "Samsung Tizen",
    status: "working brand"
});
assert(config.includes("<name>Vemm</name>"), "The current source display name must be Vemm");
assert(index.includes("<title>Vemm</title>"));
assert(index.includes('src="brand/vemm-mark.svg"'));
assert(index.includes("Your media. At its best."));
assert(fs.existsSync(path.join(app, "brand/vemm-mark.svg")), "The packaged vector mark must exist");
assert(fs.existsSync(path.join(root, "samsung/brand/vemm-app-icon.svg")), "The source app icon must exist");
assert(fs.existsSync(path.join(root, "samsung/brand/vemm-wordmark.svg")), "The source wordmark must exist");
assert(build.includes('PACKAGE_ID = "VemmTvApp0"'), "Vemm must use its separate package identity");
assert(config.includes('id="VemmTvApp0.Vemm" package="VemmTvApp0"'));
assert(api.includes('require("./product")'));
assert(api.includes("product && product.name"));
assert(!api.includes('"Media for Tizen"'), "Plex protocol identity must use the current display product");

var preferences = fs.readFileSync(path.join(app, "js/preferences.js"), "utf8");
var session = fs.readFileSync(path.join(app, "js/session.js"), "utf8");
["vemm-tizen-preferences", "vemm-tizen-account", "vemm-tizen-save-sign-in"].forEach(function (key) {
    assert(preferences.includes(key) || session.includes(key), "Missing Vemm storage key: " + key);
});

var mark = fs.readFileSync(path.join(root, "samsung/brand/vemm-mark.svg"), "utf8");
assert(mark.includes('stroke="#3B82F6"'));
assert(mark.includes('stroke="#B7D0FF"'));
assert.strictEqual((mark.match(/stroke-linecap="round"/g) || []).length, 2,
    "The folded V uses two rounded capsule strokes");

var profile = {
    status: "documented",
    measured: false,
    evidence: "Samsung media specifications",
    containers: ["mp4"],
    videoContainers: { h264: ["mp4"] },
    audioContainers: {},
    video: ["h264"],
    audio: ["aac"],
    maxWidth: 1920,
    maxHeight: 1080,
    maxFrameRate: 60,
    maxBitrate: 20000,
    h264Level1080: 41,
    hdr: "none"
};
var item = {
    ratingKey: "10",
    type: "movie",
    Media: [{
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac",
        width: 1920,
        height: 1080,
        bitrate: 8000,
        Part: [{ id: "20", key: "/library/parts/20/file.mp4", Stream: [
            { streamType: 1, codec: "h264", bitDepth: 8, frameRate: 24 },
            { streamType: 2, id: 30, codec: "aac", selected: true }
        ] }]
    }]
};
var plan = playback.plan(item, { profile: profile, quality: "original" });
assert.deepStrictEqual(plan.explanation, {
    selected: "direct",
    reason: "supported",
    fallback: "server-transcode-if-refused",
    capability: {
        status: "documented",
        measured: false,
        source: "Samsung media specifications"
    }
});

console.log("Vemm identity, compatibility and explainable playback transition: passed");
