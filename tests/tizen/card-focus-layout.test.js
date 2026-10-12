"use strict";
var assert = require("assert");
var fs = require("fs");
var JSDOM = require("jsdom").JSDOM;
var css = fs.readFileSync(require.resolve("../../samsung/PlexTv/css/style.css"), "utf8");

function rule(selector) {
    var escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    var match = new RegExp("(?:^|[},])\\s*" + escaped + "\\s*(?:,[^{]*)?\\{([^}]*)\\}", "m").exec(css);
    return match ? match[1] : "";
}

// Library posters must keep the 2:3 artwork aspect so server-side corner overlays are not cropped.
var dom = new JSDOM("<style>" + css + "</style><section class='screen screen-library'>" +
    "<div class='item-list'><button class='media-card'><img class='poster'></button></div></section>");
try {
    var poster = dom.window.getComputedStyle(dom.window.document.querySelector(".poster"));
    assert(["calc((90vw - 156px) / 4)", "calc(0.25 * (90vw - 156px))"].indexOf(poster.height) >= 0,
        "Library poster height must be 1.5x the six-column card width (2:3) so poster overlays are not cropped");
} finally { dom.window.close(); }

// The account avatar covers its own button background, so focus needs a ring outside it.
assert(/box-shadow:\s*0 0 0 4px #ffffff/.test(rule(".browse-header .account-control:focus")),
    "Focused account/avatar control needs a visible ring that the avatar image cannot cover");

// Library cards need the same emphasis as Home cards, not a 2.5% scale and underline alone.
var library = rule(".item-list .media-card:focus .poster");
assert(/box-shadow:\s*0 0 0 4px #ffffff/.test(library), "Focused library poster needs a visible ring");
assert(/scale\(1\.06\)/.test(rule(".item-list .media-card:focus")), "Focused library card scales like Home cards");

// Children listings (Seasons, Episodes, Collection items) measured 270x350 season posters and
// 564x214 episode stills on a 1920-wide TV: posters must be 2:3 and stills 16:9 of their card width.
assert.strictEqual(rule(".screen-listing .item-list .poster").replace(/\s+/g, " ").trim(),
    "height: calc((100vw - 300px) / 4);", "Listing posters are 1.5x the (100vw - 300px) / 6 card width (2:3)");
assert.strictEqual(rule(".screen-listing .item-list .media-card[data-shape=\"landscape\"] .poster").replace(/\s+/g, " ").trim(),
    "height: calc((100vw - 228px) * 3 / 16); min-height: 0;", "Listing stills are 9/16 of the (100vw - 228px) / 3 card width");
assert(/height:\s*240px/.test(rule(".screen-listing .item-list .media-card[data-shape=\"square\"] .poster")),
    "Square listing covers keep their fixed 240px size");

// Home focus and the hero must stay compositor-only: on a 2017 UE55MU6172 a focus box-shadow,
// brightness filter or colour/opacity transition re-rastered posters in software every frame
// (44 missed frames over 10 shelf moves), and visibility-toggling the hero repainted it.
var homeDom = new JSDOM("<style>" + css + "</style><section class='screen screen-home shelves-focused'>" +
    "<div class='home-track'><section class='home-hero'></section><div class='shelf-row'>" +
    "<button class='media-card'><img class='poster'><p class='card-title'>T</p></button></div></div></section>");
try {
    var w = homeDom.window;
    var homeCard = w.getComputedStyle(w.document.querySelector(".media-card"));
    assert.strictEqual(homeCard.getPropertyValue("will-change"), "transform", "Home cards are their own layers");
    var cardRules = Array.prototype.filter.call(w.document.styleSheets[0].cssRules, function (r) {
        return r.selectorText === ".screen-home .media-card";
    });
    assert(cardRules.some(function (r) { return r.style.getPropertyValue("transition") === "transform 120ms ease"; }),
        "Home cards animate only their transform");
    w.document.querySelector(".media-card").focus();
    var focusedPoster = w.getComputedStyle(w.document.querySelector(".poster"));
    assert(!/brightness|blur/.test(focusedPoster.getPropertyValue("filter")), "No filter on a focused Home poster");
    assert.notStrictEqual(w.getComputedStyle(w.document.querySelector(".card-title")).getPropertyValue("transition-property"),
        "opacity", "The Home caption does not fade, which would re-raster the card layer");
    var hiddenHero = w.getComputedStyle(w.document.querySelector(".home-hero"));
    assert.strictEqual(hiddenHero.opacity, "0", "The hero hides by opacity on its own layer");
    assert.notStrictEqual(hiddenHero.visibility, "hidden", "The hero is not hidden by visibility, which repaints it");
    assert.strictEqual(w.getComputedStyle(w.document.querySelector(".screen-home")).overflowY, "hidden",
        "Home never scrolls natively; .home-track moves by transform");
} finally { homeDom.window.close(); }
console.log("Tizen card/avatar focus and library poster aspect: passed");
