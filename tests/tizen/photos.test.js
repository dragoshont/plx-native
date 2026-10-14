"use strict";
var assert = require("assert");
var fs = require("fs");
var vm = require("vm");
async function run() {
    var timers = new Map(), buttons = {}, revoked = [], created = [], pending = [], messages = [];
    var context = { Promise: Promise,
        setTimeout: function (callback) { var id = {}; timers.set(id, callback); return id; },
        clearTimeout: function (id) { timers.delete(id); } };
    vm.runInNewContext(fs.readFileSync(require.resolve("../../samsung/Vemm/js/photos"), "utf8"), context);
    var image;
    function options(index) {
        return {
            items: [{ type: "photo", title: "One" }, { type: "photo", title: "Two" }], index: index,
            client: { photo: function (item) { return new Promise(function (resolve) { pending.push({ item: item, resolve: resolve }); }); } },
            element: function (tag) {
                var node = { removeAttribute: function () { this.src = ""; } };
                if (tag === "img") { image = node; }
                return node;
            },
            parent: { appendChild: function () {} },
            urls: { createObjectURL: function () { var url = "blob:" + created.length; created.push(url); return url; },
                revokeObjectURL: function (url) { revoked.push(url); } },
            status: function (text) { messages.push(text); }, translate: function (text) { return text; },
            button: function (parent, label, callback) { buttons[label] = callback; }, back: function () {}
        };
    }
    async function settle() { for (var i = 0; i < 10; i += 1) { await Promise.resolve(); } }
    assert.throws(function () { context.VemmPhotos.create(options(0.5)); }, /not available/);
    var viewer = context.VemmPhotos.create(options(0));
    await settle();
    buttons["Next photo"](); await settle();
    pending[0].resolve({}); await settle();
    assert.strictEqual(created.length, 0, "A superseded photo must not allocate an object URL");
    pending[1].resolve({}); await settle();
    assert.strictEqual(timers.size, 1, "Image decode must have a finite deadline");
    timers.forEach(function (callback) { callback(); });
    assert(messages.pop().includes("could not be decoded"));
    assert.deepStrictEqual(revoked, created);
    buttons["Slideshow / Pause"](); await settle();
    pending[2].resolve({}); await settle();
    image.onload();
    assert.strictEqual(timers.size, 1, "Slideshow schedules only after decode");
    buttons["Slideshow / Pause"]();
    assert.strictEqual(timers.size, 0);
    buttons["Next photo"](); await settle();
    viewer.close();
    pending[3].resolve({}); await settle();
    assert.strictEqual(created.length, 2, "Closed viewer ignores late downloads");
    assert.deepStrictEqual(revoked, created);
    assert.strictEqual(timers.size, 0);
    assert.strictEqual(image.onload, null);
    console.log("Tizen photo generation/decode deadline/slideshow/resource cleanup: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
