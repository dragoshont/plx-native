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
        ] }, { provides: "server", name: "Offline owned server", clientIdentifier: "machine-2",
            owned: true, connections: [null, { uri: "https://bad.invalid/path" }] },
        { provides: "player", connections: [] },
        // plex.tv can register a real PMS as provides="sync" (observed 2026-10 on a live owned
        // server); product still names it, and selectServer verifies the machine identifier.
        { provides: "sync", product: "Plex Media Server", name: "Mislabelled owned server",
            clientIdentifier: "machine-3", accessToken: "synthetic-owned-token", owned: true,
            connections: [{ uri: "https://10-0-0-2.hash.plex.direct:32400", local: true }] },
        { provides: "sync", product: "Plex Sync Agent", clientIdentifier: "not-a-server", connections: [] },
        null]
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
    assert.strictEqual(servers.length, 3);
    assert.strictEqual(servers[2].id, "machine-3");
    assert.strictEqual(servers[2].owned, true);
    assert.strictEqual(servers[2].connections.length, 1);
    assert.strictEqual(servers[1].owned, true);
    assert.strictEqual(servers[1].token, "");
    assert.strictEqual(servers[1].connections.length, 0);
    assert.strictEqual(servers[0].connections.length, 2);
    assert.strictEqual(servers[0].connections[0].uri, "https://server.invalid:32400");
    assert.strictEqual(servers[0].token, "synthetic-server-token");
    calls.forEach(function (call) {
        assert.strictEqual(call.url.indexOf("token"), -1);
        assert.strictEqual(call.options.headers["X-Plex-Token"], "synthetic-account-token");
        assert.strictEqual(call.options.redirect, "error");
    });
    var refused = api.createAccountClient({
        token: "synthetic-token", fetch: function () { return Promise.resolve({ ok: false, status: 401 }); }
    });
    return refused.getServers().then(function () { assert.fail("401 must not become an empty server list"); },
        function (error) { assert.strictEqual(error.status, 401); });
}).then(function () {
    console.log("Tizen account/profile/server tests: passed");
}).catch(function (error) { console.error(error); process.exitCode = 1; });
