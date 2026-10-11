"use strict";
// Subtitle search & download (docs/pms-api.md section 8), ported from the LG client's
// rust-modules/plex/src/plex/subtitles.rs and rust-modules/data/src/subsearch.rs. Every server is
// synthetic; nothing here can reach a real account.
var assert = require("assert");
var api = require("../../samsung/PlexTv/js/plex-api");
var search = require("../../samsung/PlexTv/js/subtitle-search");

function respond(status, payload) {
    var text = payload === undefined ? "" : JSON.stringify(payload);
    return { ok: status >= 200 && status < 300, status: status, body: new ReadableStream({
        start: function (controller) {
            if (text) { controller.enqueue(new TextEncoder().encode(text)); }
            controller.close();
        }
    }) };
}

function client(handler, calls) {
    return api.createClient({
        baseUrl: "https://pms.synthetic.invalid", token: "synthetic-server-token",
        fetch: function (url, options) {
            var parsed = new URL(url);
            calls.push({ url: parsed, method: options.method });
            return Promise.resolve(handler(parsed, options));
        }
    });
}

function item(streams) {
    return { MediaContainer: { Metadata: [{ ratingKey: "77", Media: [{ Part: [{ id: 5, Stream: streams }] }] }] } };
}

async function run() {
    // Language: PMS 500s on three-letter codes, so fold to ISO 639-1 or refuse locally.
    assert.strictEqual(search.twoLetter("nld"), "nl");
    assert.strictEqual(search.twoLetter("dut"), "nl");
    assert.strictEqual(search.twoLetter("eng"), "en");
    assert.strictEqual(search.twoLetter("en-GB"), "en");
    assert.strictEqual(search.twoLetter("pt_BR"), "pt");
    assert.strictEqual(search.twoLetter("english"), null);
    assert.strictEqual(search.twoLetter("zzz"), null);
    assert.strictEqual(search.twoLetter(""), null);
    var part = { Stream: [
        { streamType: 2, selected: true, languageCode: "fre" },
        { streamType: 3, selected: false, languageCode: "ger" }
    ] };
    assert.strictEqual(search.defaultLanguage(part, "es"), "fr", "Selected audio beats the app language");
    part.Stream[1].selected = true;
    assert.strictEqual(search.defaultLanguage(part, "es"), "de", "Selected subtitle wins");
    assert.strictEqual(search.defaultLanguage({ Stream: [] }, "be"), "be");
    assert.strictEqual(search.defaultLanguage(null, "xyz1"), "en");

    // Candidate key guard: interpolated into a path, so only the measured shape passes.
    assert(search.candidateKeyAllowed("/library/streams/6923797"));
    assert(search.candidateKeyAllowed("/library/streams/6923797.srt"));
    ["/library/streams/../x", "/library/streams/1?x=2", "https://evil.invalid/library/streams/1",
        "/library/streams/", "/library/parts/1", 42, null].forEach(function (bad) {
        assert(!search.candidateKeyAllowed(bad), "rejects " + bad);
    });

    // Hits: string score, stable best-first order, keyless or non-subtitle rows dropped.
    var hits = search.hitsOf({ Stream: [
        { streamType: 3, key: "/library/streams/1", title: "low", score: "10", providerTitle: "OpenSubtitles" },
        { streamType: 3, key: "/library/streams/2", title: "high", score: "2301", hearingImpaired: "1" },
        { streamType: 3, title: "no key", score: "9999" },
        { streamType: 3, key: "/library/streams/3/../4", title: "bad key", score: "9999" },
        { streamType: 2, key: "/library/streams/5", title: "audio", score: "9999" },
        { streamType: 3, key: "/library/streams/6", title: "tie", score: "10" }
    ] });
    assert.deepStrictEqual(hits.map(function (hit) { return hit.title; }), ["high", "low", "tie"]);
    assert.strictEqual(hits[0].score, 2301);
    assert.strictEqual(hits[0].hearingImpaired, true);
    assert.strictEqual(hits[1].provider, "OpenSubtitles");
    assert.deepStrictEqual(search.hitsOf({}), [], "An empty answer is an answer, not a failure");

    // Search request shape and failure verdicts.
    var calls = [];
    var status = 200;
    var pms = client(function () {
        return respond(status, status === 200 ? { MediaContainer: { Stream: [] } } : undefined);
    }, calls);
    await pms.searchSubtitles("77", "nl");
    assert.strictEqual(calls[0].method, "GET");
    assert.strictEqual(calls[0].url.pathname, "/library/metadata/77/subtitles");
    assert.strictEqual(calls[0].url.searchParams.get("language"), "nl");
    assert.strictEqual(calls[0].url.searchParams.get("hearingImpaired"), "0");
    assert.strictEqual(calls[0].url.searchParams.get("forced"), "0");
    var refused = await pms.searchSubtitles("77", "nld").catch(function (error) { return error; });
    assert.strictEqual(search.failure(refused), "bad-language");
    assert.strictEqual(calls.length, 1, "A three-letter code must never reach PMS");
    await assert.rejects(pms.searchSubtitles("../1", "en"), /invalid media identifier/);
    for (var pair of [[401, "denied"], [403, "denied"], [404, "missing"], [500, "transport"]]) {
        status = pair[0];
        var error = await pms.searchSubtitles("77", "en").catch(function (thrown) { return thrown; });
        assert.strictEqual(search.failure(error), pair[1], "HTTP " + pair[0]);
    }
    assert.strictEqual(search.failure(new Error("offline")), "transport");

    // Download PUT shape and guard.
    calls = [];
    pms = client(function () { return respond(200); }, calls);
    await pms.addSubtitle("77", "/library/streams/6923797");
    assert.strictEqual(calls[0].method, "PUT");
    assert.strictEqual(calls[0].url.pathname, "/library/metadata/77/subtitles");
    assert.strictEqual(calls[0].url.searchParams.get("key"), "/library/streams/6923797");
    await assert.rejects(pms.addSubtitle("77", "/library/streams/1?x"), /invalid subtitle candidate/);
    assert.strictEqual(calls.length, 1);

    // identify(): titled new stream, else the only new one, else the newest; old ids never count.
    var before = [10];
    function meta(streams) { return item(streams).MediaContainer.Metadata[0]; }
    var rows = [{ streamType: 3, id: 10, key: "/library/streams/10", title: "pick" },
        { streamType: 3, id: 12, key: "/library/streams/12", title: "other" },
        { streamType: 3, id: 11, key: "/library/streams/11", title: "pick" }];
    assert.strictEqual(search.identify(meta(rows), before, "pick").id, 11);
    assert.strictEqual(search.identify(meta(rows), before, "absent").id, 12);
    assert.strictEqual(search.identify(meta(rows.slice(0, 2)), before, "absent").id, 12);
    assert.strictEqual(search.identify(meta(rows.slice(0, 1)), before, "pick"), null);

    // download(): reads ids first, PUTs once, polls a bounded number of times.
    calls = [];
    var polls = 0;
    var installAfter = 3;
    pms = client(function (url, options) {
        if (options.method === "PUT") { return respond(200); }
        polls += 1;
        var streams = [{ streamType: 3, id: 10, key: "/library/streams/10", title: "old" }];
        if (installAfter && polls > installAfter) {
            streams.push({ streamType: 3, id: 99, key: "/library/streams/99", title: "pick", codec: "srt" });
        }
        return respond(200, item(streams));
    }, calls);
    var noWait = function () { return Promise.resolve(); };
    var hit = { key: "/library/streams/6923797", title: "pick" };
    var installed = await search.download(pms, "77", hit, { wait: noWait });
    assert.strictEqual(installed.id, 99);
    assert.deepStrictEqual(calls.map(function (call) { return call.method; }), ["GET", "PUT", "GET", "GET", "GET"]);
    calls.length = 0; polls = 0; installAfter = 0;
    assert.strictEqual(await search.download(pms, "77", hit, { wait: noWait, attempts: 4 }), null,
        "Nothing appeared: unconfirmed, not failed");
    assert.strictEqual(calls.length, 1 + 1 + 4);
    calls.length = 0; polls = 0;
    var alive = true;
    var cancelled = await search.download(pms, "77", hit, {
        wait: function () { alive = false; return Promise.resolve(); }, alive: function () { return alive; }
    });
    assert.strictEqual(cancelled, null);
    assert.strictEqual(calls.length, 2, "Leaving the player stops polling");
    console.log("Tizen subtitle search/download contracts (language fold, key guard, verdicts, identify, poll): passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });

// Regression: changing audio under a text overlay used to send subtitleStreamID=0, which deletes a
// downloaded subtitle on PMS. Only the explicit "Subtitles off" choice may select 0.
(function () {
    var mainSource = require("fs").readFileSync(require("path").join(__dirname, "../../samsung/PlexTv/main.js"), "utf8");
    assert.ok(!/externalCues \? 0/.test(mainSource), "audio change must not clear the subtitle selection");
    assert.ok(/reload\(stream\.id, current\.subtitleId, externalCues\)/.test(mainSource));
    assert.strictEqual((mainSource.match(/reload\(current\.audioId, 0\)/g) || []).length, 1);
}());
