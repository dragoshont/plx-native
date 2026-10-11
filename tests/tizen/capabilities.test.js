"use strict";
var assert = require("assert");
var capabilities = require("../../samsung/PlexTv/js/capabilities.js");
var playback = require("../../samsung/PlexTv/js/playback.js");
var tizen3 = "Mozilla/5.0 (SMART-TV; LINUX; Tizen 3.0)";
function product(model, firmware, family) { return {
    getModelCode: function () { return "17_MUSEM_UHD_BASIC"; },
    getRealModel: function () { return model; }, getFirmware: function () { return firmware; },
    getModel: function () { return family || "UMU6100"; }, isUdPanelSupported: function () { return true; }
}; }
var unknown = capabilities.detect({ userAgent: tizen3, productinfo: product("OTHER2017", "T-KTMDEUC-1410.1") });
assert.strictEqual(unknown.status, "unknown", "An unobserved 2017 model must not inherit the observed TV's capabilities");
assert.strictEqual(unknown.reason, "model-name-mismatch", "A model mismatch should be diagnosable without revealing either model name");
assert.deepStrictEqual(unknown.video, []);
assert.deepStrictEqual(unknown.audio, []);
var samsungProductInfo = {
    getModelCode: function () { return "17_MUSEM_UHD_BASIC"; },
    getRealModel: function () { return "UE55MU6172"; },
    getFirmware: function () { return "T-KTMDEUC-1410.1"; },
    getModel: function () { return "UMU6100"; }
};
var observed = capabilities.detect({ userAgent: tizen3, productinfo: product("UE55MU6172", "T-KTMDEUC-1410.1") });
assert.strictEqual(observed.status, "observed");
assert.strictEqual(observed.model, "UE55MU6172");
assert.strictEqual(capabilities.detect({ userAgent: tizen3, productinfo: samsungProductInfo }).status, "observed",
    "Samsung ProductInfo's synchronous DOMString getters should match the registered tuple");
assert.deepStrictEqual(observed.observations.map(function (row) { return [row.videoCodec,row.width,row.height]; }),
    [["h264",1920,1080],["hevc",3840,1600]]);
assert.strictEqual(observed.hdr, "unknown", "Direct-play success is not panel HDR evidence");
assert.deepStrictEqual(observed.audio, [], "No audio codec can be marked observed by a video-only ledger");
assert.strictEqual(observed.maxHeight, 1600, "A 1600-line observation cannot claim 2160-line decoding");
[product("UE55MU6172", "T-KTMDEUC-9999.0"), product("UE55MU6172", "T-KTMDEUC-1410.1", "OTHER"),
 product("UMU6100", "T-KTMDEUC-1410.1"), {}].forEach(function (info) {
    assert.strictEqual(capabilities.detect({userAgent:tizen3,productinfo:info}).status, "unknown", "Firmware/family/read mismatch stays unknown");
});
assert.strictEqual(capabilities.detect({userAgent:tizen3,productinfo:product("UE55MU6172","T-KTMDEUC-9999.0")}).reason,
    "firmware-mismatch", "Firmware mismatch diagnostics must identify only the mismatching field");
assert.strictEqual(capabilities.detect({userAgent:tizen3,productinfo:{getRealModel:function(){throw new Error("private detail");}}}).reason,
    "model-name-unavailable", "Getter exceptions must not expose exception text");
assert.strictEqual(capabilities.detect({userAgent:tizen3}).reason, "productinfo-unavailable");
assert.strictEqual(capabilities.detect({userAgent:tizen3,productinfo:{getModelCode:function(){return "UE55MU6172";}}}).reason,
    "model-name-unavailable", "An internal model-code getter cannot substitute for the full model-name getter");
assert.strictEqual(capabilities.detect({userAgent:"SMART-TV Tizen 4.0",productinfo:samsungProductInfo}).reason,
    "tizen-version-mismatch", "A different Tizen version must remain unverified");
