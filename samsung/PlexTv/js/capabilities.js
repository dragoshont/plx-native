(function (root, factory) {
    var api = factory(typeof module === "object" && module.exports ? require("./model-register") : root.PlexModelRegister);
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexCapabilities = api; }
}(this, function (register) {
    "use strict";
    function unknown(reason) {
        return { status: "unknown", measured: false, evidence: "Unverified model",
            reason: reason || "identity-not-registered",
            video: [], audio: [], containers: [], observations: [], hdr: "unknown", subtitles: "unknown",
            maxWidth: 1920, maxHeight: 1080 };
    }
    function detect(env) {
        env = env || {};
        var agent = String(env.userAgent || "");
        var match = /\bTizen ([0-9]+\.[0-9]+)/.exec(agent);
        if (!/SMART-TV/i.test(agent) || !match || Number(match[1]) < 3) { return null; }
        var info = env.productinfo;
        if (!info) { return unknown("productinfo-unavailable"); }
        // Family codes alone identify many retail sets; never bind a family to one TV's evidence.
        // getRealModel is the retail model name; getModelCode is Samsung's internal product code.
        var fields = [
            { name: "model-name", getter: "getRealModel", key: "model" },
            { name: "firmware", getter: "getFirmware", key: "firmware" },
            { name: "product-model", getter: "getModel", key: "family" }
        ];
        var identity = { tizen: match[1] };
        for (var i = 0; i < fields.length; i += 1) {
            var field = fields[i];
            try {
                if (typeof info[field.getter] !== "function") { return unknown(field.name + "-unavailable"); }
                identity[field.key] = info[field.getter]();
                if (typeof identity[field.key] !== "string" || !identity[field.key]) {
                    return unknown(field.name + "-unavailable");
                }
            } catch (ignore) {
                return unknown(field.name + "-unavailable");
            }
        }
        var rows = register || [];
        var profile = null;
        rows.some(function (row) {
            if (row.model !== identity.model || row.firmware !== identity.firmware ||
                row.family !== identity.family || row.tizen !== identity.tizen) { return false; }
            profile = JSON.parse(JSON.stringify(row));
            profile.measured = true;
            profile.video = ["h264", "hevc"];
            profile.containers = ["mkv"];
            profile.maxWidth = 3840;
            profile.maxHeight = 1600;
            return true;
        });
        if (profile) { return profile; }
        for (var j = 0; j < fields.length; j += 1) {
            var key = fields[j].key;
            if (!rows.some(function (row) { return row[key] === identity[key]; })) {
                return unknown(fields[j].name + "-mismatch");
            }
        }
        if (!rows.some(function (row) { return row.tizen === identity.tizen; })) {
            return unknown("tizen-version-mismatch");
        }
        return unknown("identity-not-registered");
    }
    return { detect: detect };
}));
