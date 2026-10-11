(function (root, factory) {
    var api = factory(typeof module === "object" && module.exports ? require("./model-register") : root.PlexModelRegister);
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexCapabilities = api; }
}(this, function (register) {
    "use strict";
    function unknown() {
        return { status: "unknown", measured: false, evidence: "Unverified model",
            video: [], audio: [], containers: [], observations: [], hdr: "unknown", subtitles: "unknown",
            maxWidth: 1920, maxHeight: 1080 };
    }
    function detect(env) {
        env = env || {};
        var agent = String(env.userAgent || "");
        var match = /\bTizen ([0-9]+\.[0-9]+)/.exec(agent);
        if (!/SMART-TV/i.test(agent) || !match || Number(match[1]) < 3) { return null; }
        var info = env.productinfo;
        var profile = unknown();
        // Family codes alone identify many retail sets; never bind a family to one TV's evidence.
        try {
            var model = String(info.getModelCode());
            var firmware = String(info.getFirmware());
            var family = String(info.getModel());
            (register || []).some(function (row) {
                if (row.model !== model || row.firmware !== firmware || row.family !== family || row.tizen !== match[1]) { return false; }
                profile = JSON.parse(JSON.stringify(row));
                profile.measured = true;
                profile.video = ["h264", "hevc"];
                profile.containers = ["mkv"];
                profile.maxWidth = 3840;
                profile.maxHeight = 1600;
                return true;
            });
        } catch (ignore) { return unknown(); }
        return profile;
    }
    return { detect: detect };
}));
