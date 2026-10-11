(function (root, factory) {
    var api = factory(typeof module === "object" && module.exports ? require("./model-register") : root.PlexModelRegister);
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexCapabilities = api; }
}(this, function (register) {
    "use strict";
    // Samsung's published media specifications (developer.samsung.com/smarttv/develop/
    // specifications/media-specifications, "20xx TV Video Specifications", 2017-2025):
    // - H.264 BP/MP/HP (8-bit) in MKV/MP4/MOV/TS, 1080p at level 4.1 on 2017 sets and 4.2 from
    //   2018; UHD panels decode it up to 3840x2160 at 60 fps.
    // - HEVC Main/Main10 "is supported only in MP4, MKV, and TS containers", UHD at 60 fps.
    // - AV1 first appears on the 2020 (Tizen 5.5) sets.
    // - AAC, AC-3, E-AC-3 and MP3 on every set; DTS only on 2017 (Tizen 3.0) sets; TrueHD never.
    //   Opus decodes from MKV on every set and from MP4 on Tizen 6+ (Jellyfin's device profile,
    //   jellyfin-web src/scripts/browserDeviceProfile.js), never from TS.
    // - HDR10/HLG on HDR panels (webapis.avinfo.isHdrTvSupport); no Samsung TV decodes Dolby
    //   Vision, but a profile 7/8 file's HDR10/HLG/SDR base layer plays as that format.
    // - FHD-only panels are held to 20 Mbps (Jellyfin's getGlobalMaxVideoBitrate), and AVPlay
    //   exposes no display frame-rate matching, so nothing above 60 fps is sent direct.
    // This is a prediction: PMS still decides, and a decoder refusal at open falls back to a
    // server transcode unless Direct Play is forced.
    function documented(tizen, uhd, reason, hdrPanel) {
        var version = Number(tizen) || 3;
        var audio = ["aac", "ac3", "eac3", "mp3", "opus"];
        if (version < 4) { audio.push("dts"); }
        if (version >= 7) { audio.push("flac"); }
        var video = ["h264", "hevc"];
        var videoContainers = { h264: ["mkv", "mp4", "mov", "mpegts"], hevc: ["mkv", "mp4", "mpegts"] };
        if (version >= 5.5) { video.push("av1"); videoContainers.av1 = ["mkv", "mp4"]; }
        var hdr = hdrPanel === undefined ? uhd : hdrPanel;
        return { status: "documented", measured: false, evidence: "Samsung media specifications",
            reason: reason || "", tizen: tizen,
            video: video, audio: audio, containers: ["mkv", "mp4", "mov", "mpegts"],
            videoContainers: videoContainers,
            audioContainers: { opus: version >= 6 ? ["mkv", "mp4"] : ["mkv"] },
            observations: [], hdr: hdr ? "hdr10" : "none", subtitles: "unknown",
            maxWidth: uhd ? 3840 : 1920, maxHeight: uhd ? 2160 : 1080, maxFrameRate: 60,
            maxBitrate: uhd ? 60000 : 20000, h264Level1080: version < 4 ? 41 : 42 };
    }
    function hdrPanel(avinfo, fallback) {
        try {
            if (avinfo && typeof avinfo.isHdrTvSupport === "function") { return !!avinfo.isHdrTvSupport(); }
        } catch (ignore) { return fallback; }
        return fallback;
    }
    function uhdPanel(info) {
        try { return !!(info && typeof info.isUdPanelSupported === "function" && info.isUdPanelSupported()); }
        catch (ignore) { return false; }
    }
    function detect(env) {
        env = env || {};
        var agent = String(env.userAgent || "");
        var match = /\bTizen ([0-9]+\.[0-9]+)/.exec(agent);
        if (!/SMART-TV/i.test(agent) || !match || Number(match[1]) < 3) { return null; }
        var info = env.productinfo;
        var uhd = uhdPanel(info);
        var hdr = hdrPanel(env.avinfo, uhd);
        function unknown(reason) { return documented(match[1], uhd, reason, hdr); }
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
        var profile = documented(match[1], uhd, "", hdr);
        var row = JSON.parse(JSON.stringify(candidates[0]));
        profile.status = row.status;
        profile.measured = true;
        profile.model = row.model;
        profile.evidence = row.evidence;
        profile.observations = row.observations;
        return profile;
    }
    return { detect: detect };
}));
