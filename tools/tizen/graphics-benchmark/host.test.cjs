"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("../../../tests/tizen/node_modules/jsdom");
const stage = process.argv[2];
assert(stage, "Pass the private staged benchmark directory");
const dom = new JSDOM(fs.readFileSync(path.join(stage, "index.html"), "utf8"), {
    url: "https://benchmark.synthetic.invalid", runScripts: "outside-only", pretendToBeVisual: true
});
const w = dom.window;
w.URL.createObjectURL = () => "blob:synthetic-" + Math.random();
w.URL.revokeObjectURL = () => {};
const src = Object.getOwnPropertyDescriptor(w.HTMLImageElement.prototype, "src");
Object.defineProperty(w.HTMLImageElement.prototype, "src", { configurable: true, get: src.get, set(value) {
    src.set.call(this, value);
    Object.defineProperties(this, {
        complete: { configurable: true, value: true },
        naturalWidth: { configurable: true, value: 1280 },
        naturalHeight: { configurable: true, value: 720 },
        clientWidth: { configurable: true, value: 1920 },
        clientHeight: { configurable: true, value: 1080 }
    });
    setTimeout(() => this.dispatchEvent(new w.Event("load")), 1);
} });
const gl = new Proxy({ NO_ERROR: 0 }, { get(target, key) {
    if (key in target) return target[key];
    if (key === "getExtension") return name => name === "WEBGL_lose_context" ? { loseContext() {} } : null;
    if (key === "getParameter") return name => name === "MAX_TEXTURE_SIZE" ? 4096 : name === "MAX_TEXTURE_IMAGE_UNITS" ? 2 : "Host mock";
    if (["getShaderParameter", "getProgramParameter"].includes(key)) return () => true;
    if (key === "isContextLost") return () => false;
    if (key === "getError" || key === "getAttribLocation") return () => 0;
    if (key.startsWith("create")) return () => ({});
    if (key === "getUniformLocation") return () => ({});
    if (key.toUpperCase() === key) return key;
    return () => {};
} });
w.HTMLCanvasElement.prototype.getContext = () => gl;
(async () => {
    try {
        for (const script of Array.from(w.document.querySelectorAll("script[src]"))) {
            w.eval(fs.readFileSync(path.join(stage, script.getAttribute("src")), "utf8"));
        }
        assert.equal(w.__tvBenchmark.describe().app_id, "PlxBench01.Probe");
        for (let order = 0; order < 4; order++) {
            const request = { id: "host:" + order, block: order, mode: order === 1 || order === 2 ? "on" : "off",
                phase: "sample", index: 0 };
            assert.equal(w.__tvBenchmark.begin(request), true);
            const deadline = Date.now() + 12000;
            let sample;
            do {
                await new Promise(resolve => setTimeout(resolve, 10));
                sample = w.__tvBenchmark.poll(request.id);
                assert.notEqual(sample.state, "error", JSON.stringify(w.graphicsBenchmarkResult.errors));
            } while (sample.state === "pending" && Date.now() < deadline);
            assert.equal(sample.state, "complete", "Toolkit adapter operation deadline");
            assert.equal(sample.metrics.featured_ready_ms.length, 6);
            assert.equal(sample.metrics.detail_ready_ms.length, 6);
            assert.equal(sample.metrics.warmup_featured_ready_ms.length, 1);
            assert.equal(sample.metrics.warmup_detail_ready_ms.length, 1);
            if (request.mode === "off") { assert.equal(sample.metrics.context_ms, null); }
        }
        assert.equal(w.graphicsBenchmarkCapture.networkAttempts, 0);
        assert.equal(w.graphicsBenchmarkCapture.playbackAttempts, 0);
        for (const block of w.graphicsBenchmarkResult.blocks) {
            assert.equal(block.operations.length, 14);
            assert.equal(block.navigation.events, 32);
            assert.equal(block.operations.filter(op => !op.warmup).length, 12);
        }
        assert.equal(w.graphicsBenchmarkResult.blocks[0].operations.flatMap(op => op.calls).filter(call => call.method === "getContext").length, 0);
        assert(w.graphicsBenchmarkResult.blocks[1].operations.flatMap(op => op.calls).filter(call => call.method === "getContext").length >= 14);
        assert.equal(JSON.parse(w.localStorage.getItem("plx-tizen-preferences")).enhancedGraphics, false);
        assert.equal(w.__tvBenchmark.cancel(), true);
        assert.equal(w.localStorage.getItem("plx-tizen-preferences"), null);
        assert.equal(w.document.querySelectorAll(".plex-graphics-backdrop").length, 0);
        assert.throws(() => w.__tvBenchmark.begin({ id: "again", block: 0, mode: "off", phase: "sample", index: 0 }));
        console.log("Real published routes, inert safety and toolkit ABBA adapter: passed (host mocks, not timing evidence)");
    } finally { w.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
