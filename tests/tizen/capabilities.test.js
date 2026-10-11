"use strict";
var assert = require("assert");
var capabilities = require("../../samsung/PlexTv/js/capabilities.js");
var tizen3 = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 3.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/3.0 TV Safari/538.1";
var tizen4 = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 4.0) AppleWebKit/537.36 (KHTML, like Gecko) 56.0.2924.0/4.0 TV Safari/537.36";
function uhd(value) { return { isUdPanelSupported: function () { return value; } }; }

var measured = capabilities.detect({ userAgent: tizen3, productinfo: uhd(true) });
assert(measured && measured.measured, "Tizen 3.0 is the measured 2017 profile");
assert.deepStrictEqual(measured.video, ["h264", "hevc"]);
assert(measured.audio.indexOf("dts") !== -1, "DTS core decoded on the measured 2017 set");
assert(measured.containers.indexOf("mkv") !== -1);
assert.strictEqual(measured.maxWidth, 3840);
assert.strictEqual(measured.maxHeight, 2160);

var later = capabilities.detect({ userAgent: tizen4, productinfo: uhd(true) });
assert(later && !later.measured, "2018+ profiles come from Samsung's specification until measured");
assert.strictEqual(later.audio.indexOf("dts"), -1, "Samsung removed DTS from 2018 TVs");

var fhd = capabilities.detect({ userAgent: tizen3, productinfo: uhd(false) });
assert.strictEqual(fhd.maxWidth, 1920);
assert.strictEqual(fhd.maxHeight, 1080);
var unknownPanel = capabilities.detect({ userAgent: tizen3, productinfo: { isUdPanelSupported: function () { throw new Error("SecurityError"); } } });
assert.strictEqual(unknownPanel.maxHeight, 1080, "An unreadable panel never claims UHD");
assert.strictEqual(capabilities.detect({ userAgent: tizen3 }).maxHeight, 1080);

assert.strictEqual(capabilities.detect({ userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1" }), null, "Browsers and simulators never direct play");
assert.strictEqual(capabilities.detect({ userAgent: "Mozilla/5.0 (SMART-TV; Linux; Tizen 2.4.0)" }), null, "Tizen before 3.0 is unsupported");
assert.strictEqual(capabilities.detect({}), null);
measured.audio.push("mutated");
assert.strictEqual(capabilities.detect({ userAgent: tizen3, productinfo: uhd(true) }).audio.indexOf("mutated"), -1);
console.log("Tizen capability profile tests: passed");