assert.strictEqual(capabilities.detect({userAgent:"SMART-TV Tizen 4.0",productinfo:product("UE55MU6172","T-KTMDEUC-1410.1")}).status,"unknown");
assert.strictEqual(capabilities.detect({userAgent:tizen3,productinfo:{getRealModel:function(){throw new Error("SecurityError");}}}).status,"unknown");
assert.strictEqual(capabilities.detect({ userAgent: "Mozilla/5.0 (Macintosh)" }), null);
assert.strictEqual(capabilities.detect({ userAgent: "SMART-TV Tizen 2.4" }), null);
for (var media of [
    { container:"mkv",videoCodec:"hevc",audioCodec:"aac",width:3840,height:2160 },
    { container:"mkv",videoCodec:"h264",audioCodec:"dca",width:1920,height:1080 },
    { container:"mkv",videoCodec:"hevc",audioCodec:"aac",width:3840,height:1600,videoDynamicRange:"HDR10" }
]) {
    var item = { ratingKey:"1", Media:[Object.assign({},media,{Part:[{id:"1",key:"/library/parts/1/file"}]})] };
    [unknown,observed].forEach(function(profile){
        var plan=playback.plan(item,{profile:profile});
        assert.strictEqual(plan.direct,false,"Unknown UHD/HDR/audio capabilities must request transcode");
        assert.strictEqual(plan.query.directPlay,0);assert.strictEqual(plan.query.videoResolution,"1920x1080");
        assert(!plan.query["X-Plex-Client-Profile-Extra"].includes("add-direct-play-profile"));
    });
}
observed.video.push("mutated");
assert(!capabilities.detect({userAgent:tizen3,productinfo:product("UE55MU6172","T-KTMDEUC-1410.1")}).video.includes("mutated"));
console.log("Tizen exact model/firmware capability register and conservative PMS policy: passed");
var fs = require("fs"), vm = require("vm");
var register = require("../../samsung/PlexTv/js/model-register");
assert.strictEqual(register.length, 1, "Only the observed retail set may have an observed register entry");
assert.strictEqual(register[0].status, "observed");
assert.strictEqual(register[0].subtitles, "unknown");
var JSDOM = require("jsdom").JSDOM;
function settingsJourney(info, language, expected) {
    var dom = new JSDOM(fs.readFileSync("samsung/PlexTv/index.html", "utf8"), { url:"https://synthetic.invalid",runScripts:"outside-only" });
    try {
        var w = dom.window;
        Object.defineProperty(w.navigator,"userAgent",{value:tizen3});
        w.webapis = { productinfo:info };
        w.fetch = function(){assert.fail("Settings must not contact a real server");};
        ["i18n","model-register","capabilities","preferences"].forEach(function(name){w.eval(fs.readFileSync("samsung/PlexTv/js/"+name+".js","utf8"));});
        var source=fs.readFileSync("samsung/PlexTv/main.js","utf8");
        source=source.slice(0,source.lastIndexOf('    addConnectForm("");'))+
            'preferences.language="'+language+'"; window.PlexI18n.setLanguage(preferences.language); openSettings(); }());';
        w.eval(source);
        var text = w.document.body.textContent;
        assert(text.includes(expected),"Settings exposes localized capability uncertainty: "+language);
        assert(!text.includes("OTHER2017"),"Settings must not expose raw device identity values");
    } finally { dom.window.close(); }
}
settingsJourney(product("OTHER2017","T-KTMDEUC-1410.1"),"en","Model name did not match the observed register");
settingsJourney(product("OTHER2017","T-KTMDEUC-1410.1"),"es","El nombre del modelo no coincide con el registro observado");
settingsJourney(product("OTHER2017","T-KTMDEUC-1410.1"),"be","Назва мадэлі не супадае з назіраным рэестрам");
settingsJourney(product("UE55MU6172","T-KTMDEUC-1410.1"),"en","Observed video only: UE55MU6172");
console.log("Tizen browser-loaded register and Settings uncertainty journeys: passed");
