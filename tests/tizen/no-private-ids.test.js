"use strict";
// Samsung app/package IDs are bound to the owner's signing certificate. Documentation must use
// placeholders; a concrete ten-character package ID in tracked Samsung prose is a leak.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.resolve(__dirname, "../..");
var files = fs.readdirSync(path.join(root, "docs")).filter(function (name) {
    return /^samsung-.*\.md$/.test(name);
}).map(function (name) { return path.join("docs", name); }).concat(["README.md"]);
var concrete = /\b(?:id|package)="(?!<)[A-Za-z0-9]{10}(?:\.[A-Za-z0-9]+)?"|\b[A-Za-z0-9]{10}\.PlexTv\b/;
files.forEach(function (file) {
    fs.readFileSync(path.join(root, file), "utf8").split("\n").forEach(function (line, index) {
        assert(!concrete.test(line), file + ":" + (index + 1) + " names a concrete Samsung app/package ID");
    });
});
console.log("Samsung docs use app/package ID placeholders: passed");
