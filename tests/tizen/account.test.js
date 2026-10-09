"use strict";
var assert = require("assert");
var api = require("../../samsung/PlexTv/js/plex-api.js");
var calls = [];
var responses = [
    { users: [{ uuid: "user-1", title: "Guest", protected: true }] },
    { authToken: "synthetic-profile-token" },
    [{ provides: "server", name: "Synthetic server", clientIdentifier: "machine-1",
        accessToken: "synthetic-server-token", owned: false, connections: [
            { uri: "http://127.0.0.1:32400", local: true },
            { uri: "https://relay.invalid", relay: true },
            { uri: "https://server.invalid:32400", local: true }
        ] }, { provides: "player", connections: [] }]
];
var client = api.createAccountClient({
    token: "synthetic-account-token",
    fetch: function (url, options) {
        calls.push({ url: url, options: options });
        return Promise.resolve({ ok: true, json: function () { return Promise.resolve(responses.shift()); } });
    }
});
client.getProfiles().then(function (profiles) {
    assert.strictEqual(profiles[0].title, "Guest");
    return client.switchProfile("user-1", "1234");
}).then(function (token) {
    assert.strictEqual(token, "synthetic-profile-token");
    assert.strictEqual(calls[1].options.method, "POST");
    assert.strictEqual(calls[1].options.body, "pin=1234");
    assert.strictEqual(calls[1].url.indexOf("1234"), -1);
    return client.getServers();
}).then(function (servers) {
    assert.strictEqual(servers.length, 1);
    assert.strictEqual(servers[0].connections.length, 2);
    assert.strictEqual(servers[0].connections[0].uri, "https://server.invalid:32400");
    assert.strictEqual(servers[0].token, "synthetic-server-token");
    calls.forEach(function (call) {
        assert.strictEqual(call.url.indexOf("token"), -1);
        assert.strictEqual(call.options.headers["X-Plex-Token"], "synthetic-account-token");
    });
    var refused = api.createAccountClient({
        token: "synthetic-token", fetch: function () { return Promise.resolve({ ok: false, status: 401 }); }
    });
    return refused.getServers().then(function () { assert.fail("401 must not become an empty server list"); },
        function (error) { assert.strictEqual(error.status, 401); });
}).then(function () {
    console.log("Tizen account/profile/server tests: passed");
}).catch(function (error) { console.error(error); process.exitCode = 1; });
