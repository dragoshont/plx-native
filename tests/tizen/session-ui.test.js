"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/PlexTv");
var session = require("../../samsung/PlexTv/js/session");

function harness(saved, failure) {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var data = {};
    var tokens = [];
    var switches = 0;
    var expired = false;
    var storage = {
        getItem: function (key) { return data[key] || null; },
        setItem: function (key, value) {
            if (failure === "save") { throw new Error("Synthetic storage failure"); }
            data[key] = value;
        },
        removeItem: function (key) {
            if (failure === "delete") { throw new Error("Synthetic storage failure"); }
            delete data[key];
        }
    };
    if (saved) { data["plx-tizen-account"] = JSON.stringify({ version: 1, unencryptedAccepted: true, token: saved }); }
    Object.defineProperty(dom.window, "localStorage", { value: storage });
    dom.window.PlexApi = {
        createAuthClient: function () { return {
            startAuthorization: function () { return Promise.resolve({ code: "TEST", id: 1 }); },
            pollAuthorization: function () { return Promise.resolve({ status: "linked", token: "synthetic-account-token" }); }
        }; },
        createAccountClient: function (options) {
            tokens.push(options.token);
            return {
                getProfiles: function () {
                    return expired ? Promise.reject({ status: 401, scope: "account", message: "Expired" }) :
                        Promise.resolve([{ uuid: "synthetic-profile", title: "Protected", protected: true }]);
                },
                switchProfile: function (uuid, pin) {
                    switches += 1;
                    assert.strictEqual(pin, "1234");
                    return Promise.resolve("synthetic-profile-token");
                },
                getServers: function () {
                    if (failure === "server-denial") {
                        return Promise.resolve([{ id: "synthetic-server", name: "Synthetic", token: "synthetic-server-token",
                            connections: [{ uri: "https://server.synthetic.invalid" }] }]);
                    }
                    return Promise.reject({ status: 401, scope: "account", message: "Expired" });
                }
            };
        },
        selectServer: function () {
            return Promise.resolve({ client: {
                getSections: function () { return Promise.reject({ status: 403, scope: "server", message: "Server access denied" }); },
                getHomeHubs: function () { return Promise.resolve([]); }
            } });
        }
    };
    ["js/session.js", "main.js"].forEach(function (file) {
        dom.window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    return {
        dom: dom, storage: storage, tokens: tokens,
        switches: function () { return switches; },
        expire: function () { expired = true; },
        text: function () { return dom.window.document.body.textContent; },
        click: function (label) {
            var node = Array.from(dom.window.document.querySelectorAll("button")).find(function (button) {
                return button.textContent === label;
            });
            assert(node, "Missing control: " + label);
            node.click();
        }
    };
}
async function settle() {
    for (var i = 0; i < 15; i += 1) { await Promise.resolve(); }
}
async function run() {
    var denied = harness("synthetic-account-token", "server-denial");
    await settle();
    denied.click("Use linked account");
    await settle();
    denied.click("Synthetic (shared)");
    await settle();
    assert.strictEqual(session.load(denied.storage), "synthetic-account-token", "PMS access denial must not erase the Plex account");
    assert(denied.text().includes("Server access denied"));
    denied.dom.window.close();
    var app = harness("");
    assert.strictEqual(app.dom.window.document.querySelector(".remember-checkbox").checked, false);
    app.click("Sign in to Plex");
    await settle();
    assert.strictEqual(session.load(app.storage), "");
    app.dom.window.close();

    app = harness("");
    app.dom.window.document.querySelector(".remember-checkbox").checked = true;
    app.click("Sign in to Plex");
    await settle();
    assert.strictEqual(session.load(app.storage), "synthetic-account-token");
    app.click("Sign out");
    assert.strictEqual(session.load(app.storage), "");
    app.dom.window.close();

    app = harness("synthetic-account-token");
    await settle();
    assert.deepStrictEqual(app.tokens, ["synthetic-account-token"]);
    app.click("Protected");
    app.click("Use this profile");
    assert.strictEqual(app.switches(), 0);
    app.dom.window.document.querySelector("input").value = "1234";
    app.click("Use this profile");
    await settle();
    assert.strictEqual(app.switches(), 1);
    assert.strictEqual(session.load(app.storage), "", "Expired grants must delete the root saved credential");
    app.dom.window.close();

    app = harness("", "save");
    app.dom.window.document.querySelector(".remember-checkbox").checked = true;
    app.click("Sign in to Plex");
    await settle();
    assert(app.text().includes("session could not be saved"), "A next-screen status must not erase the storage warning");
    app.dom.window.close();

    app = harness("synthetic-account-token", "delete");
    await settle();
    app.click("Use linked account");
    await settle();
    assert(app.text().includes("Clear this app's data"), "Expiry recovery must retain a deletion-failure warning");
    app.dom.window.close();
    console.log("Tizen session relaunch/PIN/consent/expiry/error UI tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
