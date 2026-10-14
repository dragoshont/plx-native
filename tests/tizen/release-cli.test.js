"use strict";
var assert = require("assert");
var child = require("child_process");
var python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
var help = child.spawnSync(python, ["samsung/release.py", "--help"], { encoding: "utf8" });
assert.strictEqual(help.status, 0, help.stderr);
assert(help.stdout.indexOf("--notes-file") !== -1);
assert(help.stdout.indexOf("--no-publish") !== -1);
var missing = child.spawnSync(python, ["samsung/release.py", "0.2.7", "--notes-file",
    "tests/tizen/does-not-exist-release-note"], { encoding: "utf8" });
assert.strictEqual(missing.status, 2);
assert(missing.stderr.indexOf("--notes-file must name an existing release note") !== -1);
console.log("Samsung release CLI validates notes before signing or publication: passed");
