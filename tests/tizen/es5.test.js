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
