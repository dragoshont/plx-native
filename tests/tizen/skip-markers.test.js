"use strict";
// Skip Intro / Skip Credits rules, ported from the LG client's `marker_at` and skip pill.
// Markers are the shape PMS returns under `includeMarkers=1`.
var assert = require("assert");
var skip = require("../../samsung/PlexTv/js/skip-markers");

var markers = [
    { id: 1, type: "intro", startTimeOffset: 30000, endTimeOffset: 90000 },
    { id: 2, type: "commercial", startTimeOffset: 600000, endTimeOffset: 660000 },
    { id: 3, type: "credits", startTimeOffset: 1200000, endTimeOffset: 1260000 },
    { id: 4, type: "credits", startTimeOffset: 1300000, endTimeOffset: 1320000, final: "1" }
];

assert.strictEqual(skip.markerAt(markers, 29999, {}), null, "before the intro");
assert.strictEqual(skip.markerAt(markers, 30000, {}).id, 1, "the start is inside");
assert.strictEqual(skip.markerAt(markers, 89999, {}).id, 1);
assert.strictEqual(skip.markerAt(markers, 90000, {}), null, "the end is exclusive");
assert.strictEqual(skip.markerAt(markers, 630000, {}), null, "commercial markers never prompt");
assert.strictEqual(skip.markerAt(markers, 1260000, {}), null, "ordinary credits end");
assert.strictEqual(skip.markerAt(markers, 1400000, {}).id, 4, "final credits run to the end of the item");

var intro = skip.prompt(skip.markerAt(markers, 45000, {}));
assert.deepStrictEqual(intro, { key: "intro:30000", label: "Skip Intro", action: "seek", target: 90000 });
var credits = skip.prompt(skip.markerAt(markers, 1210000, {}));
assert.strictEqual(credits.label, "Skip Credits");
assert.strictEqual(credits.action, "seek");
var finalCredits = skip.prompt(skip.markerAt(markers, 1310000, {}));
assert.strictEqual(finalCredits.action, "finish", "skipping final credits finishes the item");

var skipped = {};
skipped[intro.key] = true;
assert.strictEqual(skip.markerAt(markers, 89000, skipped), null, "a skipped marker does not come back");
assert.strictEqual(skip.prompt(null), null);
assert.strictEqual(skip.markerAt(undefined, 1000, {}), null, "items without markers");
console.log("skip-markers ok");
