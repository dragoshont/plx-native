"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function fixture() {
    let cancelled = 0;
    let starts = 0;
    const timers = new Map();
    let serial = 0;
    const window = {
        graphicsBenchmarkDescriptor: { schema: 1, metrics: {} },
        graphicsBenchmarkResult: { phase: "idle", errors: [], blocks: [] },
        setTimeout(fn) { timers.set(++serial, fn); return serial; },
        clearTimeout(id) { timers.delete(id); },
        graphicsBenchmarkConnect() { window.graphicsBenchmarkResult.phase = "ready"; },
        graphicsBenchmarkBlock() { starts++; window.graphicsBenchmarkResult.phase = "running"; },
        graphicsBenchmarkNavigation() { assert.fail("Navigation cannot start while the block runs"); },
        graphicsBenchmarkCancel() { cancelled++; window.graphicsBenchmarkResult.phase = "cancelled"; return true; }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "toolkit-adapter.js"), "utf8"), { window });
    return { api: window.__tvBenchmark, window, timers,
        starts: () => starts, cancelled: () => cancelled,
        tick() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); } };
}
const req = { id: "run:0:sample:0", block: 0, mode: "off", phase: "sample", index: 0 };
{
    const f = fixture();
    assert.equal(f.api.begin(req), true);
    const delayed = Array.from(f.timers.values())[0];
    assert.equal(f.api.cancel(), true);
    assert.equal(f.timers.size, 0);
    delayed();
    assert.equal(f.starts(), 0);
    assert.equal(f.cancelled(), 1);
    assert.equal(f.api.poll(req.id).state, "error");
    assert.throws(() => f.api.begin(req), /requires four ABBA/);
}
{
    const f = fixture();
    assert.throws(() => f.api.begin({ ...req, phase: "warmup" }), /warmup=0/);
    assert.throws(() => f.api.begin({ ...req, mode: "on" }), /ABBA/);
    f.api.begin(req);
    f.tick();
    assert.equal(f.starts(), 1);
    assert.throws(() => f.api.begin(req), /ABBA/);
    f.window.graphicsBenchmarkResult.errors.push("simulated workload failure");
    f.tick();
    assert.equal(f.api.poll(req.id).state, "error");
    assert.equal(f.timers.size, 0);
    assert.equal(f.cancelled(), 1);
    assert.throws(() => f.api.poll("wrong"), /Unknown/);
}
console.log("Toolkit adapter cancellation, stale callbacks, invalid requests and errors: passed");
