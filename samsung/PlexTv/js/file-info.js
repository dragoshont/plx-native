(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexFileInfo = api; }
}(this, function () {
    "use strict";
    function present(value) {
        return value !== undefined && value !== null && String(value).trim() !== "";
    }

    function add(rows, context, label, value) {
        if (present(value)) {
            rows.push({
                version: context.version,
                part: context.part,
                trackType: context.trackType,
                track: context.track,
                label: label,
                value: String(value)
            });
        }
    }

    function megabits(value) {
        var number = Number(value);
        return isFinite(number) && number > 0 ? (number / 1000).toFixed(1) + " Mbps" : "";
    }

    function resolution(media, stream) {
        var width = stream && stream.width || media && media.width;
        var height = stream && stream.height || media && media.height;
        return width && height ? width + " x " + height : "";
    }

    function streamName(stream) {
        if (Number(stream.streamType) === 1) { return "Video"; }
        if (Number(stream.streamType) === 2) { return "Audio"; }
        if (Number(stream.streamType) === 3) { return "Subtitle"; }
        return "Stream";
    }

    function rows(item) {
        var result = [];
        var versions = item && item.Media;
        if (!Array.isArray(versions)) { return result; }
        versions.forEach(function (media, versionIndex) {
            if (!media || typeof media !== "object") { return; }
            var version = versionIndex + 1;
            var parts = media && media.Part;
            if (!Array.isArray(parts)) { parts = []; }
            else { parts = parts.filter(function (part) { return part && typeof part === "object"; }); }
            if (!parts.length) { parts = [{}]; }
            parts.forEach(function (part, partIndex) {
                var context = { version: version, part: parts.length > 1 ? partIndex + 1 : null,
                    trackType: null, track: null };
                add(result, context, "Container", part.container || media.container);
                add(result, context, "Resolution", media.videoResolution);
                add(result, context, "Frame size", resolution(media));
                add(result, context, "Aspect ratio", media.aspectRatio);
                add(result, context, "Video codec", media.videoCodec);
                add(result, context, "Video profile", media.videoProfile);
                add(result, context, "Audio codec", media.audioCodec);
                add(result, context, "File bitrate", megabits(media.bitrate));
                var size = Number(part.size);
                if (isFinite(size) && size > 0) {
                    add(result, context, "Size", (size / (1024 * 1024 * 1024)).toFixed(2) + " GiB");
                }
                var trackCounts = {};
                var streams = Array.isArray(part.Stream) ? part.Stream : [];
                streams.forEach(function (stream) {
                    if (!stream || typeof stream !== "object") { return; }
                    var type = streamName(stream);
                    trackCounts[type] = (trackCounts[type] || 0) + 1;
                    var track = { version: version, part: context.part, trackType: type,
                        track: trackCounts[type] };
                    add(result, track, "Title", stream.displayTitle || stream.title);
                    add(result, track, "Language", stream.language || stream.languageCode || stream.languageTag);
                    add(result, track, "Codec", stream.codec);
                    add(result, track, "Profile", stream.profile);
                    add(result, track, "Frame size", resolution(null, stream));
                    add(result, track, "Frame rate", stream.frameRate);
                    add(result, track, "Bit depth", stream.bitDepth ? stream.bitDepth + "-bit" : "");
                    add(result, track, "Chroma subsampling", stream.chromaSubsampling);
                    add(result, track, "Channels", stream.channels);
                    add(result, track, "Channel layout", stream.audioChannelLayout);
                    add(result, track, "Bitrate", megabits(stream.bitrate));
                    [
                        { field: "forced", label: "Forced" },
                        { field: "default", label: "Default track" },
                        { field: "selected", label: "Server-selected track" },
                        { field: "hearingImpaired", label: "Hearing impaired" },
                        { field: "audioDescription", label: "Audio description" },
                        { field: "DOVIPresent", label: "DOVIPresent" },
                        { field: "DOVIProfile", label: "DOVIProfile" },
                        { field: "DOVILevel", label: "DOVILevel" },
                        { field: "DOVIVersion", label: "DOVIVersion" },
                        { field: "DOVIBLPresent", label: "DOVIBLPresent" },
                        { field: "DOVIELPresent", label: "DOVIELPresent" },
                        { field: "DOVIRPUPresent", label: "DOVIRPUPresent" },
                        { field: "DOVIBLCompatID", label: "DOVIBLCompatID" }
                    ].forEach(function (fact) {
                        if (Object.prototype.hasOwnProperty.call(stream, fact.field)) {
                            add(result, track, fact.label, stream[fact.field]);
                        }
                    });
                });
            });
        });
        return result;
    }

    return { rows: rows };
}));
