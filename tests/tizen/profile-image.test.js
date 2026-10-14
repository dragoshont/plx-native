"use strict";
var assert = require("assert");
var api = require("../../samsung/Vemm/js/plex-api.js");

var finalUrl = null;
function finalResponse(url) {
    var response = new Response(new Blob(["synthetic image"], { type: "image/png" }));
    Object.defineProperty(response, "url", { value: finalUrl === null ? url : finalUrl });
    return response;
}

async function run() {
    var calls = [];
    var client = api.createAccountClient({
        token: "synthetic-private-token",
        fetch: function (url, options) {
            calls.push({ url: url, options: options });
            return Promise.resolve(finalResponse(url));
        }
    });
    var blob = await client.image("https://plex.tv/users/synthetic/avatar?c=123");
    assert(blob.size > 0);
    assert.strictEqual(calls[0].options.credentials, "omit");
    // plex.tv answers the avatar URL with a 302 to assets.plex.tv (observed on a 2017 Samsung
    // TV, Chrome 47): "error" cancelled every profile picture, so the redirect is followed and
    // the FINAL URL is held to the asset host instead (Chrome 47 has no response.redirected).
    assert.strictEqual(calls[0].options.redirect, "follow");
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
    finalUrl = "https://assets.plex.tv/avatars/synthetic-id_9?size=1";
    assert((await client.image("https://plex.tv/users/synthetic/avatar?c=1")).size > 0,
        "The observed assets.plex.tv redirect target is accepted");
    // Device-observed (Samsung 2017, build f8456522): the final filename carries one extension.
    finalUrl = "https://assets.plex.tv/avatars/synthetic-id_9.png?size=1";
    assert((await client.image("https://plex.tv/users/synthetic/avatar?c=1")).size > 0,
        "An avatar filename with a single extension is accepted");
    // Device-observed final shape on f8456522: '<id>.' — a trailing dot and no extension.
    finalUrl = "https://assets.plex.tv/avatars/synthetic-id_9.?size=1";
    assert((await client.image("https://plex.tv/users/synthetic/avatar?c=1")).size > 0,
        "The observed trailing-dot avatar filename is accepted");
    for (var target of [
        "", "https://other.invalid/avatars/synthetic", "http://assets.plex.tv/avatars/synthetic",
        "https://assets.plex.tv.other.invalid/avatars/synthetic", "https://assets.plex.tv/api/v2/user",
        "https://assets.plex.tv/avatars/../users", "https://user@assets.plex.tv/avatars/synthetic",
        "https://plex.tv/api/v2/user", "https://assets.plex.tv/avatars/.png",
        "https://assets.plex.tv/avatars/a..png", "https://assets.plex.tv/avatars/a..", "https://assets.plex.tv/avatars/.", "https://assets.plex.tv/avatars/a.png.js",
        "https://assets.plex.tv/avatars/a.png/x", "https://assets.plex.tv/avatars/a.png%2F..%2Fx"
    ]) {
        finalUrl = target;
        await assert.rejects(client.image("https://plex.tv/users/synthetic/avatar?c=1"), /Invalid Plex profile artwork/,
            "A redirect away from the avatar asset host is refused: " + target);
    }
    console.log("Tizen profile image origin/credential boundaries: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
