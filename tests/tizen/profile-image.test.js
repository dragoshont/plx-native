"use strict";
var assert = require("assert");
var api = require("../../samsung/PlexTv/js/plex-api.js");

async function run() {
    var calls = [];
    var client = api.createAccountClient({
        token: "synthetic-private-token",
        fetch: function (url, options) {
            calls.push({ url: url, options: options });
            return Promise.resolve(new Response(new Blob(["synthetic image"], { type: "image/png" })));
        }
    });
    var blob = await client.image("https://plex.tv/users/synthetic/avatar?c=123");
    assert(blob.size > 0);
    assert.strictEqual(calls[0].options.credentials, "omit");
    assert.strictEqual(calls[0].options.redirect, "error");
    assert.strictEqual(calls[0].options.headers["X-Plex-Token"], undefined,
        "Public avatar requests must not send the account token");
    for (var path of [
        "https://other.invalid/users/synthetic/avatar",
        "https://plex.tv.other.invalid/users/synthetic/avatar",
        "https://plex.tv@other.invalid/users/synthetic/avatar",
        "http://plex.tv/users/synthetic/avatar",
        "https://plex.tv/users/synthetic/avatar?X-Plex-Token=secret",
        "https://plex.tv/users/synthetic/avatar/../api/v2/user"
    ]) {
        await assert.rejects(client.image(path), /Invalid Plex profile artwork/);
    }
    assert.strictEqual(calls.length, 1, "Unsafe avatar paths must be refused before network access");
    console.log("Tizen profile image origin/credential boundaries: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
