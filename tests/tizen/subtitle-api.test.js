"use strict";
var assert = require("assert");
var api = require("../../samsung/Vemm/js/plex-api");
var subtitles = require("../../samsung/Vemm/js/subtitles");
var calls = [];
var codec = "srt";
var client = api.createClient({
    baseUrl: "https://pms.synthetic.invalid", token: "synthetic-server-token",
    fetch: function (url, options) {
        calls.push({ url: new URL(url), options: options });
        var text = codec === "srt" ? "1\n00:00:01,000 --> 00:00:02,000\nSynthetic caption\n" :
            "WEBVTT\n\n00:01.000 --> 00:02.000\nSynthetic caption\n";
        return Promise.resolve({ ok: true, status: 200, body: new ReadableStream({
            start: function (controller) {
                controller.enqueue(new TextEncoder().encode(text));
                controller.close();
            }
        }) });
    }
});
async function run() {
    var text = await client.subtitleText(42, codec);
    assert.strictEqual(calls[0].url.pathname, "/library/streams/42", "Do not invent a .srt suffix on the stream ID");
    assert.strictEqual(calls[0].url.searchParams.get("encoding"), "utf-8");
    assert.strictEqual(calls[0].url.searchParams.get("format"), "srt");
    assert.strictEqual(subtitles.at(subtitles.parse(text), 1500).trim(), "Synthetic caption");
    codec = "webvtt";
    text = await client.subtitleText(42, codec);
    assert.strictEqual(calls[1].url.pathname, "/library/streams/42");
    assert.strictEqual(calls[1].url.searchParams.get("encoding"), "utf-8");
    assert.strictEqual(calls[1].url.searchParams.get("format"), null, "Do not request an unverified WebVTT conversion");
    assert.strictEqual(subtitles.at(subtitles.parse(text), 1500).trim(), "Synthetic caption");
    await assert.rejects(client.subtitleText(42, "ass"), /server rendering/);
    assert.strictEqual(calls.length, 2);
    console.log("Tizen source-backed external subtitle retrieval/rendering contracts: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
