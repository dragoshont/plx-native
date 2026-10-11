"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/PlexTv");

function boot(firstStatus) {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var timers = new Map();
    var timerId = 0;
    var starts = 0;
    var fail = false;
    var now = 100000;
    var resolvePoll;
    window.Date.now = function () { return now; };
    window.setTimeout = function (callback, delay) {
        timers.set(++timerId, { callback: callback, delay: delay });
        return timerId;
    };
    window.clearTimeout = function (id) { timers.delete(id); };
    window.fetch = function () { assert.fail("Synthetic sign-in must not use the network"); };
    window.PlexApi = { createAuthClient: function () { return {
        startAuthorization: function () {
            starts += 1;
            if (fail) { return Promise.reject(new Error("Synthetic offline failure")); }
            return Promise.resolve({ id: starts, code: "CODE" + starts, expiresAt: now + 60000,
                qr: "https://plex.tv/synthetic-qr/" + starts });
        },
        pollAuthorization: function () {
            if (starts === 1 && firstStatus === "slow") {
                return new Promise(function (resolve) { resolvePoll = resolve; });
            }
            return Promise.resolve({ status: starts === 1 ? firstStatus : "pending" });
        },
        cancelRequests: function () {}
    }; } };
    window.eval(fs.readFileSync(path.join(app, "js/session.js"), "utf8"));
    window.eval(fs.readFileSync(path.join(app, "main.js"), "utf8"));
    return {
        window: window,
        starts: function () { return starts; },
        timers: function () { return timers.size; },
        fail: function (value) { fail = value; },
        fire: function (delay) {
            var entry = Array.from(timers.entries()).find(function (entry) { return entry[1].delay === delay; });
            assert(entry, "Missing timer: " + delay);
            timers.delete(entry[0]);
            now += delay;
            entry[1].callback();
        },
        resolveOld: function () { resolvePoll({ status: "linked", token: "synthetic-stale-token" }); },
        clickNew: function () {
            Array.from(window.document.querySelectorAll("button")).find(function (node) {
                return node.textContent === "Get a new code";
            }).click();
        }
    };
}
async function settle() {
    for (var i = 0; i < 30; i += 1) { await Promise.resolve(); }
}
async function run() {
    var ui = boot("expired");
    try {
        await settle();
        assert.strictEqual(ui.starts(), 2, "Server-expired PIN must renew without a button press");
        assert.strictEqual(ui.window.document.querySelector(".auth-code").textContent, "CODE2");
        assert(ui.window.document.querySelector(".auth-qr").src.endsWith("/2"), "Renew the QR with the PIN");
    } finally { ui.window.close(); }

    ui = boot("slow");
    try {
        await settle();
        assert.strictEqual(ui.window.document.querySelector(".remember-checkbox"), null,
            "PIN renewal must not add a credential-storage choice to primary sign-in");
        ui.fire(60000);
        await settle();
        assert.strictEqual(ui.starts(), 2, "Expiry must renew even while the previous poll is stalled");
        ui.resolveOld();
        await settle();
        assert.strictEqual(ui.window.document.querySelector(".auth-code").textContent, "CODE2",
            "An old poll must not link or overwrite the renewed PIN");
        ui.fail(true);
        ui.fire(60000);
        await settle();
        assert(ui.window.document.getElementById("status").className.includes("status-error"));
        ui.fail(false);
        ui.fire(5000);
        await settle();
        assert.strictEqual(ui.starts(), 4, "Retry renewal after a network failure");
        ui.clickNew();
        await settle();
        assert.strictEqual(ui.starts(), 5);
        ui.fire(60000);
        await settle();
        assert.strictEqual(ui.starts(), 6, "Manual renewal must cancel the old expiry timer");
        Object.defineProperty(ui.window.document, "hidden", { configurable: true, value: true });
        ui.window.document.dispatchEvent(new ui.window.Event("visibilitychange"));
        assert.strictEqual(ui.timers(), 0, "Backgrounding cancels polling and PIN renewal");
        Object.defineProperty(ui.window.document, "hidden", { configurable: true, value: false });
        ui.window.document.dispatchEvent(new ui.window.Event("visibilitychange"));
        await settle();
        assert.strictEqual(ui.starts(), 7, "Foregrounding starts a fresh pairing");
        ui.window.dispatchEvent(new ui.window.Event("pagehide"));
        assert.strictEqual(ui.timers(), 0, "Leaving the app cancels every pairing timer");
    } finally { ui.window.close(); }

    ui = boot("denied");
    try {
        await settle();
        assert.strictEqual(ui.starts(), 1, "Explicit denial must not be silently retried");
        assert(ui.window.document.body.textContent.includes("Sign-in was denied"));
    } finally { ui.window.close(); }
    console.log("Tizen automatic PIN/QR renewal, offline retry and stale-poll UI tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
