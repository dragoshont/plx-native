"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "probe.js"), "utf8");

function fixture(options = {}) {
    const frames = [];
    const deleted = [];
    const constants = ["VERTEX_SHADER", "FRAGMENT_SHADER", "COMPILE_STATUS", "LINK_STATUS",
        "ARRAY_BUFFER", "STATIC_DRAW", "FLOAT", "TRIANGLES", "RGBA", "UNSIGNED_BYTE",
        "VENDOR", "RENDERER", "VERSION"];
    const gl = { NO_ERROR: 0 };
    constants.forEach(name => { gl[name] = name; });
    ["shaderSource", "compileShader", "attachShader", "linkProgram", "useProgram", "bindBuffer",
        "bufferData", "vertexAttribPointer", "enableVertexAttribArray", "viewport", "drawArrays"]
        .forEach(name => { gl[name] = () => {}; });
    gl.createShader = type => ({ type });
    gl.createProgram = () => ({ program: true });
    gl.createBuffer = () => ({ buffer: true });
    gl.getShaderParameter = shader => !(options.shaderFailure && shader.type === gl.FRAGMENT_SHADER);
    gl.getProgramParameter = () => !options.linkFailure;
    gl.getShaderInfoLog = gl.getProgramInfoLog = () => "injected failure";
    gl.getAttribLocation = () => 0;
    gl.getError = () => options.glError || 0;
    gl.readPixels = (...args) => { args[6].set(options.pixel || [64, 128, 191, 255]); };
    gl.getParameter = key => key;
    gl.getExtension = name => name === "WEBGL_lose_context" ?
        { loseContext: () => deleted.push("context") } : null;
    gl.deleteShader = shader => { deleted.push(shader.type); };
    gl.deleteProgram = () => { deleted.push("program"); };
    gl.deleteBuffer = () => { deleted.push("buffer"); };
    function node() { return { style: {}, children: [], appendChild(child) { this.children.push(child); } }; }
    const track = node();
    const viewport = node();
    const canvas = { getContext: () => options.noContext ? null : gl };
    const window = { requestAnimationFrame: callback => { frames.push(callback); } };
    const context = { window, document: {
        getElementById: id => ({ track, viewport, gpu: canvas })[id],
        createElement: node
    }, performance: { now: () => 0 }, navigator: { userAgent: "host fixture" } };
    vm.runInNewContext(source, context);
    return { api: window.accelerationProbe, frames, track, deleted };
}

let checks = 0;
function check(action) { action(); checks += 1; }
check(() => {
    const f = fixture();
    assert.equal(JSON.stringify(f.api.graphics().pixel), "[64,128,191,255]");
    assert.deepEqual(f.deleted.sort(), ["FRAGMENT_SHADER", "VERTEX_SHADER", "buffer", "context", "program"].sort());
    assert.equal(f.track.children.length, 12);
    assert.equal(f.track.children[0].children.length, 8);
});
check(() => {
    const f = fixture({ pixel: [0, 0, 0, 255] });
    assert.throws(() => f.api.graphics(), /Rendered pixel mismatch/);
    assert(f.deleted.includes("context"));
});
check(() => {
    const f = fixture({ glError: 1280 });
    assert.throws(() => f.api.graphics(), /GL error 1280/);
    assert(f.deleted.includes("buffer"));
});
check(() => {
    const f = fixture({ shaderFailure: true });
    assert.throws(() => f.api.graphics(), /Shader compilation failed/);
    assert(f.deleted.includes("VERTEX_SHADER"));
    assert(f.deleted.includes("FRAGMENT_SHADER"));
});
check(() => {
    const f = fixture({ linkFailure: true });
    assert.throws(() => f.api.graphics(), /Program link failed/);
    assert(f.deleted.includes("program"));
});
check(() => {
    assert.throws(() => fixture({ noContext: true }).api.graphics(), /context unavailable/);
});
check(() => {
    for (const mode of ["transform", "scroll"]) {
        const f = fixture();
        assert.throws(() => f.api.startMotion("invalid"), /Unknown trial/);
        f.api.startMotion(mode);
        assert.throws(() => f.api.startMotion(mode), /still running/);
        for (let frame = 0; frame < 120; frame += 1) {
            assert.equal(f.frames.length, 1);
            f.frames.shift()(frame * 16.7);
        }
        assert.equal(f.frames.length, 0);
        assert.equal(f.api.motion().frames, 120);
        assert.equal(f.api.motion().done, true);
        assert.equal(f.api.motion().intervals.length, 119);
        if (mode === "transform") {
            assert.equal(f.track.style.transform, "translate3d(0,-472px,0)");
        }
    }
});
console.log(`${checks} probe contract checks passed (host mocks, not GPU evidence).`);
