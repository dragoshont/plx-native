"use strict";
var assert = require("assert");
var hero = require("../../samsung/PlexTv/js/home-hero.js");

function items(prefix, type, count) {
    var out = [];
    for (var i = 1; i <= count; i += 1) { out.push({ ratingKey: prefix + i, type: type }); }
    return out;
}
function keys(list) { return list.map(function (item) { return item.ratingKey; }); }

var hubs = [
    { hubIdentifier: "home.continue", Metadata: items("c", "episode", 2) },
    { hubIdentifier: "home.movies.recent", Metadata: items("m", "movie", 10) },
    { hubIdentifier: "home.television.recent", Metadata: items("t", "show", 10) }
];
assert.deepStrictEqual(keys(hero.pick(hubs, 8)), ["c1", "m1", "t1", "c2", "m2", "t2", "m3", "t3"],
    "The banner alternates between Continue Watching and every Recently Added row instead of filling from the first movie row");

var promoted = [
    { hubIdentifier: "movie.recentlyadded.1", Metadata: items("m", "movie", 10) },
    { hubIdentifier: "movie.inprogress.1", Metadata: items("x", "movie", 10) },
    { hubIdentifier: "tv.recentlyaired.2", Metadata: items("a", "episode", 1) },
    { hubIdentifier: "tv.recentlyadded.2", Metadata: items("t", "show", 10) }
];
assert.deepStrictEqual(keys(hero.pick(promoted, 4)), ["m1", "a1", "t1", "m2"],
    "Only Continue Watching and recent rows feed the banner, as on the LG client");

var duplicate = [
    { hubIdentifier: "home.continue", Metadata: [{ ratingKey: "s1", type: "episode" }, { ratingKey: "x", type: "season" }] },
    { hubIdentifier: "home.television.recent", Metadata: [{ ratingKey: "s1", type: "episode" }, { type: "show" }, { ratingKey: "t2", type: "show" }] }
];
assert.deepStrictEqual(keys(hero.pick(duplicate, 8)), ["s1", "t2"],
    "Items are de-duplicated, need a ratingKey, and seasons or other types are skipped");

var noRecent = [
    { hubIdentifier: "movie.inprogress.1", Metadata: items("x", "movie", 2) },
    { hubIdentifier: "tv.ondeck.2", Metadata: items("y", "episode", 2) }
];
assert.deepStrictEqual(keys(hero.pick(noRecent, 8)), ["x1", "y1", "x2", "y2"],
    "A Home with no recent rows still gets a balanced banner from the rows it has");

assert.deepStrictEqual(hero.pick([], 8), []);
assert.deepStrictEqual(hero.pick([{ hubIdentifier: "home.continue" }], 8), []);
console.log("home-hero tests passed");
