"use strict";
// The advanced manual-server form must not ship a developer mock origin as its value.
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var source = fs.readFileSync(path.resolve(__dirname, "../../samsung/Vemm/main.js"), "utf8");
assert.ok(!/serverInput\.value\s*=\s*"[^"]+"/.test(source), "manual server field must start empty");
assert.ok(!/127\.0\.0\.1:32499/.test(source), "mock PMS origin must not ship in the app");
assert.ok(/serverInput\.placeholder\s*=/.test(source), "manual server field needs an example placeholder");
console.log("manual server default: ok");
