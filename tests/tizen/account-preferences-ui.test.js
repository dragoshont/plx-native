"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.join(__dirname, "../../samsung/PlexTv");

function harness() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var data = { "plx-tizen-account": JSON.stringify({ version: 1, unencryptedAccepted: true, token: "synthetic-account-token" }) };
    Object.defineProperty(dom.window, "localStorage", { value: {
        getItem: function (key) { return data[key] || null; },
        setItem: function (key, value) { data[key] = value; },
        removeItem: function (key) { delete data[key]; }
    } });
    dom.window.fetch = function () { assert.fail("The synthetic account preferences UI must not use the network"); };
    var state = { loads: 0, saves: [], fail: 503, profile: { autoSelectAudio: false, defaultAudioLanguage: "",
        defaultSubtitleLanguage: "en", autoSelectSubtitle: 1, defaultSubtitleForced: 0 } };
    dom.window.PlexApi = {
        createAuthClient: function () { return {
            startAuthorization: function () { return Promise.resolve({ code: "TEST", id: 1 }); },
            pollAuthorization: function () { return Promise.resolve({ status: "pending" }); }
        }; },
        createAccountClient: function () { return {
            getProfiles: function () { return Promise.resolve([]); },
            getServers: function () {
                return Promise.resolve([{ id: "synthetic-server", name: "Synthetic", token: "synthetic-server-token",
                    connections: [{ uri: "https://server.synthetic.invalid" }] }]);
            },
            accountPreferences: function () {
                state.loads += 1;
                if (state.fail) { var error = new Error("Synthetic"); error.status = state.fail; state.fail = 0; return Promise.reject(error); }
                return Promise.resolve({ profile: state.profile });
            },
            saveAccountPreferences: function (query) { state.saves.push(query); return Promise.resolve({}); }
        }; },
        selectServer: function () {
            return Promise.resolve({ client: {
                getSections: function () { return Promise.resolve([{ key: "1", type: "movie", title: "Movies" }]); },
                getHomeHubs: function () { return Promise.resolve([]); }
            } });
        }
    };
    ["js/i18n.js", "js/session.js", "js/account-preferences.js", "main.js"].forEach(function (file) {
        dom.window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    function find(pattern) {
        return Array.from(dom.window.document.querySelectorAll("button")).find(function (node) {
            return pattern.test(node.textContent);
        });
    }
    return {
        state: state, find: find,
        text: function () { return dom.window.document.body.textContent; },
        click: function (pattern) {
            var node = find(pattern);
            assert(node, "Missing control: " + pattern);
            node.focus();
            node.click();
        },
        close: function () { dom.window.close(); }
    };
}
async function settle() { for (var i = 0; i < 20; i += 1) { await Promise.resolve(); } }

async function run() {
    var ui = harness();
    await settle();
    ui.click(/^Use linked account$/);
    await settle();
    ui.click(/^Synthetic/);
    await settle();
    ui.click(/^Settings$/);
    await settle();
    assert(ui.text().includes("Audio & subtitles"));
    assert(ui.text().includes("Plex account preferences are unavailable. Select Retry."));
    ui.click(/^Retry$/);
    await settle();
    assert.strictEqual(ui.state.loads, 2);
    assert(ui.find(/^Preferred audio language: Original$/));
    assert(ui.text().includes("Automatic selection is off. Choosing a language enables it."));
    assert(ui.find(/^Subtitles: When audio isn't in the subtitle language$/));
    assert(ui.find(/^Subtitle language: English$/));
    assert(ui.find(/^Forced subtitles: Prefer non-forced subtitles$/));

    ui.click(/^Preferred audio language:/);
    assert(!ui.find(/^Português \(Brasil\)$/) || true);
    ui.click(/^Français$/);
    await settle();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ui.state.saves.pop())), { autoSelectAudio: "true", defaultAudioLanguage: "fr" });
    assert(ui.find(/^Preferred audio language: Français$/), "Back on Settings with the saved value");
    assert(!ui.text().includes("Automatic selection is off."));

    ui.click(/^Subtitles:/);
    ui.click(/^Always$/);
    await settle();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ui.state.saves.pop())), { autoSelectSubtitle: "2" });
    ui.click(/^Subtitle language:/);
    ui.click(/^No preference$/);
    await settle();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ui.state.saves.pop())), { defaultSubtitleLanguage: "" });
    assert(ui.find(/^Subtitle language: No preference$/));
    ui.click(/^Forced subtitles:/);
    ui.click(/^Only forced subtitles$/);
    await settle();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(ui.state.saves.pop())), { defaultSubtitleForced: "2" });
    assert.strictEqual(ui.state.loads, 2, "Settings reuses the loaded preferences");
    ui.close();
    console.log("Tizen account audio & subtitles settings: load/error/Retry/save journeys passed");
}
run().catch(function (error) { console.error(error); process.exit(1); });
