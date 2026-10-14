"use strict";
var assert = require("assert");
var fs = require("fs");
var JSDOM = require("jsdom").JSDOM;
var css = fs.readFileSync(require.resolve("../../samsung/Vemm/css/style.css"), "utf8");
var dom = new JSDOM("<style>" + css + "</style><section class='home-utilities'>" +
    "<button class='menu-control menu-icon-settings'>Settings</button></section>");
try {
    var style = dom.window.getComputedStyle(dom.window.document.querySelector("button"));
    assert.strictEqual(style.display, "flex", "Account icon and label must occupy separate flex slots");
    assert.strictEqual(style.alignItems, "center");
    assert(!/\.home-utilities\s+\.menu-control::before\s*\{[^}]*position:\s*absolute/.test(css),
        "Account icons must not be absolutely placed over centred text");
    var roundIcon = Array.from(dom.window.document.styleSheets[0].cssRules).find(function (rule) {
        return rule.selectorText === ".round-control::before";
    });
    assert(roundIcon, "Round controls must define their icon slot");
    assert.strictEqual(roundIcon.style.display, "flex",
        "The info and next glyphs must be centered within their icon slot, not left-aligned inside a centered box");
    assert.strictEqual(roundIcon.style.getPropertyValue("align-items"), "center",
        "Round-control glyphs must be vertically centered");
    assert.strictEqual(roundIcon.style.getPropertyValue("justify-content"), "center",
        "Round-control glyphs must be horizontally centered");
    var shelf = /\.screen-home\s+\.shelf-row\s*\{([^}]+)\}/.exec(css);
    assert(shelf && /margin-left:\s*-1vw/.test(shelf[1]) && /padding:\s*1\.5vh\s+1vw\s+1vh/.test(shelf[1]),
        "Home shelves need left overscan for a scaled first poster/caption without moving the 5vw inset");
    console.log("Tizen account icon/label layout regression: passed");
} finally { dom.window.close(); }
