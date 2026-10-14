"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var child = require("child_process");
var root = path.resolve(__dirname, "../..");
var tracked = child.execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0").filter(Boolean);
var retired = /^(?:rust-modules|src|include|assets|pkg|ipkroot|vendor|ci|site|locales|\.agents|\.claude|\.codex)\//;
assert.deepStrictEqual(tracked.filter(function (name) {
    return retired.test(name) || name === "Makefile" || name === ".github/FUNDING.yml";
}), [], "The active tracked tree must not contain the retired native/build/site closure");
assert.deepStrictEqual(tracked.filter(function (name) { return name.indexOf(".github/workflows/") === 0; }),
    [".github/workflows/samsung.yml"], "Only the Samsung workflow is maintained");

function read(name) { return fs.readFileSync(path.join(root, name), "utf8"); }
["README.md", "AGENTS.md", "CLAUDE.md", "CONTRIBUTING.md", "PRIVACY.md", "SECURITY.md",
    ".github/ISSUE_TEMPLATE/config.yml"].forEach(function (name) {
    assert(!/plxnative\.com|support@|GLinnik21\/plx-native\/(?:issues|discussions)/i.test(read(name)),
        name + " must not route support, funding or development to upstream");
});
assert(!fs.existsSync(path.join(root, ".github/ISSUE_TEMPLATE/bug_report.yml")),
    "The historical archive must not offer a new-work issue form");
assert(read("README.md").includes("https://github.com/dragoshont/vemm"));
assert(read("README.md").includes("https://github.com/dragoshont/plx-native/releases"));
assert(read("SECURITY.md").includes("https://github.com/dragoshont/vemm/security"));
assert(read(".github/ISSUE_TEMPLATE/config.yml").includes("blank_issues_enabled: false"));
assert(read(".github/ISSUE_TEMPLATE/config.yml").includes("https://github.com/dragoshont/vemm/issues"));
assert(read("LICENSE").indexOf("GNU GENERAL PUBLIC LICENSE") !== -1);
assert(read("LICENSING.md").indexOf("GPL-3.0-or-later") !== -1);
assert(read("LICENSING.md").indexOf("Gleb Linnik") !== -1);
assert(read("licenses/PlxNative-historical-MIT.txt").indexOf("Permission is hereby granted") !== -1);
assert(read("licenses/native-history-NOTICES.md").indexOf("FFmpeg") !== -1);

var build = read("samsung/build.py");
assert(build.includes('PACKAGE_ID = "PlxNative0"'));
assert(build.includes('{PACKAGE_ID}.Plx'));
assert(read("samsung/install.py").includes('APP_ID = "PlxNative0.Plx"'));
assert(read("samsung/PlexTv/config.xml").includes("<name>Media for Tizen</name>"));
assert(read("samsung/PlexTv/index.html").includes("<title>Media for Tizen</title>"));
assert(!/Exit Plx\?|Plx could not close/.test(read("samsung/PlexTv/main.js")));
assert(!read("tools/tizen/build-locales.js").includes('root, "locales"'));
assert(read("tools/tizen/build-locales.js").includes('"samsung/locales"'));
assert(!read("tests/tizen/account-preferences.test.js").includes("rust-modules"));
assert(read(".github/workflows/samsung.yml").includes("if: startsWith(github.ref, 'refs/tags/samsung-v')"),
    "Normal CI must not install an SDK, sign or read certificate secrets");
tracked.filter(function (name) {
    return /\.md$/.test(name) && name !== "licenses/native-history-NOTICES.md";
}).forEach(function (name) {
    assert(fs.existsSync(path.join(root, name)), "Tracked document is missing: " + name);
    var matches = read(name).matchAll(/\]\(([^)]+)\)/g);
    for (var match of matches) {
        var target = match[1].split("#")[0];
        if (!target || /^(?:https?:|mailto:)/.test(target)) { continue; }
        assert(fs.existsSync(path.resolve(root, path.dirname(name), target)),
            name + " has a stale local link: " + target);
    }
});
console.log("Samsung-only tracked closure, neutral identity, own routing and license/update invariants: passed");
