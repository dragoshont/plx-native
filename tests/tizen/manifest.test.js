"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = path.join(__dirname, "../../samsung/PlexTv");
var config = fs.readFileSync(path.join(root, "config.xml"), "utf8");

// Every declared privilege must be justified by a use; an unused one widens what the
// certificate grants and is flagged by the workbench audit.
var justified = {
    "http://tizen.org/privilege/internet": "PMS and plex.tv XHR",
    "http://developer.samsung.com/privilege/avplay": "webapis.avplay playback",
    "http://developer.samsung.com/privilege/productinfo": "webapis.productinfo model/firmware capability profile",
    "http://tizen.org/privilege/tv.inputdevice": "tizen.tvinputdevice media/colour key registration"
};
var declared = [];
config.replace(/<tizen:privilege\s+name="([^"]+)"/g, function (_, name) { declared.push(name); });
assert.deepStrictEqual(declared.slice().sort(), Object.keys(justified).sort(),
    "Declared privileges must equal the justified set");

var sources = fs.readdirSync(path.join(root, "js")).map(function (name) {
    return fs.readFileSync(path.join(root, "js", name), "utf8");
}).join("\n") + fs.readFileSync(path.join(root, "main.js"), "utf8");
assert(/webapis\.avplay/.test(sources), "avplay privilege has a use");
assert(/webapis\.productinfo/.test(sources), "productinfo privilege has a use");
assert(/tizen\.tvinputdevice/.test(sources), "tv.inputdevice privilege has a use");

// The signed application ID is private to the owner's certificate and injected at staging.
assert(!/<tizen:application[^>]*\bid=/.test(config), "No application ID is committed");
assert(!/<tizen:application[^>]*\bpackage=/.test(config), "No package ID is committed");

// PMS servers live at arbitrary user-specific LAN, plex.direct and remote origins, so network
// access cannot be enumerated; keep it to exactly one wildcard rule.
var access = config.match(/<access\b[^>]*>/g) || [];
assert.deepStrictEqual(access, ['<access origin="*" subdomains="true"/>']);

console.log("Tizen manifest privilege/identifier/access contracts: passed");
