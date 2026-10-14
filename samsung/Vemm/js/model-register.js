(function (root, factory) {
    var register = factory();
    if (typeof module === "object" && module.exports) { module.exports = register; }
    else { root.VemmModelRegister = register; }
}(this, function () {
    "use strict";
    // Video direct-play observations only, not decoder/audio/HDR certification.
    return [{
        model: "UE55MU6172", family: "UMU6100", firmware: "T-KTMDEUC-1410.1", tizen: "3.0",
        status: "observed", evidence: "docs/samsung-upstream-readiness.md#direct-play-correction-re-verification-build-e8b3b4ab-includes-9d6a2abd",
        observations: [
            { videoCodec: "h264", container: "mkv", width: 1920, height: 1080, directPlay: "observed" },
            { videoCodec: "hevc", container: "unknown", width: 3840, height: 1600, directPlay: "observed" }
        ],
        audio: [], hdr: "unknown", subtitles: "unknown"
    }];
}));
