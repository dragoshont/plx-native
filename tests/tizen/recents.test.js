"use strict";
var assert = require("assert");
var recents = require("../../samsung/Vemm/js/recents");
function store() {
    var data = {};
    return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
        setItem: function (k, v) { data[k] = String(v); }, removeItem: function (k) { delete data[k]; }, data: data };
}
var s = store();
assert.deepStrictEqual(recents.load(s, "p1"), [], "No history is an empty list");
recents.remember(s, "p1", "wallace");
recents.remember(s, "p1", "laura");
assert.deepStrictEqual(recents.load(s, "p1"), ["laura", "wallace"], "Newest first");
recents.remember(s, "p1", "  WALLACE ");
assert.deepStrictEqual(recents.load(s, "p1"), ["WALLACE", "laura"], "A case variant moves, the new spelling wins");
recents.remember(s, "p1", "   ");
assert.deepStrictEqual(recents.load(s, "p1"), ["WALLACE", "laura"], "Blank is not a search");
["a", "b", "c", "d", "e"].forEach(function (t) { recents.remember(s, "p1", t); });
assert.deepStrictEqual(recents.load(s, "p1"), ["e", "d", "c", "b"], "History is capped like LG");
assert.deepStrictEqual(recents.load(s, "p2"), [], "History is per profile");
recents.remember(s, "p2", "other");
recents.clear(s, "p1");
assert.deepStrictEqual(recents.load(s, "p1"), [], "Clear empties one profile");
assert.deepStrictEqual(recents.load(s, "p2"), ["other"], "Clear leaves other profiles");
recents.remember(s, "", "x");
assert.deepStrictEqual(recents.load(s, ""), [], "No profile identity stores nothing");
s.setItem("vemm-tizen-recent-searches", "{broken");
assert.deepStrictEqual(recents.load(s, "p2"), [], "Corrupt history is ignored, not fatal");
recents.remember(s, "p2", "fresh");
assert.deepStrictEqual(recents.load(s, "p2"), ["fresh"], "Corrupt history is replaced on the next write");
s.setItem("vemm-tizen-recent-searches", JSON.stringify({ p2: ["ok", 5, "", "OK", "x\u0000y"] }));
assert.deepStrictEqual(recents.load(s, "p2"), ["ok"], "Stored values are sanitized");
recents.reset(s);
assert.strictEqual(s.getItem("vemm-tizen-recent-searches"), null);
var throwing = { getItem: function () { throw new Error("denied"); }, setItem: function () { throw new Error("denied"); } };
assert.deepStrictEqual(recents.load(throwing, "p1"), [], "Storage failure degrades to no history");
assert.doesNotThrow(function () { recents.remember(throwing, "p1", "x"); });
console.log("recents: ok");
