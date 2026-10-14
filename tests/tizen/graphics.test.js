"use strict";
var assert = require("assert");
var JSDOM = require("jsdom").JSDOM;
var graphics = require("../../samsung/Vemm/js/graphics.js");
var checks = 0;

function fixture(config) {
    config = config || {};
    var dom = new JSDOM("<!doctype html><body><section id='hero'></section></body>");
    var doc = dom.window.document;
    var nativeCreate = doc.createElement.bind(doc);
    var callbacks = new Map(), timers = new Map(), history = [], resize = new Set();
    var clock = 0, id = 0, allocations = 0, contexts = 0;
    var statuses = [], errors = [], calls = [], live = new Set(), peakTextures = 0;
    var canvas = null, lost = false;
    var gl = { NO_ERROR: 0 };
    ["VERTEX_SHADER", "FRAGMENT_SHADER", "COMPILE_STATUS", "LINK_STATUS", "ARRAY_BUFFER",
        "STATIC_DRAW", "FLOAT", "TRIANGLE_STRIP", "TEXTURE_2D", "TEXTURE0", "TEXTURE1",
        "TEXTURE_WRAP_S", "TEXTURE_WRAP_T", "TEXTURE_MIN_FILTER", "TEXTURE_MAG_FILTER",
        "CLAMP_TO_EDGE", "LINEAR", "UNPACK_FLIP_Y_WEBGL", "RGBA", "UNSIGNED_BYTE",
        "RENDERER", "MAX_TEXTURE_SIZE", "MAX_TEXTURE_IMAGE_UNITS", "BLEND", "DEPTH_TEST"]
        .forEach(function (name) { gl[name] = name; });
    function resource(kind) {
        var value = { kind: kind };
        live.add(value);
        if (kind === "texture") {
            peakTextures = Math.max(peakTextures, Array.from(live).filter(function (row) { return row.kind === kind; }).length);
        }
        return value;
    }
    gl.createShader = function () { return config.nullShader ? null : resource("shader"); };
    gl.createProgram = function () { return config.nullProgram ? null : resource("program"); };
    gl.createBuffer = function () { return config.nullBuffer ? null : resource("buffer"); };
    gl.createTexture = function () { return config.nullTexture ? null : resource("texture"); };
    ["deleteShader", "deleteProgram", "deleteBuffer", "deleteTexture"].forEach(function (name) {
        gl[name] = function (value) { calls.push([name, value]); live.delete(value); };
    });
    ["shaderSource", "compileShader", "attachShader", "linkProgram", "bindBuffer", "bufferData",
        "useProgram", "vertexAttribPointer", "enableVertexAttribArray", "disable", "activeTexture",
        "bindTexture", "texParameteri", "pixelStorei", "viewport", "uniform1i"].forEach(function (name) {
        gl[name] = function () { calls.push([name].concat(Array.from(arguments))); };
    });
    gl.getShaderParameter = function () { return !config.shaderFailure; };
    gl.getProgramParameter = function () { return !config.linkFailure; };
    gl.getAttribLocation = function () { return config.noAttribute ? -1 : 0; };
    gl.getUniformLocation = function (program, name) { return config.noUniform ? null : name; };
    gl.getParameter = function (key) {
        if (key === gl.MAX_TEXTURE_SIZE) { return config.maxTexture === undefined ? 4096 : config.maxTexture; }
        if (key === gl.MAX_TEXTURE_IMAGE_UNITS) { return config.units === undefined ? 2 : config.units; }
        return config.renderer || "Mali-G51";
    };
    gl.getExtension = function (name) {
        if (name === "WEBGL_debug_renderer_info") { return config.noDebug ? null : { UNMASKED_RENDERER_WEBGL: "driver" }; }
        if (name === "WEBGL_lose_context") {
            return { loseContext: function () { calls.push(["loseContext"]); live.clear(); } };
        }
        return null;
    };
    gl.isContextLost = function () { return lost; };
    gl.uniform4fv = function (name, value) { calls.push(["uniform4fv", name, value]); };
    gl.uniform1f = function (name, value) { calls.push(["uniform1f", name, value]); };
    gl.texImage2D = function () {
        if (config.uploadFailure) { throw new Error("private blob:do-not-log"); }
        calls.push(["texImage2D"].concat(Array.from(arguments)));
    };
    gl.drawArrays = function () {
        var image = calls.filter(function (row) { return row[0] === "texImage2D"; }).slice(-1)[0];
        if (config.assertVisibleAtDraw && image) { assert.notStrictEqual(image[6].style.opacity, "0"); }
        calls.push(["drawArrays"].concat(Array.from(arguments)));
    };
    gl.getError = function () {
        var drawn = calls.length && calls[calls.length - 1][0] === "drawArrays";
        return drawn && config.drawError ? 1280 : config.uploadError ? 1281 : 0;
    };
    doc.createElement = function (tag) {
        var node = nativeCreate(tag);
        if (tag === "canvas") {
            allocations += 1;
            canvas = node;
            node.getContext = function (kind, options) {
                contexts += 1;
                lost = false;
                calls.push(["getContext", kind, options]);
                return config.noContext ? null : gl;
            };
        }
        return node;
    };
    dom.window.addEventListener = function (name, fn) { if (name === "resize") { resize.add(fn); } };
    dom.window.removeEventListener = function (name, fn) { if (name === "resize") { resize.delete(fn); } };
    var api = graphics.create({
        document: doc,
        requestAnimationFrame: function (fn) { callbacks.set(++id, fn); history.push(fn); return id; },
        cancelAnimationFrame: function (key) { callbacks.delete(key); },
        now: function () { return clock; },
        setTimeout: function (fn) { timers.set(++id, fn); return id; },
        clearTimeout: function (key) { timers.delete(key); },
        onStatus: function (value) { statuses.push(value); if (config.statusCallback) { config.statusCallback(value, api); } },
        onError: function (error) { errors.push(error); }
    });
    function image(values) {
        values = values || {};
        var node = doc.createElement("img");
        node.className = values.className || "home-hero-art";
        node.alt = values.alt || "";
        node.src = values.src || "blob:synthetic-" + id++;
        Object.defineProperties(node, {
            complete: { value: values.complete !== false },
            naturalWidth: { value: values.width === undefined ? 1280 : values.width },
            naturalHeight: { value: values.height === undefined ? 720 : values.height },
            clientWidth: { get: function () { return values.boxWidth === undefined ? 1920 : values.boxWidth; } },
            clientHeight: { get: function () { return values.boxHeight === undefined ? 1080 : values.boxHeight; } }
        });
        (values.parent || doc.getElementById("hero")).appendChild(node);
        return node;
    }
    function step(delta) {
        clock += delta;
        var entry = Array.from(callbacks.entries())[0];
        assert(entry, "Expected exactly bounded scheduled work");
        callbacks.delete(entry[0]);
        entry[1](clock);
    }
    return {
        api: api, image: image, doc: doc, config: config, calls: calls, statuses: statuses, errors: errors,
        frames: callbacks, timers: timers, history: history, live: live, resize: resize, step: step,
        allocations: function () { return allocations; }, contexts: function () { return contexts; },
        canvas: function () { return canvas; }, peakTextures: function () { return peakTextures; },
        lose: function () { lost = true; live.clear(); canvas.dispatchEvent(new dom.window.Event("webglcontextlost", { cancelable: true })); },
        restored: function (node) { node.dispatchEvent(new dom.window.Event("webglcontextrestored")); }
    };
}
function check(fn) { fn(); checks += 1; }
function clean(f) {
    f.api.dispose();
    assert.strictEqual(f.live.size, 0);
    assert.strictEqual(f.frames.size, 0);
    assert.strictEqual(f.timers.size, 0);
    assert.strictEqual(f.resize.size, 0);
    assert.strictEqual(f.doc.querySelectorAll("canvas").length, 0);
}
function lastUniform(f, name) {
    return f.calls.filter(function (row) { return row[0] === "uniform4fv" && row[1] === name; }).slice(-1)[0][2];
}

