(function (root, factory) {
    var api = factory(typeof module === "object" && module.exports ? require("./model-register") : root.PlexModelRegister);
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexCapabilities = api; }
}(this, function (register) {
    "use strict";
    function unknown(reason) {
        return { status: "unknown", measured: false, evidence: "Unverified model",
            reason: reason || "throw",
            video: [], audio: [], containers: [], observations: [], hdr: "unknown", subtitles: "unknown",
            maxWidth: 1920, maxHeight: 1080 };
    }
    function detect(env) {
        env = env || {};
        var agent = String(env.userAgent || "");
        var match = /\bTizen ([0-9]+\.[0-9]+)/.exec(agent);
        if (!/SMART-TV/i.test(agent) || !match || Number(match[1]) < 3) { return null; }
        var info = env.productinfo;
        if (!info) { return unknown("throw"); }
        // Family codes alone identify many retail sets; never bind a family to one TV's evidence.
        var fields = [
            { name: "model", getter: "getModelCode", key: "model" },
            { name: "family", getter: "getModel", key: "family" },
            { name: "firmware", getter: "getFirmware", key: "firmware" }
        ];
        var identity = { tizen: match[1] };
        for (var i = 0; i < fields.length; i += 1) {
            var field = fields[i];
            try {
                if (typeof info[field.getter] !== "function") { return unknown("throw"); }
                identity[field.key] = info[field.getter]();
                if (typeof identity[field.key] !== "string" || !identity[field.key]) {
                    return unknown("throw");
                }
            } catch (ignore) {
                return unknown("throw");
            }
        }
        var rows = register || [];
        var candidates = rows.filter(function (row) { return row.model === identity.model; });
        if (!candidates.length) { return unknown("model"); }
        candidates = candidates.filter(function (row) { return row.family === identity.family; });
        if (!candidates.length) { return unknown("family"); }
        candidates = candidates.filter(function (row) { return row.firmware === identity.firmware; });
        if (!candidates.length) { return unknown("firmware"); }
        candidates = candidates.filter(function (row) { return row.tizen === identity.tizen; });
        if (!candidates.length) { return unknown("tizen"); }
        var profile = JSON.parse(JSON.stringify(candidates[0]));
        profile.measured = true;
        profile.video = ["h264", "hevc"];
        profile.containers = ["mkv"];
        profile.maxWidth = 3840;
        profile.maxHeight = 1600;
        return profile;
    }
    return { detect: detect };
}));
