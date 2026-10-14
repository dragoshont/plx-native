"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const bridge = require("./app/bridge.js");
const gate = require("../check-es5.js");

if (!process.argv[2]) {
    throw new Error("usage: node test.js /private/staged/app/probe.wasm");
}
const bytes = fs.readFileSync(process.argv[2]);
const moduleObject = new WebAssembly.Module(bytes);

test("compiled Rust module has no host imports and the expected ABI", () => {
    assert.deepEqual(WebAssembly.Module.imports(moduleObject), []);
    const names = WebAssembly.Module.exports(moduleObject).map(entry => entry.name);
    assert.ok(names.includes("probe_abi"));
    assert.ok(names.includes("probe_response"));
    assert.ok(bytes.length > 0 && bytes.length <= 65536);
});

test("compiled Rust responds to distinct challenge words including unsigned extremes", async () => {
    for (const [first, second] of [[0, 0], [1, 2], [0xffffffff, 0xffffffff],
        [0x12345678, 0xabcdef01], [0x80000000, 0x7fffffff]]) {
        const receipt = await bridge.run(bytes, first, second);
        const rotated = ((first << 7) | (first >>> 25)) >>> 0;
        const expected = Math.imul(rotated ^ second ^ 0x52555354, 0x9e3779b1) >>> 0;
        assert.deepEqual(receipt, {
            runtime: "rust-wasm", abi: 1, challenge: [first, second], result: expected
        });
    }
});

test("invalid challenge words are refused rather than coerced", () => {
    for (const invalid of [-1, 0x100000000, NaN, Infinity, 0.5, "1", null, undefined]) {
        assert.throws(() => bridge.run(bytes, invalid, 0), /unsigned 32-bit/);
        assert.throws(() => bridge.run(bytes, 0, invalid), /unsigned 32-bit/);
    }
});

test("corrupt module rejects without producing a Rust receipt", async () => {
    await assert.rejects(bridge.run(new Uint8Array([0, 1, 2, 3]), 1, 2),
        WebAssembly.CompileError);
});

test("valid but unrelated module is refused", async () => {
    const empty = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
    await assert.rejects(bridge.run(empty, 1, 2), /entry points are missing/);
});

test("browser scripts retain ES5 syntax", () => {
    for (const name of ["bridge.js", "app.js"]) {
        assert.deepEqual(gate.runtimeIssues(fs.readFileSync(`${__dirname}/app/${name}`, "utf8")), []);
    }
});

test("missing browser Wasm capability fails explicitly", () => {
    const context = { window: {} };
    vm.runInNewContext(fs.readFileSync(`${__dirname}/app/bridge.js`, "utf8"), context);
    vm.runInNewContext("WebAssembly = undefined", context);
    assert.throws(() => context.window.RustWasmProbe.run(bytes, 1, 2),
        /does not support WebAssembly/);
});

function browser({ wasm = WebAssembly, random = true } = {}) {
    let request;
    let finish;
    const completed = new Promise(resolve => { finish = resolve; });
    const window = { crypto: random ? {
        getRandomValues: words => { words[0] = 0x12345678; words[1] = 0xabcdef01; }
    } : undefined };
    let receipt;
    Object.defineProperty(window, "rustWasmReceipt", {
        get: () => receipt,
        set: value => {
            receipt = value;
            if (value.status !== "loading") { finish(value); }
        }
    });
    const context = {
        window, WebAssembly: wasm, Uint32Array, console: { log() {}, error() {} },
        document: { getElementById: () => ({ textContent: "" }) },
        XMLHttpRequest: function () {
            request = this;
            this.open = (method, url, async) => {
                assert.deepEqual([method, url, async], ["GET", "probe.wasm", true]);
            };
            this.send = () => {};
            this.abort = () => { this.aborted = true; this.onabort(); };
        }
    };
    for (const name of ["bridge.js", "app.js"]) {
        vm.runInNewContext(fs.readFileSync(`${__dirname}/app/${name}`, "utf8"), context);
    }
    return { request, completed };
}

test("browser shell publishes a receipt from actual Rust execution", async () => {
    const { request, completed } = browser();
    assert.equal(request.timeout, 10000);
    assert.equal(request.responseType, "arraybuffer");
    request.status = 200;
    request.response = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    request.onload();
    const receipt = JSON.parse(JSON.stringify(await completed));
    const expected = await bridge.run(bytes, 0x12345678, 0xabcdef01);
    assert.deepEqual(receipt, { ...expected, status: "executed" });
});

test("browser shell refuses absent capabilities explicitly", async () => {
    const withoutWasm = browser({ wasm: false });
    assert.equal(withoutWasm.request, undefined);
    assert.match((await withoutWasm.completed).error, /WebAssembly is unavailable/);
    const withoutRandom = browser({ random: false });
    assert.equal(withoutRandom.request, undefined);
    assert.match((await withoutRandom.completed).error, /secure fresh challenge/);
});

test("browser shell enforces transfer limit, deadline, status and cancellation", async () => {
    for (const trigger of [
        request => request.onprogress({ loaded: 65537 }),
        request => request.ontimeout(),
        request => request.onerror(),
        request => request.onabort(),
        request => { request.status = 403; request.response = bytes; request.onload(); },
        request => { request.status = 200; request.response = new ArrayBuffer(0); request.onload(); },
        request => { request.status = 200; request.response = new ArrayBuffer(65537); request.onload(); }
    ]) {
        const { request, completed } = browser();
        trigger(request);
        assert.equal((await completed).status, "failed");
    }
});
