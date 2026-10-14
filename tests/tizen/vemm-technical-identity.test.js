"use strict";

var assert = require("assert");
var child = require("child_process");
var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname, "../..");
var app = path.join(root, "samsung/Vemm");

function read(name) { return fs.readFileSync(path.join(root, name), "utf8"); }

assert(fs.existsSync(app), "The active app source path must be samsung/Vemm");
assert(!fs.existsSync(path.join(root, "samsung/PlexTv")), "The legacy app-owned source path must be retired");

var config = read("samsung/Vemm/config.xml");
assert(config.includes('id="VemmTvApp0.Vemm"'));
assert(config.includes('package="VemmTvApp0"'));
assert(config.includes("<name>Vemm</name>"));
assert(/^[A-Za-z0-9]{10}$/.test("VemmTvApp0"), "The candidate package ID must be ten alphanumeric characters");

var activeScripts = [
    ".github/workflows/samsung.yml", "samsung/build.py", "samsung/install.py",
    "samsung/release.py", "samsung/source_bundle.py", "tools/tizen/build-source.sh"
].map(read).join("\n");
[
    "PlxNative0", "plx-tizen-", "Plx-", "samsung-v", "PLX_",
    ".config/plxnative", "plx-build", "plx-tizen-build", "samsung/PlexTv"
].forEach(function (legacy) {
    assert(!activeScripts.includes(legacy), "Active technical surfaces retain legacy identity: " + legacy);
});
[
    "VemmTvApp0.Vemm", "VemmTvApp0", "Vemm-", "Vemm-source-", "VEMM_",
    ".config/vemm", "vemm-build", "vemm-tizen-build", "samsung/Vemm"
].forEach(function (current) {
    assert(activeScripts.includes(current), "Missing Vemm technical identity: " + current);
});

var appSources = fs.readdirSync(path.join(app, "js")).map(function (name) {
    return read("samsung/Vemm/js/" + name);
}).join("\n") + read("samsung/Vemm/main.js") + read("samsung/Vemm/css/style.css");
assert(!/\bplx-tizen-/.test(appSources));
assert(!/\bplexCard\b/.test(appSources));
assert(!/\bplx-spin\b/.test(appSources));
assert(!/\bplex-graphics-backdrop\b/.test(appSources));
assert(!/PlxNative|plxnative\.com/i.test(appSources),
    "Active Vemm payload must not bundle legacy product/support identity");
var appOwnedGlobals = appSources.match(/\bPlex[A-Z][A-Za-z]+\b/g) || [];
var retainedProtocolGlobals = { PlexApi: true, PlexAccountPreferences: true };
assert.deepStrictEqual(Array.from(new Set(appOwnedGlobals)).filter(function (name) {
    return !retainedProtocolGlobals[name];
}).sort(), [], "Only Plex service/protocol globals may retain Plex naming");
assert(appSources.includes("X-Plex-Product"), "Plex protocol headers must remain");
assert(appSources.includes("plex.tv"), "Plex service endpoints must remain");

["vemm-tizen-device-id", "vemm-tizen-preferences", "vemm-tizen-account",
    "vemm-tizen-save-sign-in", "vemm-tizen-favorite-libraries",
    "vemm-tizen-recent-searches"].forEach(function (key) {
    assert(appSources.includes(key), "Missing Vemm-owned storage key: " + key);
});

var tracked = child.execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n");
assert(tracked.includes("docs/plex-openapi.json"), "Plex protocol evidence must remain tracked");
assert(tracked.includes("licenses/PlxNative-historical-MIT.txt"), "Historical provenance must remain tracked");

var audit = read("docs/vemm/08-legacy-identity-audit.md");
["RETAIN_PROTOCOL_SERVICE", "RETAIN_HISTORY_PROVENANCE", "MIGRATE_APP_OWNED"].forEach(function (classification) {
    assert(audit.includes(classification), "Identity audit lacks classification: " + classification);
});
assert(audit.includes("separate install"));
assert(audit.includes("dragoshont/vemm"));

console.log("Vemm separate-install technical identity and classified legacy audit: passed");