check(function () {
    var f = fixture(), image = f.image();
    var before = image.outerHTML;
    assert.deepStrictEqual(f.api.status(), { requested: false, backend: "compatibility", reason: "disabled", renderer: null });
    f.api.present(image);
    f.api.setEnabled(false);
    assert.strictEqual(f.allocations(), 0);
    assert.strictEqual(f.contexts(), 0);
    assert.strictEqual(image.outerHTML, before);
    clean(f);
});
check(function () {
    var f = fixture({ assertVisibleAtDraw: true }), image = f.image({ alt: "Backdrop description" });
    image.style.setProperty("opacity", "0.75", "important");
    f.api.setEnabled(true);
    assert.strictEqual(f.allocations(), 0, "Enabling is lazy until decoded artwork is present");
    f.api.present(image);
    assert.strictEqual(f.api.status().backend, "webgl");
    assert.strictEqual(f.contexts(), 1);
    assert.strictEqual(f.calls.filter(function (row) { return row[0] === "texImage2D"; }).length, 1);
    assert.strictEqual(f.calls.filter(function (row) { return row[0] === "drawArrays"; }).length, 1);
    assert.strictEqual(f.canvas().nextSibling, image);
    assert.strictEqual(f.canvas().getAttribute("aria-hidden"), "true");
    assert.strictEqual(image.alt, "Backdrop description");
    assert.strictEqual(image.style.opacity, "0");
    assert.strictEqual(f.frames.size, 0, "A settled first backdrop must not animate forever");
    f.api.clear();
    assert.strictEqual(image.style.opacity, "0.75");
    assert.strictEqual(image.style.getPropertyPriority("opacity"), "important");
    clean(f);
});
check(function () {
    var f = fixture(), image = f.image({ width: 2000, height: 500, boxWidth: 1000, boxHeight: 1000 });
    f.api.setEnabled(true);
    f.api.present(image);
    assert.deepStrictEqual(lastUniform(f, "afterCover"), [0.375, 0, 0.25, 1], "Cover crops the wide texture, not the canvas");
    var portrait = f.image({ width: 500, height: 1000, boxWidth: 1600, boxHeight: 900 });
    f.api.present(portrait);
    assert.deepStrictEqual(lastUniform(f, "afterCover"), [0, 0.359375, 1, 0.28125]);
    clean(f);
});
check(function () {
    var f = fixture(), first = f.image(), next = f.image();
    f.api.setEnabled(true);
    f.api.present(first);
    first.parentNode.removeChild(first);
    f.api.present(next);
    assert.strictEqual(first.style.opacity, "", "Detached replaced originals are still restored");
    assert.strictEqual(f.frames.size, 1);
    assert.strictEqual(f.timers.size, 1);
    f.step(90);
    assert(f.calls.some(function (row) { return row[0] === "uniform1f" && row[2] === 0.5; }));
    f.step(90);
    assert.strictEqual(f.frames.size, 0);
    assert.strictEqual(f.timers.size, 0);
    assert.strictEqual(Array.from(f.live).filter(function (row) { return row.kind === "texture"; }).length, 1);
    assert.strictEqual(f.peakTextures(), 2);
    clean(f);
});
check(function () {
    var f = fixture();
    f.api.setEnabled(true);
    f.api.present(f.image());
    for (var i = 0; i < 12; i += 1) { f.api.present(f.image()); }
    assert.strictEqual(f.contexts(), 1, "Repeated Home replacements share one context");
    assert.strictEqual(f.peakTextures(), 2, "Interrupted fades cannot allocate a third texture");
    f.step(180);
    assert.strictEqual(f.frames.size, 0);
    clean(f);
});
check(function () {
    ["noContext", "shaderFailure", "linkFailure", "noAttribute", "noUniform", "uploadFailure", "uploadError", "drawError",
        "nullTexture", "nullShader", "nullProgram", "nullBuffer"].forEach(function (failure) {
        var options = {};
        options[failure] = true;
        var f = fixture(options), image = f.image();
        f.api.setEnabled(true);
        f.api.present(image);
        assert.strictEqual(f.api.status().backend, "compatibility", failure);
        assert.strictEqual(image.style.opacity, "", "Fallback happens before hiding: " + failure);
        assert.strictEqual(f.errors.length, 1);
        assert(!/blob:|private|https?:/.test(f.errors[0].message), "Never expose source or driver exception text");
        assert.strictEqual(typeof f.api.status().reason, "string");
        clean(f);
    });
});
check(function () {
    ["Google SwiftShader", "llvmpipe", "softpipe", "lavapipe", "Software Rasterizer", "Microsoft Basic Render Driver"].forEach(function (driver) {
        var f = fixture({ renderer: driver }), image = f.image();
        f.api.setEnabled(true);
        f.api.present(image);
        assert.strictEqual(f.api.status().reason, "software-renderer");
        assert.strictEqual(image.style.opacity, "");
        assert.strictEqual(f.calls.filter(function (row) { return row[0] === "texImage2D"; }).length, 0);
        f.api.present(f.image());
        assert.strictEqual(f.contexts(), 1, "Fallback stays sticky until an explicit retry");
        f.config.renderer = "Mali-G51";
        f.api.setEnabled(true);
        assert.strictEqual(f.api.status().backend, "webgl");
        assert.strictEqual(f.contexts(), 2);
        clean(f);
    });
});
check(function () {
    var f = fixture({ noDebug: true });
    f.api.setEnabled(true);
    f.api.present(f.image());
    assert.strictEqual(f.api.status().backend, "webgl", "Lack of debug extension is not a model denylist");
    clean(f);
});
check(function () {
    var f = fixture(), image = f.image({ width: 4096, height: 513 });
    f.api.setEnabled(true);
    f.api.present(image);
    assert.strictEqual(f.api.status().reason, "texture-budget");
    assert.strictEqual(f.contexts(), 0, "Texture memory bounds are enforced before GPU allocation");
    clean(f);
    f = fixture({ maxTexture: 1024 });
    f.api.setEnabled(true);
    f.api.present(f.image());
    assert.strictEqual(f.api.status().reason, "texture-budget");
    clean(f);
    [NaN, 0, 1].forEach(function (units) {
        var limited = fixture({ units: units });
        limited.api.setEnabled(true);
        limited.api.present(limited.image());
        assert.strictEqual(limited.api.status().reason, "texture-budget");
        clean(limited);
    });
});
check(function () {
    var f = fixture();
    f.api.setEnabled(true);
    f.api.present(f.image({ boxWidth: 3840, boxHeight: 2160 }));
    assert(f.canvas().width <= 2048 && f.canvas().height <= 2048);
    assert(f.canvas().width * f.canvas().height <= 2097152);
    clean(f);
    f = fixture();
    f.api.setEnabled(true);
    f.api.present(f.image({ boxWidth: 0 }));
    assert.strictEqual(f.api.status().reason, "layout-budget");
    clean(f);
});
check(function () {
    var f = fixture(), image = f.image();
    f.api.setEnabled(true);
    f.api.present(image);
    f.api.present(image);
    assert.strictEqual(f.peakTextures(), 1, "Re-presenting the same decoded Blob does not allocate another texture");
    assert.strictEqual(f.frames.size, 0);
    f.api.present(f.image());
    var oldCanvas = f.canvas();
    f.lose();
    assert.strictEqual(image.style.opacity, "");
    assert.strictEqual(f.api.status().reason, "context-lost");
    assert.strictEqual(f.errors.length, 1);
    assert.strictEqual(f.frames.size, 0);
    assert.strictEqual(f.timers.size, 0);
    f.restored(oldCanvas);
    assert.strictEqual(f.api.status().backend, "compatibility", "Restoration of a released canvas cannot resurrect it");
    f.api.setEnabled(true);
    assert.strictEqual(f.api.status().backend, "webgl", "Explicit retry uses a fresh context");
    assert.strictEqual(f.contexts(), 2);
    clean(f);
});
check(function () {
    var f = fixture();
    f.api.setEnabled(true);
    f.api.present(f.image());
    var next = f.image();
    f.api.present(next);
    var count = 0;
    while (f.frames.size) { f.step(0); count += 1; assert(count <= 32); }
    assert.strictEqual(f.api.status().reason, "frame-budget");
    assert.strictEqual(next.style.opacity, "");
    clean(f);
    f = fixture();
    f.api.setEnabled(true);
    f.api.present(f.image());
    f.api.present(f.image());
    var expired = Array.from(f.timers.entries())[0];
    f.timers.delete(expired[0]);
    expired[1]();
    assert.strictEqual(f.api.status().reason, "frame-budget", "A missing RAF has a separate finite deadline");
    clean(f);
});
check(function () {
    var f = fixture();
    f.api.setEnabled(true);
    f.api.present(f.image());
    f.api.present(f.image());
    var stale = f.history[0];
    f.api.clear();
    f.api.present(f.image());
    f.api.present(f.image());
    stale();
    assert.strictEqual(f.frames.size, 1, "Cancelled old callbacks do not clobber current frame ownership");
    clean(f);
});
check(function () {
    var f = fixture(), first = f.image();
    f.api.setEnabled(true);
    f.api.present(first);
    var other = f.doc.createElement("section");
    f.doc.body.appendChild(other);
    f.api.present(f.image({ parent: other, className: "detail-backdrop detail-backdrop-ready" }));
    assert.strictEqual(first.style.opacity, "");
    assert.strictEqual(f.contexts(), 2, "Switching parents releases the old context, rather than adding one");
    assert.strictEqual(f.doc.querySelectorAll("canvas").length, 1);
    assert(f.canvas().className.includes("detail-backdrop-ready"));
    clean(f);
});
check(function () {
    var f = fixture(), image = f.image();
    f.api.setEnabled(true);
    f.api.present(image);
    Array.from(f.resize)[0]();
    assert.strictEqual(f.api.status().backend, "webgl");
    image.parentNode.removeChild(image);
    Array.from(f.resize)[0]();
    assert.strictEqual(f.api.status().reason, "detached-image");
    assert.strictEqual(image.style.opacity, "");
    clean(f);
});
check(function () {
    var f = fixture();
    assert.throws(function () { f.api.setEnabled("yes"); }, /boolean/);
    f.api.present(f.image({ complete: false }));
    assert.strictEqual(f.api.status().reason, "invalid-image");
    assert.strictEqual(f.errors.length, 1);
    f.api.clear();
    f.api.present(f.image({ src: "https://synthetic.invalid/not-allowed" }));
    assert.strictEqual(f.api.status().reason, "invalid-image");
    f.api.present(null);
    assert.strictEqual(f.errors.length, 3);
    var final = f.api.dispose(), count = f.statuses.length;
    assert.strictEqual(final.reason, "disposed");
    f.api.dispose();
    assert.strictEqual(f.statuses.length, count, "Repeated disposal cannot notify old callbacks");
    assert.throws(function () { f.api.present(f.image()); }, /disposed/);
    assert.throws(function () { graphics.create({ document: f.doc, onStatus: null }); }, /function/);
    assert.throws(function () { graphics.create({ document: null }); }, /document/);
    assert.throws(function () { graphics.create([]); }, /object/);
});
check(function () {
    var f = fixture(), first = f.image(), second = f.image();
    f.api.setEnabled(true);
    f.api.present(first);
    f.api.present(second);
    f.api.setEnabled(false);
    assert.strictEqual(first.style.opacity, "");
    assert.strictEqual(second.style.opacity, "");
    assert.strictEqual(f.frames.size, 0);
    assert.strictEqual(f.timers.size, 0);
    assert.strictEqual(f.api.status().requested, false);
    var count = f.contexts();
    f.api.present(second);
    assert.strictEqual(f.contexts(), count, "Disabled mode does not allocate after a previous GPU session");
    clean(f);
});
check(function () {
    var reenter = false;
    var f = fixture({ statusCallback: function (value, api) { if (reenter) { api.clear(); } } });
    f.api.setEnabled(true);
    reenter = true;
    assert.throws(function () { f.api.present(f.image()); }, /must not reenter/);
    assert.strictEqual(f.contexts(), 1);
    reenter = false;
    clean(f);
});
console.log("Tizen shared backdrop GPU/fallback/cover/lifecycle contracts: " + checks + " passed (host mocks only)");
