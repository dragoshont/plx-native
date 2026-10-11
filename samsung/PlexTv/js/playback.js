(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexPlayback = api; }
}(this, function () {
    "use strict";

    function trackId(value) {
        return /^[0-9]+$/.test(String(value)) ? Number(value) : 0;
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

    function plan(item, options) {
        options = options || {};
        var mediaIndex = options.mediaIndex || 0;
        var media = (item.Media || [])[mediaIndex];
        var part = media && (media.Part || [])[0];
        if (!part || !part.key || !/^[0-9]+$/.test(String(item.ratingKey))) {
            throw new Error("This item has no playable media version.");
        }
        var multipart = media.Part.length > 1;
        var tracks = resolveTracks(part, options);
        // A text subtitle the app renders itself stays selected on PMS but is never burned in.
        var burn = tracks.subtitleId && !options.overlaySubtitle ? tracks.subtitleId : 0;
        var profile = options.profile;
        var kind = item.type === "track" ? "music" : "video";
        var direct = kind === "video" && !multipart && profile && profile.evidence && profile.containers.indexOf(media.container) !== -1 &&
            profile.video.indexOf(media.videoCodec) !== -1 && profile.audio.indexOf(media.audioCodec) !== -1 &&
            media.width <= profile.maxWidth && media.height <= profile.maxHeight && !burn;
        var session = "tizen-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        var query = {
            path: "/library/metadata/" + item.ratingKey, mediaIndex: mediaIndex, partIndex: multipart ? -1 : 0,
            protocol: "hls", hasMDE: 1, directPlay: direct ? 1 : 0, directStream: 0,
            directStreamAudio: 0, offset: 0,
            session: session, "X-Plex-Session-Identifier": session,
            videoResolution: options.quality === "720" ? "1280x720" : "1920x1080",
            videoBitrate: options.quality === "720" ? 4000 : 8000,
            videoQuality: 100, audioCodec: "aac", videoCodec: "h264",
            audioStreamID: tracks.audioId, subtitleStreamID: burn,
            subtitles: burn ? "burn" : "none",
            "X-Plex-Client-Profile-Name": "Generic",
            "X-Plex-Client-Profile-Extra": "add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac)"
        };
        if (direct) {
            query["X-Plex-Client-Profile-Extra"] += "+add-direct-play-profile(type=videoProfile&protocol=http&container=" +
                profile.containers.join(",") + "&videoCodec=" + profile.video.join(",") + "&audioCodec=" + profile.audio.join(",") + ")";
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
        return { direct: !!direct, part: part, query: query, session: session, kind: kind, tracks: tracks };
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
                    return client.timeline(item, next.position, next.state, selection.session, settings.playQueue || null);
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
            return client.request("/" + selection.kind + "/:/transcode/universal/decision", "GET", selection.query).then(function (decision) {
                if (closed || stopping) { throw new Error("Playback was cancelled."); }
                if (Number(decision.generalDecisionCode) >= 2000 || Number(decision.transcodeDecisionCode) >= 2000) {
                    throw new Error("Plex refused playback. Change quality, source or subtitle settings and retry.");
                }
                var selectedMedia = decision.Metadata && decision.Metadata[0] &&
                    decision.Metadata[0].Media && decision.Metadata[0].Media[0];
                var selectedPart = selectedMedia && selectedMedia.Part && selectedMedia.Part[0];
                streamMedia = selectedMedia || null;
                selection.direct = !!(selection.direct && selectedPart && selectedPart.decision === "directplay");
                var path = selection.direct ? selection.part.key : "/" + selection.kind +
                    "/:/transcode/universal/start." + (selection.kind === "music" ? "mp3" : "m3u8");
                var url = client.streamUrl(path, selection.direct ? {} : selection.query);
                allocated = true;
                return adapter.open(url, settings.offset || 0).catch(function (error) {
                    if (!selection.direct || closed || stopping) { throw error; }
                    // The capability profile is a prediction; the decoder has the last word.
                    emit({ type: "direct-fallback", message: error && error.message });
                    selection.direct = false;
                    selection.query.directPlay = 0;
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
                    if (!selection.tracks.explicit) { return null; }
                    return client.selectStreams(selection.part.id, selection.tracks.audioId, selection.tracks.subtitleId);
                }).then(negotiate).then(function () {
                    if (closed || stopping) { throw new Error("Playback was cancelled."); }
                    started = true;
                    starting = false;
                    emit({ type: "source", mode: selection.direct ? "direct" : "transcode", session: selection.session });
                    report("playing");
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
            mode: function () { return selection.direct ? "direct" : "transcode"; },
            quality: function () {
                return { source: sourceMedia, stream: selection.direct ? sourceMedia : streamMedia,
                    mode: selection.direct ? "direct" : "transcode", limit: settings.quality === "720" ? "720" : "1080" };
            },
            tracks: function () { return adapter.tracks(); },
            selectTrack: function (type, index) { adapter.selectTrack(type, index); },
            subtitles: function (enabled) { adapter.subtitles(enabled); },
            position: function () { return lastPosition; }
        };
    }
    return { plan: plan, create: create };
}));
