"use strict";
var assert = require("assert");
var fs = require("fs");
var JSDOM = require("jsdom").JSDOM;
var css = fs.readFileSync(require.resolve("../../samsung/PlexTv/css/style.css"), "utf8");
var dom = new JSDOM("<style>" + css + "</style><section class='home-utilities'>" +
    "<button class='menu-control menu-icon-settings'>Settings</button></section>");
try {
    var style = dom.window.getComputedStyle(dom.window.document.querySelector("button"));
    assert.strictEqual(style.display, "flex", "Account icon and label must occupy separate flex slots");
    assert.strictEqual(style.alignItems, "center");
    assert(!/\.home-utilities\s+\.menu-control::before\s*\{[^}]*position:\s*absolute/.test(css),
        "Account icons must not be absolutely placed over centred text");
    var shelf = /\.screen-home\s+\.shelf-row\s*\{([^}]+)\}/.exec(css);
    assert(shelf && /margin-left:\s*-1vw/.test(shelf[1]) && /padding:\s*1\.5vh\s+1vw\s+1vh/.test(shelf[1]),
        "Home shelves need left overscan for a scaled first poster/caption without moving the 5vw inset");
    console.log("Tizen account icon/label layout regression: passed");
} finally { dom.window.close(); }
