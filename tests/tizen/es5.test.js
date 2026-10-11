"use strict";
var fs = require("fs");
var path = require("path");
var acorn = require("acorn");
var root = path.resolve(__dirname, "../../samsung/PlexTv");
var files = [path.join(root, "main.js")].concat(fs.readdirSync(path.join(root, "js"))
    .filter(function (name) { return name.endsWith(".js"); })
    .map(function (name) { return path.join(root, "js", name); }));
files.forEach(function (file) {
    acorn.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: 5, sourceType: "script" });
});
console.log("Tizen shipped bundle: strict ES5 parser passed (" + files.length + " files)");
// Parsing ES5 does not prove runtime APIs. Exercise the gate with planted M47-incompatible calls.
var assert = require("assert");
var child = require("child_process");
var fixture = path.join(__dirname, "m47-fixture");
fs.mkdirSync(fixture, { recursive: true });
try {
    fs.writeFileSync(path.join(fixture, "planted.js"), "Object.entries(value);");
    var checked = child.spawnSync(process.execPath, ["tools/tizen/check-es5.js", fixture], { encoding:"utf8" });
    assert.notStrictEqual(checked.status, 0, "ES5 gate must reject Object.entries on Chromium M47, not just parse its syntax");
} finally { fs.rmSync(fixture, { recursive: true, force: true }); }
var gate = require("../../tools/tizen/check-es5.js");
["Object.entries(value)", "Object.values(value)", "list.includes(value)", "text.padStart(2)",
    "new URLSearchParams(value)", "element.closest('button')", "document.querySelectorAll('button').forEach(fn)",
    "promise.finally(fn)", "new AbortController()"].forEach(function (source) {
    assert(gate.runtimeIssues(source).length, "Oldest-engine gate must reject: " + source);
});
assert.strictEqual(gate.runtimeIssues("Array.prototype.forEach.call(document.querySelectorAll('button'), fn)").length, 0);
assert.strictEqual(gate.runtimeIssues('var controller = typeof AbortController === "function" ? new AbortController() : null;').length, 0);
[".row { display:flex; gap:12px; }", ":root { --color: red; }", ".row { color:var(--color); }"].forEach(function(source) {
    assert(gate.cssIssues(source).length, "Oldest-engine gate must reject unsupported CSS: " + source);
});
files.forEach(function(file) { assert.deepStrictEqual(gate.runtimeIssues(fs.readFileSync(file,"utf8")), [], file); });
fs.readdirSync(path.join(root,"css")).filter(function(name){return /\.css$/.test(name);}).forEach(function(name) {
    assert.deepStrictEqual(gate.cssIssues(fs.readFileSync(path.join(root,"css",name),"utf8")), [], name);
});
console.log("Tizen Chromium M47 runtime/CSS compatibility and planted-regression scan: passed");
