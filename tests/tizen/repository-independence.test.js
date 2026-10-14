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
    ".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/config.yml"].forEach(function (name) {
    assert(!/plxnative\.com|support@|GLinnik21\/plx-native\/(?:issues|discussions)/i.test(read(name)),
        name + " must not route support, funding or development to upstream");
});
assert(read("LICENSE").indexOf("GNU GENERAL PUBLIC LICENSE") !== -1);
assert(read("LICENSING.md").indexOf("GPL-3.0-or-later") !== -1);
assert(read("LICENSING.md").indexOf("Gleb Linnik") !== -1);
assert(read("licenses/PlxNative-historical-MIT.txt").indexOf("Permission is hereby granted") !== -1);
assert(read("licenses/native-history-NOTICES.md").indexOf("FFmpeg") !== -1);

var build = read("samsung/build.py");
assert(build.includes('PACKAGE_ID = "VemmTvApp0"'));
assert(build.includes('APP_ID = f"{PACKAGE_ID}.Vemm"'));
assert(read("samsung/install.py").includes('APP_ID = "VemmTvApp0.Vemm"'));
assert(read("samsung/Vemm/config.xml").includes("<name>Vemm</name>"));
assert(read("samsung/Vemm/index.html").includes("<title>Vemm</title>"));
assert(read("samsung/Vemm/js/product.js").includes('name: "Vemm"'));
assert(read("samsung/brand/vemm-mark.svg") === read("samsung/Vemm/brand/vemm-mark.svg"));
assert(read("samsung/brand/README.md").includes("working brand"));
[
    "docs/vemm/01-current-state-audit.md", "docs/vemm/02-brand-and-identity.md",
    "docs/vemm/03-architecture.md", "docs/vemm/04-playback-policy.md",
    "docs/vemm/05-platform-capabilities.md", "docs/vemm/06-implementation-report.md",
    "docs/vemm/07-repository-and-release-migration.md", "docs/vemm/08-legacy-identity-audit.md"
].forEach(function (name) { assert(fs.existsSync(path.join(root, name)), "Missing Vemm transition document: " + name); });
assert(/working product identity/i.test(read("docs/vemm/02-brand-and-identity.md")));
assert(read("docs/vemm/03-architecture.md").includes("KEEP / CUT / DEFER"));
assert(!/Exit Plx\?|Plx could not close/.test(read("samsung/Vemm/main.js")));
assert(!read("tools/tizen/build-locales.js").includes('root, "locales"'));
assert(read("tools/tizen/build-locales.js").includes('"samsung/locales"'));
assert(!read("tests/tizen/account-preferences.test.js").includes("rust-modules"));
assert(read(".github/workflows/samsung.yml").includes("if: startsWith(github.ref, 'refs/tags/v')"),
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
console.log("Samsung-only tracked closure, Vemm identity, own routing and license/source invariants: passed");
