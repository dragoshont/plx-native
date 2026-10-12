"use strict";
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var JSDOM = require("jsdom").JSDOM;
var app = path.resolve(__dirname, "../../samsung/PlexTv");

async function run() {
    var dom = new JSDOM(fs.readFileSync(path.join(app, "index.html"), "utf8"), {
        url: "https://app.synthetic.invalid", runScripts: "outside-only"
    });
    var window = dom.window;
    var requested = [];
    window.TextDecoder = TextDecoder;
    window.URL.createObjectURL = function () { return "blob:synthetic"; };
    window.URL.revokeObjectURL = function () {};
    window.fetch = function (target) {
        var url = new URL(target);
        if (url.pathname === "/photo/:/transcode") {
            requested.push(url.searchParams.get("url"));
            return Promise.resolve(new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/png" } }));
        }
        var container;
        if (url.pathname === "/library/sections") { container = { Directory: [] }; }
        else if (url.pathname === "/hubs/promoted") {
            container = { Hub: [{ title: "Recently added", Metadata: [
                { ratingKey: "1", type: "movie", title: "No poster", art: "/library/metadata/1/art/9" },
                { ratingKey: "2", type: "movie", title: "Nothing" }
            ] }] };
        } else { throw new Error("Unexpected synthetic request: " + url.pathname); }
        return Promise.resolve({ ok: true, status: 200, json: function () {
            return Promise.resolve({ MediaContainer: container });
        } });
    };
    ["js/plex-api.js", "js/preferences.js", "js/i18n.js", "js/home-hero.js", "main.js"].forEach(function (file) {
        window.eval(fs.readFileSync(path.join(app, file), "utf8"));
    });
    window.document.querySelector('input[name="server"]').value = "https://pms.synthetic.invalid";
    Array.from(window.document.querySelectorAll("button")).find(function (node) {
        return node.textContent === "Connect";
    }).click();
    for (var i = 0; i < 40; i += 1) { await Promise.resolve(); }
    await new Promise(function (resolve) { setImmediate(resolve); });
    var images = Array.from(window.document.querySelectorAll("img.poster"));
    var byTitle = {};
    images.forEach(function (image) { byTitle[image.alt] = image; });
    assert.ok(byTitle["No poster"] && byTitle.Nothing, "Both synthetic cards must render");
    assert.notStrictEqual(byTitle["No poster"].getAttribute("data-artwork-error"), "metadata",
        "A movie without a poster but with background art must fall back to the art (device ratingKey 7796)");
    assert.ok(requested.some(function (url) { return url && url.indexOf("/library/metadata/1/art/9") === 0; }),
        "The art fallback must be requested through the server transcoder");
    assert.strictEqual(byTitle.Nothing.getAttribute("data-artwork-error"), "metadata",
        "An item with no artwork at all must still report missing metadata");
    window.close();
    console.log("artwork fallback: ok");
}

run().catch(function (error) { console.error(error); process.exit(1); });
