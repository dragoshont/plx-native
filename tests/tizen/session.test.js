"use strict";
var assert = require("assert");
var session = require("../../samsung/Vemm/js/session.js");
var value;
var storage = {
    getItem: function () { return value || null; },
    setItem: function (key, next) { value = next; },
    removeItem: function () { value = null; }
};
assert.strictEqual(session.load(storage), "");
session.save(storage, "synthetic-default-token");
assert.strictEqual(session.load(storage), "synthetic-default-token");
assert.strictEqual(JSON.parse(value).version, 2);
assert.strictEqual(JSON.parse(value).unencryptedAccepted, undefined,
    "Default persistence must not manufacture an explicit-consent record");
assert.throws(function () { session.save(storage, "newline\nsecret"); }, /Invalid/);
session.forget(storage);
value = undefined;
var preferences = {};
var preferenceStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(preferences, key) ? preferences[key] : null; },
    setItem: function (key, next) { preferences[key] = next; },
    removeItem: function (key) { delete preferences[key]; }
};
assert.strictEqual(session.enabled(preferenceStorage), true);
session.setEnabled(preferenceStorage, false);
session.save(preferenceStorage, "synthetic-account-token");
session.forget(preferenceStorage);
assert.strictEqual(session.enabled(preferenceStorage), false, "Sign-out must retain the explicit persistence opt-out");
session.setEnabled(preferenceStorage, true);
assert.strictEqual(session.enabled(preferenceStorage), true);
assert.throws(function () { session.remember(storage, "synthetic-account-token", false); }, /explicit consent/);
assert.strictEqual(value, undefined, "No credential persistence without consent");
session.remember(storage, "synthetic-account-token", true);
assert.strictEqual(session.load(storage), "synthetic-account-token");
assert.deepStrictEqual(JSON.parse(value), {
    version: 2, storage: "unencrypted", token: "synthetic-account-token"
}, "Vemm writes only its current session format");
assert.throws(function () { session.remember(storage, "newline\nsecret", true); }, /consent/);
session.forget(storage);
assert.strictEqual(session.load(storage), "");
value = "{}";
assert.throws(function () { session.load(storage); }, /invalid/);
value = JSON.stringify({ version: 1, unencryptedAccepted: true, token: "synthetic-account-token" });
assert.throws(function () { session.load(storage); }, /invalid/,
    "Vemm must not import the historical session-record format");
console.log("Tizen session opt-in/validation/deletion tests: passed");
