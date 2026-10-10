"use strict";
var assert = require("assert");
var api = require("../../samsung/PlexTv/js/plex-api.js");

async function run() {
    var calls = [];
    var attempts = [];
    var server = { id: "synthetic-machine", token: "synthetic-server-grant", connections: [
        { uri: "https://direct.invalid", relay: false },
        { uri: "https://relay.invalid", relay: true }
    ] };
    var selected = await api.selectServer(server, {
        onAttempt: function (attempt) { attempts.push(attempt); },
        fetch: function (url, options) {
        calls.push({ url: url, options: options });
        if (url.indexOf("direct") !== -1) { return Promise.reject(new Error("offline")); }
        return Promise.resolve({ ok: true, status: 200, json: function () {
            return Promise.resolve({ MediaContainer: { machineIdentifier: server.id } });
        } });
    } });
    assert.strictEqual(selected.relay, true);
    assert.strictEqual(calls.length, 2);
    assert.deepStrictEqual(attempts, [
        { index: 1, total: 2, relay: false },
        { index: 2, total: 2, relay: true }
    ], "Connection progress must report attempts without exposing advertised origins or grants");
    calls.forEach(function (call) {
        assert.strictEqual(call.options.headers["X-Plex-Token"], server.token);
        assert.strictEqual(call.options.credentials, "omit");
        assert.strictEqual(call.url.indexOf(server.token), -1);
    });
    await assert.rejects(api.selectServer({ id: server.id, token: "", connections: server.connections }),
        function (error) { return error.code === "unavailable"; });
    await assert.rejects(api.selectServer(server, { fetch: function () {
        return Promise.resolve({ ok: false, status: 401 });
    } }), function (error) { return error.status === 401; });
    await assert.rejects(api.selectServer(server, { fetch: function () {
        return Promise.resolve({ ok: true, status: 200, json: function () {
            return Promise.resolve({ MediaContainer: { machineIdentifier: "another-machine" } });
        } });
    } }), function (error) { return error.code === "identity-mismatch"; });
    console.log("Tizen synthetic server selection tests: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
