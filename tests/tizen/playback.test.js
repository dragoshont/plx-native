"use strict";
var assert = require("assert");
var playback = require("../../samsung/PlexTv/js/playback.js");
var item = {
    ratingKey: "10", duration: 100000, viewOffset: 5000,
    Media: [{ container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        Part: [{ id: "20", key: "/library/parts/20/file.mp4", Stream: [] }] }]
};
function rig() {
    var calls = [];
    var state = "idle";
    var position = 0;
    var adapter = {
        snapshot: function () { return { state: state, position: position, duration: item.duration }; },
        open: function (url, offset, paused) {
            calls.push(["open", url, offset, paused]);
            position = offset;
            state = paused ? "paused" : "playing";
            return Promise.resolve();
        },
        close: function () { calls.push(["close"]); state = "idle"; },
        pause: function () { state = "paused"; },
        play: function () { state = "playing"; },
        seek: function (target) { position = target; return Promise.resolve(target); }
    };
    var client = {
        selectStreams: function (partId, audioId, subtitleId) {
            calls.push(["streams", partId, audioId, subtitleId]);
            return Promise.resolve();
        },
        request: function (path, method, query) { calls.push(["decision", query]); return Promise.resolve({ generalDecisionCode: 1001 }); },
        streamUrl: function (path) { return "https://synthetic.invalid" + path; },
        timeline: function (media, time, phase, session, queue, tracks) {
            calls.push(["timeline", time, phase, session, tracks]);
            return Promise.resolve();
        },
        stopTranscode: function () { calls.push(["cleanup"]); return Promise.resolve(); },
        getMetadata: function () { calls.push(["readback"]); return Promise.resolve(item); }
    };
    return { calls: calls, adapter: adapter, client: client };
}
async function run() {
    var plan = playback.plan(item, { offset: 5000 });
    assert.strictEqual(plan.direct, false, "Unknown capabilities must not guess direct play");
    assert.strictEqual(plan.query.directPlay, 0);
    assert.strictEqual(plan.query.offset, 0, "AVPlay resumes in the source timeline, not an offset-relative HLS clock");
    assert.strictEqual(playback.plan(item, { profile: {
        evidence: "synthetic-measured-profile", containers: ["mp4"], video: ["h264"], audio: ["aac"],
        maxWidth: 1920, maxHeight: 1080
    } }).direct, true);
    assert.throws(function () { playback.plan({ ratingKey: "10" }); }, /no playable/);
    var multipart = JSON.parse(JSON.stringify(item));
    multipart.Media[0].Part.push({ id: "21", key: "/library/parts/21/file.mp4" });
    var joined = playback.plan(multipart, { profile: {
        evidence: "synthetic-measured-profile", containers: ["mp4"], video: ["h264"], audio: ["aac"],
        maxWidth: 1920, maxHeight: 1080
    } });
    assert.strictEqual(joined.direct, false, "Multiple files require server joining, never direct-play only the first file");
    assert.strictEqual(joined.query.partIndex, -1, "PMS contract: -1 joins all parts into one transcode");
    assert.strictEqual(joined.query.directPlay, 0);
    var multipartRig = rig();
    multipartRig.client.streamUrl = function (path, query) {
        assert.strictEqual(path, "/video/:/transcode/universal/start.m3u8");
        assert.strictEqual(query.partIndex, -1);
        return "https://synthetic.invalid/joined";
    };
    var multipartSession = playback.create({
        client: multipartRig.client, adapter: multipartRig.adapter, item: multipart, settings: { offset: 75000 }
    });
    await multipartSession.start();
    await multipartSession.pause();
    assert(multipartRig.calls.some(function (call) { return call[0] === "timeline" && call[1] === 75000; }),
        "Joined resume/progress must retain the whole-title timeline");
    await multipartSession.stop();
    var test = rig();
    var session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { offset: 5000 } });
    assert.strictEqual(test.calls.length, 0, "Browsing/session construction must not mutate progress");
    await session.start();
    await Promise.resolve();
    var initialReport = test.calls.filter(function (call) { return call[0] === "timeline"; })[0];
    assert(initialReport && initialReport[2] === "playing",
        "An ordinary startup must send a playing state in its initial timeline request");
    assert.strictEqual(session.quality().source.width, 1920, "Original source quality must be separate from streaming quality");
    assert.strictEqual(session.quality().stream, null, "A requested transcode limit is not measured output quality");
    assert(!test.calls.some(function (call) { return call[0] === "streams"; }),
        "A default start must not PUT a stream selection: it would overwrite the account's language choice on PMS");
    var pausedReplacement = rig();
    var replacementSession = playback.create({ client: pausedReplacement.client, adapter: pausedReplacement.adapter,
        item: item, settings: { offset: 5000, paused: true, audioId: 31, subtitleId: 0, quality: "720" } });
    await replacementSession.start();
    await Promise.resolve();
    var replacementOpen = pausedReplacement.calls.filter(function (call) { return call[0] === "open"; })[0];
    var replacementTimeline = pausedReplacement.calls.filter(function (call) { return call[0] === "timeline"; })[0];
    assert.strictEqual(replacementOpen[3], true, "A stream replacement must preserve the paused adapter state");
    assert.strictEqual(replacementTimeline[2], "paused",
        "The first PMS timeline request after a paused replacement must remain paused");
    await replacementSession.stop();
    var preferred = JSON.parse(JSON.stringify(item));
    preferred.Media[0].Part[0].Stream = [
        { id: 31, streamType: 2, languageCode: "eng" },
        { id: 32, streamType: 2, languageCode: "fra", selected: true },
        { id: 41, streamType: 3, languageCode: "eng", selected: true }
    ];
    var preferredPlan = playback.plan(preferred, {});
    assert.strictEqual(preferredPlan.query.audioStreamID, 32, "The server-selected audio (account language preference) must be kept");
    assert.strictEqual(preferredPlan.query.subtitleStreamID, 41, "The server-selected subtitle (e.g. forced/foreign) must stay on");
    assert.strictEqual(preferredPlan.query.subtitles, "burn");
    var preferredRig = rig();
    var preferredSession = playback.create({ client: preferredRig.client, adapter: preferredRig.adapter, item: preferred });
    await preferredSession.start();
    assert(!preferredRig.calls.some(function (call) { return call[0] === "streams"; }));
    assert.deepStrictEqual(preferredSession.selection(), { audioId: 32, subtitleId: 41, explicit: false });
    await preferredSession.stop();
    var selectedAudio = JSON.parse(JSON.stringify(item));
    var selectedProfile = {
        evidence: "synthetic-profile", containers: ["mp4"], video: ["h264"], audio: ["aac", "ac3"],
        maxWidth: 1920, maxHeight: 1080
    };
    selectedAudio.Media[0].Part[0].Stream = [
        { id: 31, streamType: 2, codec: "aac" },
        { id: 32, streamType: 2, codec: "truehd", selected: true }
    ];
    var selectedAudioPlan = playback.plan(selectedAudio, { profile: selectedProfile, quality: "original" });
    assert.strictEqual(selectedAudioPlan.direct, false,
        "Direct-play eligibility must inspect the selected audio, not the media's default codec");
    assert.strictEqual(selectedAudioPlan.reason, "audio-codec");
    assert.strictEqual(selectedAudioPlan.query.directStream, 1,
        "An unsupported selected audio track may be converted without re-encoding supported video");
    selectedAudio.Media[0].audioCodec = "truehd";
    selectedAudioPlan = playback.plan(selectedAudio, {
        profile: selectedProfile, quality: "original", audioId: 31, subtitleId: 0
    });
    assert.strictEqual(selectedAudioPlan.direct, true,
        "A supported explicit audio choice must not inherit the default track's codec refusal");
    for (var forcedItem of [preferred, multipart]) {
        var forcedRig = rig();
        var forcedSession = playback.create({
            client: forcedRig.client, adapter: forcedRig.adapter, item: forcedItem,
            settings: { profile: selectedProfile, quality: "original", directPlay: "force" }
        });
        await assert.rejects(forcedSession.start(), /force|forced/i,
            "Force must refuse required subtitle burning or multipart joining instead of silently transcoding");
        assert.strictEqual(forcedRig.calls.length, 0,
            "A refused Force request must not select streams, allocate a transcode or open AVPlay");
    }
    var explicitRig = rig();
    var explicitSession = playback.create({ client: explicitRig.client, adapter: explicitRig.adapter, item: preferred,
        settings: { audioId: 31, subtitleId: 0 } });
    await explicitSession.start();
    assert.deepStrictEqual(explicitRig.calls[0], ["streams", "20", 31, 0],
        "An explicit pick (including Off) must be selected server-side before negotiation");
    assert.strictEqual(explicitRig.calls[1][1].subtitleStreamID, 0);
    assert.strictEqual(explicitRig.calls[1][1].subtitles, "none");
    await explicitSession.stop();
    await session.pause();
    assert(test.calls.some(function (call) { return call[0] === "timeline" && call[1] === 5000 && call[2] === "paused"; }));
    await session.seek(15000);
    await session.stop();
    var negotiated = rig();
    negotiated.client.request = function () {
        return Promise.resolve({ generalDecisionCode: 1001, Metadata: [{ Media: [{
            width: 1280, height: 720, bitrate: 4000, videoCodec: "h264", Part: [{ decision: "transcode" }]
        }] }] });
    };
    var measured = playback.create({ client: negotiated.client, adapter: negotiated.adapter, item: item,
        settings: { quality: "1080" } });
    await measured.start();
    assert.strictEqual(measured.quality().source.height, 1080);
    assert.strictEqual(measured.quality().stream.height, 720, "The PMS decision must not be replaced by the requested limit");
    assert.strictEqual(measured.quality().limit, "1080");
    await measured.stop();
    var stoppedReport = test.calls.filter(function (call) { return call[0] === "timeline" && call[2] === "stopped"; })[0];
    assert(stoppedReport && stoppedReport[1] === 15000);
    assert(stoppedReport[3], "The stopped report carries the decision session");
    assert(stoppedReport[4] && "audioId" in stoppedReport[4], "The stopped report carries the selected streams");
    assert(test.calls.some(function (call) { return call[0] === "cleanup"; }));
    assert(test.calls.some(function (call) { return call[0] === "readback"; }));
    assert.strictEqual(test.adapter.snapshot().state, "idle");
    await assert.rejects(session.start(), /cannot be started/);
    test = rig();
    var decision;
    test.client.request = function () { return new Promise(function (resolve) { decision = resolve; }); };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item });
    var starting = session.start();
    var guard;
    var duplicate = Promise.race([session.start(), new Promise(function (resolve, reject) {
        guard = setTimeout(function () { reject(new Error("Duplicate start remained pending instead of being refused")); }, 25);
    })]);
    try { await assert.rejects(duplicate, /already|cannot/, "A pending start must not negotiate/open twice"); }
    finally { clearTimeout(guard); }
    for (var tick = 0; tick < 10; tick += 1) { await Promise.resolve(); }
    var stopping = session.stop();
    decision({ generalDecisionCode: 1001 });
    await assert.rejects(starting, /cancelled/);
    await stopping;
    assert(!test.calls.some(function (call) { return call[0] === "open" || call[0] === "timeline"; }),
        "Stopping during negotiation must never open AVPlay or report playback");

    test = rig();
    test.client.request = function () { return Promise.resolve({ generalDecisionCode: 2001 }); };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item });
    await assert.rejects(session.start(), /refused playback/);
    assert(!test.calls.some(function (call) { return call[0] === "open" || call[0] === "timeline"; }));
    await session.stop();
    test = rig();
    test.client.selectStreams = function () { return Promise.reject(new Error("PMS refused stream selection")); };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { audioId: 0, subtitleId: 0 } });
    await assert.rejects(session.start(), /refused stream selection/);
    assert(!test.calls.some(function (call) { return call[0] === "decision" || call[0] === "open" || call[0] === "timeline"; }),
        "Failed stream selection must not silently play the wrong track");
    await session.stop();
    var profile = { evidence: "synthetic-measured-profile", containers: ["mp4"], video: ["h264"], audio: ["aac"],
        maxWidth: 1920, maxHeight: 1080 };
    var directPlan = playback.plan(item, { profile: profile });
    assert(/add-direct-play-profile\(type=videoProfile&protocol=http&container=mp4&videoCodec=h264&audioCodec=aac\)/
        .test(directPlan.query["X-Plex-Client-Profile-Extra"]), "PMS must be told which files this TV plays as they are");
    assert(!/add-direct-play-profile/.test(plan.query["X-Plex-Client-Profile-Extra"]));
    function directDecision(query) {
        return { generalDecisionCode: 1000, Metadata: [{ Media: [{ width: 1920, height: 1080, videoCodec: "h264",
            Part: [{ decision: query.directPlay ? "directplay" : "transcode" }] }] }] };
    }
    test = rig();
    test.client.request = function (path, method, query) { test.calls.push(["decision", query]); return Promise.resolve(directDecision(query)); };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { profile: profile } });
    await session.start();
    assert.strictEqual(session.mode(), "direct");
    assert(test.calls.some(function (call) { return call[0] === "open" && call[1] === "https://synthetic.invalid/library/parts/20/file.mp4"; }));
    await session.stop();
    assert(!test.calls.some(function (call) { return call[0] === "cleanup"; }), "Direct play allocates no transcode session to stop");

    test = rig();
    var events = [];
    test.client.request = function (path, method, query) {
        test.calls.push(["decision", JSON.parse(JSON.stringify(query))]);
        return Promise.resolve(directDecision(query));
    };
    var rejectingOpen = test.adapter.open;
    test.adapter.open = function (url, offset) {
        if (/library\/parts/.test(url)) { test.calls.push(["open", url]); return Promise.reject(new Error("Samsung AVPlay could not prepare.")); }
        return rejectingOpen(url, offset);
    };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item,
        settings: { profile: profile, offset: 5000 }, onEvent: function (event) { events.push(event); } });
    await session.start();
    assert.strictEqual(session.mode(), "transcode", "A file the TV refuses must fall back to a server transcode");
    var decisions = test.calls.filter(function (call) { return call[0] === "decision"; });
    assert.strictEqual(decisions.length, 2);
    assert.strictEqual(decisions[0][1].directPlay, 1);
    assert.strictEqual(decisions[1][1].directPlay, 0);
    var opens = test.calls.filter(function (call) { return call[0] === "open"; });
    assert.strictEqual(opens[opens.length - 1][1], "https://synthetic.invalid/video/:/transcode/universal/start.m3u8");
    assert(events.some(function (event) { return event.type === "direct-fallback"; }));
    assert(events.some(function (event) { return event.type === "source" && event.mode === "transcode"; }));
    await session.stop();
    assert(test.calls.some(function (call) { return call[0] === "cleanup"; }));

    // PMS-shaped decision: a direct ask carrying the HLS transcode caps (1080p / 8 Mbps) or
    // protocol=hls is answered with a transcode, which is what the 2017 UE55MU6172 observed
    // for a 9.9 Mbps 1080p H.264 MKV and a 3840x1600 HEVC MKV (device pass ea0d7c9b).
    function pmsDecision(source) {
        return function (query) {
            var direct = query.directPlay === 1 && query.protocol === "http" &&
                !(query.videoBitrate && query.videoBitrate < source.bitrate) &&
                !(query.maxVideoBitrate && query.maxVideoBitrate < source.bitrate) &&
                !(query.videoResolution && Number(query.videoResolution.split("x")[1]) < source.height) &&
                /add-direct-play-profile\([^)]*audioCodec=[^)&]*\b/.test(query["X-Plex-Client-Profile-Extra"]) &&
                new RegExp("audioCodec=[^)&]*\\b" + source.audioCodec + "\\b").test(
                    (/add-direct-play-profile\(([^)]*)\)/.exec(query["X-Plex-Client-Profile-Extra"]) || [""])[0]);
            return { generalDecisionCode: 1000, Metadata: [{ Media: [{ width: source.width, height: source.height,
                videoCodec: source.videoCodec, Part: [{ decision: direct ? "directplay" : "transcode" }] }] }] };
        };
    }
    var tvProfile = { evidence: "Measured on a 2017 Samsung TV (Tizen 3.0)", containers: ["mkv", "mp4", "mov"],
        video: ["h264", "hevc"], audio: ["aac", "ac3", "eac3", "dts", "mp3"], maxWidth: 3840, maxHeight: 2160 };
    var sources = [
        { ratingKey: "31", container: "mkv", videoCodec: "h264", audioCodec: "ac3", width: 1920, height: 1080, bitrate: 9900 },
        { ratingKey: "32", container: "mkv", videoCodec: "hevc", audioCodec: "eac3", width: 3840, height: 1600, bitrate: 14500 },
        { ratingKey: "33", container: "mkv", videoCodec: "h264", audioCodec: "dca", width: 1920, height: 1080, bitrate: 6000 }
    ];
    for (var s = 0; s < sources.length; s += 1) {
        var source = sources[s];
        var sourceItem = { ratingKey: source.ratingKey, duration: 100000, Media: [{ container: source.container,
            videoCodec: source.videoCodec, audioCodec: source.audioCodec, width: source.width, height: source.height,
            bitrate: source.bitrate, Part: [{ id: "4" + s, key: "/library/parts/4" + s + "/file.mkv", Stream: [] }] }] };
        test = rig();
        var answer = pmsDecision(source);
        test.client.request = function (path, method, query) {
            test.calls.push(["decision", JSON.parse(JSON.stringify(query))]);
            return Promise.resolve(answer(query));
        };
        session = playback.create({ client: test.client, adapter: test.adapter, item: sourceItem,
            settings: { profile: tvProfile, quality: "original" } });
        await session.start();
        assert.strictEqual(session.mode(), "direct", source.videoCodec + " " + source.width + "x" + source.height +
            " " + source.audioCodec + " at " + source.bitrate + " kbps must direct play, not inherit the transcode cap");
        assert(test.calls.some(function (call) { return call[0] === "open" && /library\/parts\/4/.test(call[1]); }));
        await session.stop();
    }

    // The LG ladder: any rung below Original converts a source above it, by height or bitrate.
    function ladderPlan(media, quality, streams, profile) {
        var item = { ratingKey: "50", Media: [Object.assign({ Part: [{ id: "5", key: "/library/parts/5/file.mkv",
            Stream: streams || [] }] }, media)] };
        return playback.plan(item, { profile: profile || documentedProfile, quality: quality || "original" });
    }
    var documentedProfile = { evidence: "Samsung media specifications", containers: ["mkv", "mp4", "mov", "mpegts"],
        videoContainers: { h264: ["mkv", "mp4", "mov", "mpegts"], hevc: ["mkv", "mp4", "mpegts"] },
        audioContainers: { opus: ["mkv"] }, video: ["h264", "hevc"], audio: ["aac", "ac3", "eac3", "mp3", "opus"],
        maxWidth: 3840, maxHeight: 2160, maxFrameRate: 60, maxBitrate: 60000, h264Level1080: 41, hdr: "hdr10" };
    var uhdHevc = { container: "mkv", videoCodec: "hevc", audioCodec: "eac3", width: 3840, height: 1600, bitrate: 14500 };
    assert.strictEqual(ladderPlan(uhdHevc, "original").direct, true, "Original plays the 1600-line HEVC as-is");
    var converted = ladderPlan(uhdHevc, "1080");
    assert.strictEqual(converted.direct, false); assert.strictEqual(converted.reason, "quality");
    assert.strictEqual(converted.query.directStream, 0, "A smaller rung re-encodes the video");
    assert.strictEqual(ladderPlan({ container: "mkv", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        bitrate: 12000 }, "1080").reason, "quality", "A rung's bitrate cap converts a heavier 1080p file");
    assert.strictEqual(ladderPlan({ container: "mkv", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        bitrate: 12000 }, "1080h").direct, true, "1080p 20 Mbps keeps a 12 Mbps original");
    var mov = ladderPlan({ container: "mov", videoCodec: "hevc", audioCodec: "aac", width: 1920, height: 1080, bitrate: 5000 });
    assert.strictEqual(mov.reason, "container", "HEVC is never direct from MOV");
    assert.strictEqual(mov.query.directStream, 1, "A container refusal remuxes and keeps the video");
    var opus = ladderPlan({ container: "mp4", videoCodec: "h264", audioCodec: "opus", width: 1920, height: 1080, bitrate: 5000 });
    assert.strictEqual(opus.reason, "audio-container", "Opus in MP4 waits for Tizen 6");
    assert.strictEqual(ladderPlan({ container: "mkv", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        bitrate: 5000 }, "original", [{ streamType: 1, frameRate: "119.88" }]).reason, "frame-rate", "Nothing above 60 fps is direct");
    assert.strictEqual(ladderPlan({ container: "mkv", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        bitrate: 5000 }, "original", [{ streamType: 1, frameRate: "59.94" }]).direct, true, "59.94 fps plays direct");
    assert.strictEqual(ladderPlan({ container: "mkv", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080,
        bitrate: 5000 }, "original", [{ streamType: 1, level: 51 }]).reason, "level", "H.264 level 5.1 at 1080p exceeds a 2017 set");
    var dv = { container: "mkv", videoCodec: "hevc", audioCodec: "eac3", width: 3840, height: 2160, bitrate: 30000,
        videoDynamicRange: "Dolby Vision" };
    assert.strictEqual(ladderPlan(dv, "original", [{ streamType: 1, DOVIPresent: true, DOVIProfile: 5 }]).reason,
        "dolby-vision", "DV profile 5 has no base layer");
    assert.strictEqual(ladderPlan(dv, "original", [{ streamType: 1, DOVIPresent: true, DOVIProfile: 8,
        DOVIBLCompatID: 1 }]).direct, true, "DV profile 8.1 plays its HDR10 base layer");
    var forced = playback.plan({ ratingKey: "51", Media: [Object.assign({ Part: [{ id: "6", key: "/library/parts/6/f.mkv",
        Stream: [] }] }, uhdHevc)] }, { profile: documentedProfile, quality: "720", directPlay: "force" });
    assert.strictEqual(forced.direct, true, "Force always sends the original");
    assert.strictEqual(forced.force, true);
    var off = playback.plan({ ratingKey: "52", Media: [Object.assign({ Part: [{ id: "7", key: "/library/parts/7/f.mkv",
        Stream: [] }] }, uhdHevc)] }, { profile: documentedProfile, quality: "original", directPlay: "off" });
    assert.strictEqual(off.direct, false, "Direct play Off always converts");
    assert.strictEqual(playback.streamMode(false, { Part: [{ Stream: [{ streamType: 1, decision: "copy" }] }] }), "directstream");
    assert.strictEqual(playback.streamMode(false, { Part: [{ Stream: [{ streamType: 1, decision: "transcode" }] }] }), "transcode");

    // When PMS still answers transcode, the HLS start must carry the transcode caps again.
    test = rig();
    var hlsQueries = [];
    test.client.request = function (path, method, query) {
        hlsQueries.push(JSON.parse(JSON.stringify(query)));
        return Promise.resolve({ generalDecisionCode: 1000, Metadata: [{ Media: [{ Part: [{ decision: "transcode" }] }] }] });
    };
    test.client.streamUrl = function (path, query) { test.calls.push(["url", path, JSON.parse(JSON.stringify(query))]); return "https://synthetic.invalid" + path; };
    session = playback.create({ client: test.client, adapter: test.adapter, item: item, settings: { profile: profile } });
    await session.start();
    assert.strictEqual(session.mode(), "transcode");
    var started = test.calls.filter(function (call) { return call[0] === "url"; }).pop();
    assert.strictEqual(started[2].protocol, "hls");
    assert.strictEqual(started[2].directPlay, 0);
    assert.strictEqual(started[2].videoBitrate, 8000, "A transcode keeps its quality cap");
    assert.strictEqual(hlsQueries[hlsQueries.length - 1].directPlay, 0, "The transcode is registered by its own decision");
    await session.stop();

    console.log("Tizen playback negotiation/progress/read-back tests: passed");
}
run().catch(function (error) { console.error(error); process.exit(1); });
