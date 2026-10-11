(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexCapabilities = api; }
}(this, function () {
    "use strict";
    // Direct-play profiles by Tizen platform. Tizen 3.0 is measured on a 2017 UE55MU6172
    // (docs/samsung-tizen-poc.md, T1-T4: MKV, H.264, HEVC Main 10 HDR10 UHD, AAC, AC-3,
    // E-AC-3 and DTS core all played through AVPlay). Tizen 4.0+ follows Samsung's published
    // 2018+ TV media specifications, which drop DTS, and stays unmeasured until a set is tested.
    // Anything the TV still refuses falls back to a server transcode in PlexPlayback.
    function profile(version, uhd) {
        var measured = version < 4;
        return {
            evidence: measured ? "Measured on a 2017 Samsung TV (Tizen 3.0)"
                : "Samsung TV media specification (Tizen " + version.toFixed(1) + ", not yet measured)",
            measured: measured,
            containers: ["mkv", "mp4", "mov"],
            video: ["h264", "hevc"],
            audio: measured ? ["aac", "ac3", "eac3", "dts", "mp3"] : ["aac", "ac3", "eac3", "mp3"],
            maxWidth: uhd ? 3840 : 1920,
            maxHeight: uhd ? 2160 : 1080
        };
    }
    function detect(env) {
        env = env || {};
        var match = /\bTizen ([0-9]+\.[0-9]+)/.exec(String(env.userAgent || ""));
        var version = match ? Number(match[1]) : 0;
        if (!/SMART-TV/i.test(String(env.userAgent || "")) || !(version >= 3)) { return null; }
        var uhd = false;
        try { uhd = !!(env.productinfo && env.productinfo.isUdPanelSupported() === true); }
        catch (ignore) { uhd = false; }
        return profile(version, uhd);
    }
    return { detect: detect };
}));
