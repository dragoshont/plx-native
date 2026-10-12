(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexPlayback = api; }
}(this, function () {
    "use strict";

    function trackId(value) {
        return /^[0-9]+$/.test(String(value)) ? Number(value) : 0;
    }

    function unplayableFile() {
        return new Error("This file can't be played. It may be damaged or not analyzed on the Plex server.");
    }

    // Unset audio/subtitle ids follow PMS `Stream.selected`, which already applies the account's
    // language preferences and any earlier pick. Only an explicit choice (Off included) is
    // written back with PUT /library/parts, matching the LG client.
    function resolveTracks(part, options) {
        var explicit = options.audioId !== undefined || options.subtitleId !== undefined;
        if (explicit) {
            return { audioId: trackId(options.audioId), subtitleId: trackId(options.subtitleId), explicit: true };
        }
        var audioId = 0;
        var subtitleId = 0;
        (part.Stream || []).forEach(function (stream) {
            if (!stream.selected) { return; }
            if (Number(stream.streamType) === 2 && !audioId) { audioId = trackId(stream.id); }
            if (Number(stream.streamType) === 3 && !subtitleId) { subtitleId = trackId(stream.id); }
        });
        return { audioId: audioId, subtitleId: subtitleId, explicit: false };
    }

    // Plex names DTS core "dca"; the capability profile uses the codec's common name.
    function plexAudio(codec) { return codec === "dca" ? "dts" : codec; }

    // The direct-play ask mirrors LG's MDE request (plex/src/plex/transcoder.rs mde_decision):
    // protocol=http and NO transcode caps. A 1080p / 8 Mbps cap or protocol=hls makes PMS answer
    // "transcode" for any file above the cap, which the 2017 test TV observed for every source.
    function directQuery(query) {
        var ask = {};
        Object.keys(query).forEach(function (key) { ask[key] = query[key]; });
        ask.protocol = "http";
        ask.directPlay = 1;
        delete ask.videoResolution;
        delete ask.videoBitrate;
        delete ask.videoQuality;
        delete ask.videoCodec;
        delete ask.audioCodec;
        return ask;
    }

    // The LG client's quality ladder (rust-modules/media/src/route/plan.rs QUALITY_LADDER):
    // Original keeps the source; every other rung caps resolution and bitrate for a conversion.
    var LADDER = {
        original: { height: Infinity, width: 1920, heightAsk: 1080, bitrate: 20000 },
        "1080h": { height: 1080, width: 1920, bitrate: 20000 },
        "1080": { height: 1080, width: 1920, bitrate: 8000 },
        "720": { height: 720, width: 1280, bitrate: 4000 },
        "720l": { height: 720, width: 1280, bitrate: 2000 },
        "480": { height: 480, width: 854, bitrate: 720 }
    };
    var COPYABLE = { container: true, "audio-codec": true, "audio-container": true };
    function rungFor(quality) {
        var rung = LADDER[quality] || LADDER["1080"];
        return { cap: rung.height, width: rung.width, height: rung.heightAsk || rung.height, bitrate: rung.bitrate };
    }

    function videoStream(streams) {
        for (var i = 0; i < streams.length; i += 1) {
            if (Number(streams[i].streamType) === 1) { return streams[i]; }
        }
        return {};
    }

    // Why the original cannot play as-is on this profile, or "" when it can.
    function fits(profile, media, streams, hdr, rung, audioId) {
        if (!profile || !profile.evidence) { return "profile"; }
        var video = videoStream(streams);
        var container = String(media.container || "");
        var vcodec = String(media.videoCodec || "");
        var audio = streams.filter(function (stream) {
            return audioId > 0 && Number(stream.streamType) === 2 && trackId(stream.id) === audioId;
        })[0];
        var acodec = plexAudio(String(audio && audio.codec || media.audioCodec || ""));
        if (profile.video.indexOf(vcodec) === -1) { return "video-codec"; }
        var boxes = profile.videoContainers && profile.videoContainers[vcodec] || profile.containers;
        if (boxes.indexOf(container) === -1) { return "container"; }
        if (acodec && profile.audio.indexOf(acodec) === -1) { return "audio-codec"; }
        var audioBoxes = profile.audioContainers && profile.audioContainers[acodec];
        if (audioBoxes && audioBoxes.indexOf(container) === -1) { return "audio-container"; }
        if (Number(media.width) > profile.maxWidth || Number(media.height) > profile.maxHeight) { return "resolution"; }
        if (Number(media.height) > rung.cap || (rung.cap !== Infinity && Number(media.bitrate) > rung.bitrate)) {
            return "quality";
        }
        if (profile.maxBitrate && Number(media.bitrate) > profile.maxBitrate) { return "bitrate"; }
        var depth = Number(video.bitDepth) || 8;
        if ((vcodec === "h264" && depth > 8) || depth > 10) { return "bit-depth"; }
        var fps = Number(video.frameRate) || 0;
        if (profile.maxFrameRate && fps > profile.maxFrameRate + 0.5) { return "frame-rate"; }
        var level = Number(video.level) || 0;
        if (vcodec === "h264" && profile.h264Level1080 && Number(media.height) <= 1080 && level > profile.h264Level1080) {
            return "level";
        }
        if (hdr) {
            if (profile.hdr !== "hdr10" && profile.hdr !== "observed") { return "hdr"; }
            // No Samsung TV decodes Dolby Vision; a profile 7/8 file carries an HDR10/SDR/HLG base
            // layer that plays as that format. Profile 5 has none.
            if (video.DOVIPresent || /dolby|dovi/i.test(String(media.videoDynamicRange || ""))) {
                var doviProfile = Number(video.DOVIProfile) || 0;
                var compat = Number(video.DOVIBLCompatID) || 0;
                if (!((doviProfile === 7 || doviProfile === 8) && compat > 0)) { return "dolby-vision"; }
            }
        }
        return "";
    }

    // How PMS answered: the original file, a remux that keeps the video, or a conversion.
    function streamMode(direct, media) {
        if (direct) { return "direct"; }
        var part = media && media.Part && media.Part[0];
        var copied = (part && part.Stream || []).some(function (stream) {
            return Number(stream.streamType) === 1 && stream.decision === "copy";
        });
        return copied ? "directstream" : "transcode";
    }

    function plan(item, options) {
        options = options || {};
        var mediaIndex = options.mediaIndex || 0;
        var media = (item.Media || [])[mediaIndex];
        var part = media && (media.Part || [])[0];
        if (!part || !part.key || !/^[0-9]+$/.test(String(item.ratingKey))) {
            throw new Error("This item has no playable media version.");
        }
        var kind = item.type === "track" ? "music" : "video";
        var streams = part.Stream || [];
        if (!streams.some(function (stream) {
            return Number(stream.streamType) === 2 || kind === "video" && Number(stream.streamType) === 1;
        })) {
            throw unplayableFile();
        }
        var multipart = media.Part.length > 1;
        var tracks = resolveTracks(part, options);
        // A text subtitle the app renders itself stays selected on PMS but is never burned in.
        var burn = tracks.subtitleId && !options.overlaySubtitle ? tracks.subtitleId : 0;
        var profile = options.profile;
        var range = String(media.videoDynamicRange || "");
        var dolby = /dolby|dovi/i.test(range) || streams.some(function (stream) { return stream.streamType === 1 && stream.DOVIPresent; });
        var hdr = (range && range !== "SDR") || dolby || media.hdr ||
            /smpte2084|arib-std-b67/.test(String(media.colorTrc || media.colorTransfer || "")) || streams.some(function (stream) { return stream.streamType === 1 &&
                (stream.colorTrc === "smpte2084" || stream.colorTrc === "arib-std-b67"); });
        var rung = rungFor(options.quality);
        var force = options.directPlay === "force";
        var verdict = kind !== "video" ? "" : multipart ? "multipart" : burn ? "subtitle" :
            options.directPlay === "off" ? "settings" : fits(profile, media, streams, hdr, rung, tracks.audioId);
        var direct = verdict === "" && kind === "video" && !multipart && !burn && !!profile;
        // Force asks for the original even where the profile predicts a refusal; the device is the judge.
        if (force && kind === "video" && !multipart && !burn) { direct = true; }
        var session = "tizen-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        var query = {
            path: "/library/metadata/" + item.ratingKey, mediaIndex: mediaIndex, partIndex: multipart ? -1 : 0,
            protocol: "hls", hasMDE: 1, directPlay: direct ? 1 : 0,
            // Direct Stream: when only the box or the audio is wrong (DTS/TrueHD, HEVC in MOV), PMS
            // may copy the video into HLS and convert the rest. Never for a pixel-level refusal:
            // the LG client measured a Dolby Vision base layer copied straight through
            // (plex/src/plex/transcoder.rs transcode_query), so those always re-encode.
            directStream: kind === "video" && COPYABLE[verdict] ? 1 : 0,
            directStreamAudio: kind === "video" ? 1 : 0, offset: 0,
            session: session, "X-Plex-Session-Identifier": session,
            videoResolution: rung.width + "x" + rung.height,
            videoBitrate: rung.bitrate,
            videoQuality: 100, audioCodec: "aac", videoCodec: "h264",
            subtitleStreamID: burn,
            subtitles: burn ? "burn" : "none",
            "X-Plex-Client-Profile-Name": "Generic",
            "X-Plex-Client-Profile-Extra": "add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac)"
        };
        if (tracks.audioId > 0) { query.audioStreamID = tracks.audioId; }
        if (direct) {
            query["X-Plex-Client-Profile-Extra"] += "+add-direct-play-profile(type=videoProfile&protocol=http&container=" +
                profile.containers.join(",") + "&videoCodec=" + profile.video.join(",") + "&audioCodec=" +
                profile.audio.map(function (codec) { return codec === "dts" ? "dca" : codec; }).join(",") + ")";
        }
        if (kind === "music") {
            query.protocol = "http";
            query.audioCodec = "mp3";
            query.audioBitrate = 192;
            delete query.videoCodec;
            delete query.videoBitrate;
            delete query.videoResolution;
            delete query.videoQuality;
            query["X-Plex-Client-Profile-Extra"] =
                "add-transcode-target(type=musicProfile&context=streaming&protocol=http&container=mp3&audioCodec=mp3)";
        }
        return { direct: !!direct, part: part, query: query, session: session, kind: kind, tracks: tracks,
            force: force && kind === "video", reason: verdict };
    }

    function create(options) {
        var client = options.client;
        var adapter = options.adapter;
        var item = options.item;
        var settings = options.settings || {};
        var selection = plan(item, settings);
        var sourceMedia = item.Media[settings.mediaIndex || 0];
        var streamMedia = null;
        var emit = options.onEvent || function () {};
        var interval = null;
        var started = false;
        var starting = false;
        var stopping = false;
        var closed = false;
        var allocated = false;
        var reportChain = Promise.resolve();
        var reporting = false;
        var pendingReport = null;
        var lastPosition = Math.max(0, Number(settings.offset) || 0);

        function report(state) {
            if (!started) { return Promise.resolve(); }
            var position = Math.max(0, Math.round(adapter.snapshot().position));
            lastPosition = position;
            if (!pendingReport || pendingReport.state !== "stopped") {
                pendingReport = { position: position, state: state };
            }
            if (reporting) { return reportChain; }
            reporting = true;
            function drain() {
                var next = pendingReport;
                pendingReport = null;
                return Promise.resolve().then(function () {
                    return client.timeline(item, next.position, next.state, selection.session,
                        settings.playQueue || null, selection.tracks);
                }).catch(function () {
                    emit({ type: "progress-error", message: "Plex progress could not be saved. Check the server and retry." });
                }).then(function () {
                    if (pendingReport) { return drain(); }
                    reporting = false;
                });
            }
            reportChain = drain();
            return reportChain;
        }

        function stop() {
            if (closed || stopping) { return reportChain; }
            stopping = true;
            if (interval !== null) { clearInterval(interval); interval = null; }
            var stopped = report("stopped");
            try {
                adapter.close();
                closed = true;
            } catch (error) {
                stopping = false;
                return Promise.reject(error);
            }
            return stopped.then(function () {
                if (!selection.direct && allocated) {
                    return client.stopTranscode(selection.session, selection.kind).catch(function () {
                        emit({ type: "cleanup-error", message: "Plex did not confirm transcode cleanup." });
                    });
                }
            }).then(function () { return client.getMetadata(item.ratingKey); }).then(function (metadata) {
                emit({ type: "progress-readback", item: metadata });
                return metadata;
            }).catch(function (error) {
                emit({ type: "progress-error", message: "Could not reconcile playback state with Plex. Retry when the server is reachable." });
                throw error;
            });
        }
        function negotiate() {
            if (closed || stopping) { throw new Error("Playback was cancelled."); }
            var asked = selection.direct ? directQuery(selection.query) : selection.query;
            return client.request("/" + selection.kind + "/:/transcode/universal/decision", "GET", asked).catch(function (error) {
                if (error && error.status === 400) {
                    var unavailable = unplayableFile();
                    unavailable.status = error.status;
                    unavailable.scope = error.scope;
                    throw unavailable;
                }
                throw error;
            }).then(function (decision) {
                if (closed || stopping) { throw new Error("Playback was cancelled."); }
                if (Number(decision.generalDecisionCode) >= 2000 || Number(decision.transcodeDecisionCode) >= 2000) {
                    throw new Error("Plex refused playback. Change quality, source or subtitle settings and retry.");
                }
                var selectedMedia = decision.Metadata && decision.Metadata[0] &&
                    decision.Metadata[0].Media && decision.Metadata[0].Media[0];
                var selectedPart = selectedMedia && selectedMedia.Part && selectedMedia.Part[0];
                streamMedia = selectedMedia || null;
                if (selection.direct && !(selectedPart && selectedPart.decision === "directplay")) {
                    if (selection.force) { throw new Error("Plex would not send the original file. Direct Play is set to Force in Settings."); }
                    // PMS declined the original; register the capped HLS transcode with its own decision.
                    selection.direct = false;
                    selection.reason = "server";
                    selection.query.directPlay = 0;
                    selection.query.directStream = 0;
                    return negotiate();
                }
                var path = selection.direct ? selection.part.key : "/" + selection.kind +
                    "/:/transcode/universal/start." + (selection.kind === "music" ? "mp3" : "m3u8");
                var url = client.streamUrl(path, selection.direct ? {} : selection.query);
                allocated = true;
                return adapter.open(url, settings.offset || 0, settings.paused).catch(function (error) {
                    if (!selection.direct || selection.force || closed || stopping) { throw error; }
                    // The capability profile is a prediction; the decoder has the last word.
                    emit({ type: "direct-fallback", message: error && error.message });
                    selection.direct = false;
                    selection.reason = "decoder";
                    selection.query.directPlay = 0;
                    selection.query.directStream = 0;
                    return negotiate();
                });
            });
        }
        return {
            start: function () {
                if (started || starting || closed || stopping) { return Promise.reject(new Error("This playback session cannot be started again.")); }
                starting = true;
                return Promise.resolve().then(function () {
                    if (closed || stopping) { throw new Error("Playback was cancelled."); }
                    if (selection.force && !selection.direct) {
                        throw new Error("Direct Play is set to Force, but this selection requires server conversion. Change subtitle settings or turn off Force.");
                    }
                    if (!selection.tracks.explicit) { return null; }
                    return client.selectStreams(selection.part.id, selection.tracks.audioId, selection.tracks.subtitleId);
                }).then(negotiate).then(function () {
                    if (closed || stopping) { throw new Error("Playback was cancelled."); }
                    started = true;
                    starting = false;
                    emit({ type: "source", mode: streamMode(selection.direct, streamMedia), session: selection.session });
                    report(adapter.snapshot().state);
                    interval = setInterval(function () {
                        var snapshot = adapter.snapshot();
                        if (snapshot.state === "paused" || snapshot.state === "playing" || snapshot.state === "buffering") {
                            report(snapshot.state);
                        }
                    }, 10000);
                }).catch(function (error) {
                    starting = false;
                    throw error;
                });
            },
            stop: stop,
            pause: function () { adapter.pause(); return report("paused"); },
            play: function () { adapter.play(); return report("playing"); },
            seek: function (position) {
                return adapter.seek(position).then(function (landed) {
                    report(adapter.snapshot().state === "paused" ? "paused" : "playing");
                    return landed;
                });
            },
            snapshot: function () { return adapter.snapshot(); },
            part: function () { return selection.part; },
            selection: function () {
                return { audioId: selection.tracks.audioId, subtitleId: selection.tracks.subtitleId,
                    explicit: selection.tracks.explicit };
            },
            mode: function () { return streamMode(selection.direct, streamMedia); },
            quality: function () {
                return { source: sourceMedia, stream: selection.direct ? sourceMedia : streamMedia,
                    mode: streamMode(selection.direct, streamMedia), reason: selection.reason,
                    limit: LADDER[settings.quality] ? settings.quality : "1080" };
            },
            tracks: function () { return adapter.tracks(); },
            selectTrack: function (type, index) { adapter.selectTrack(type, index); },
            subtitles: function (enabled) { adapter.subtitles(enabled); },
            position: function () { return lastPosition; }
        };
    }
    return { plan: plan, create: create, fits: fits, rungFor: rungFor, streamMode: streamMode, qualities: Object.keys(LADDER) };
}));
