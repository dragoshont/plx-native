(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexPlayback = api; }
}(this, function () {
    "use strict";

    function plan(item, options) {
        options = options || {};
        var mediaIndex = options.mediaIndex || 0;
        var media = (item.Media || [])[mediaIndex];
        var part = media && (media.Part || [])[0];
        if (!part || !part.key || !/^[0-9]+$/.test(String(item.ratingKey))) {
            throw new Error("This item has no playable media version.");
        }
        var multipart = media.Part.length > 1;
        var profile = options.profile;
        var direct = !multipart && profile && profile.evidence && profile.containers.indexOf(media.container) !== -1 &&
            profile.video.indexOf(media.videoCodec) !== -1 && profile.audio.indexOf(media.audioCodec) !== -1 &&
            media.width <= profile.maxWidth && media.height <= profile.maxHeight && !options.subtitleId;
        var session = "tizen-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        var query = {
            path: "/library/metadata/" + item.ratingKey, mediaIndex: mediaIndex, partIndex: multipart ? -1 : 0,
            protocol: "hls", hasMDE: 1, directPlay: direct ? 1 : 0, directStream: 0,
            directStreamAudio: 0, offset: 0,
            session: session, "X-Plex-Session-Identifier": session,
            videoResolution: options.quality === "720" ? "1280x720" : "1920x1080",
            videoBitrate: options.quality === "720" ? 4000 : 8000,
            videoQuality: 100, audioCodec: "aac", videoCodec: "h264",
            audioStreamID: options.audioId || 0, subtitleStreamID: options.subtitleId || 0,
            subtitles: options.subtitleId ? "burn" : "none",
            "X-Plex-Client-Profile-Name": "Generic",
            "X-Plex-Client-Profile-Extra": "add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac)"
        };
        return { direct: !!direct, part: part, query: query, session: session };
    }

    function create(options) {
        var client = options.client;
        var adapter = options.adapter;
        var item = options.item;
        var settings = options.settings || {};
        var selection = plan(item, settings);
        var emit = options.onEvent || function () {};
        var interval = null;
        var started = false;
        var starting = false;
        var stopping = false;
        var closed = false;
        var allocated = false;
        var reportChain = Promise.resolve();
        var lastPosition = Math.max(0, Number(settings.offset) || 0);

        function report(state) {
            if (!started) { return Promise.resolve(); }
            var position = Math.max(0, Math.round(adapter.snapshot().position));
            lastPosition = position;
            reportChain = reportChain.catch(function () {}).then(function () {
                return client.timeline(item, position, state, selection.session);
            });
            return reportChain.catch(function () {
                emit({ type: "progress-error", message: "Plex progress could not be saved. Check the server and retry." });
            });
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
                    return client.stopTranscode(selection.session).catch(function () {
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
        return {
            start: function () {
                if (started || starting || closed || stopping) { return Promise.reject(new Error("This playback session cannot be started again.")); }
                starting = true;
                return Promise.resolve().then(function () {
                    if (closed || stopping) { throw new Error("Playback was cancelled."); }
                    return client.selectStreams(selection.part.id, settings.audioId || 0, settings.subtitleId || 0);
                }).then(function () {
                    if (closed || stopping) { throw new Error("Playback was cancelled."); }
                    return client.request("/video/:/transcode/universal/decision", "GET", selection.query);
                }).then(function (decision) {
                    if (closed || stopping) { throw new Error("Playback was cancelled."); }
                    if (Number(decision.generalDecisionCode) >= 2000 || Number(decision.transcodeDecisionCode) >= 2000) {
                        throw new Error("Plex refused playback. Change quality, source or subtitle settings and retry.");
                    }
                    var selectedMedia = decision.Metadata && decision.Metadata[0] &&
                        decision.Metadata[0].Media && decision.Metadata[0].Media[0];
                    var selectedPart = selectedMedia && selectedMedia.Part && selectedMedia.Part[0];
                    selection.direct = selection.direct && selectedPart && selectedPart.decision === "directplay";
                    var path = selection.direct ? selection.part.key : "/video/:/transcode/universal/start.m3u8";
                    var url = client.streamUrl(path, selection.direct ? {} : selection.query);
                    allocated = true;
                    return adapter.open(url, settings.offset || 0);
                }).then(function () {
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
            mode: function () { return selection.direct ? "direct" : "transcode"; },
            tracks: function () { return adapter.tracks(); },
            selectTrack: function (type, index) { adapter.selectTrack(type, index); },
            subtitles: function (enabled) { adapter.subtitles(enabled); },
            position: function () { return lastPosition; }
        };
    }
    return { plan: plan, create: create };
}));
