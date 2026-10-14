"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var root = path.resolve(__dirname, "../..");
var config = fs.readFileSync(path.join(root, "samsung/Vemm/config.xml"), "utf8");
var build = fs.readFileSync(path.join(root, "samsung/build.py"), "utf8");
var install = fs.readFileSync(path.join(root, "samsung/install.py"), "utf8");

assert(config.includes('id="VemmTvApp0.Vemm" package="VemmTvApp0"'));
assert(build.includes('PACKAGE_ID = "VemmTvApp0"'));
assert(build.includes('APP_ID = f"{PACKAGE_ID}.Vemm"'));
assert(install.includes('APP_ID = "VemmTvApp0.Vemm"'));
assert(!/PlxNative0/.test(config + build + install));

console.log("Vemm public application/package identity is consistent: passed");
