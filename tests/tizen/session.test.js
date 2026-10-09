"use strict";
var assert = require("assert");
var session = require("../../samsung/PlexTv/js/session.js");
var value;
var storage = {
    getItem: function () { return value || null; },
    setItem: function (key, next) { value = next; },
    removeItem: function () { value = null; }
};
assert.strictEqual(session.load(storage), "");
assert.throws(function () { session.remember(storage, "synthetic-account-token", false); }, /explicit consent/);
assert.strictEqual(value, undefined, "No credential persistence without consent");
session.remember(storage, "synthetic-account-token", true);
assert.strictEqual(session.load(storage), "synthetic-account-token");
assert.throws(function () { session.remember(storage, "newline\nsecret", true); }, /consent/);
session.forget(storage);
assert.strictEqual(session.load(storage), "");
value = "{}";
assert.throws(function () { session.load(storage); }, /invalid/);
console.log("Tizen session opt-in/validation/deletion tests: passed");
