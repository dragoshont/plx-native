(function (root, factory) {
    var api = factory(root);
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexGraphics = api; }
}(typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : this, function (root) {
    "use strict";

    var MAX_PIXELS = 2097152;
    var MAX_TEXTURE_EDGE = 4096;
    var MAX_CANVAS_EDGE = 2048;
    var FADE_MS = 180;
    var MAX_FRAMES = 32;
    var FRAME_DEADLINE_MS = 1000;
    var VERTEX = "attribute vec2 position;varying vec2 uv;void main(){uv=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}";
    var FRAGMENT = "precision mediump float;varying vec2 uv;uniform sampler2D beforeImage;uniform sampler2D afterImage;" +
        "uniform vec4 beforeCover;uniform vec4 afterCover;uniform float blend;" +
        "void main(){gl_FragColor=mix(texture2D(beforeImage,beforeCover.xy+uv*beforeCover.zw)," +
        "texture2D(afterImage,afterCover.xy+uv*afterCover.zw),blend);}";

    function positive(value) { return typeof value === "number" && isFinite(value) && value > 0; }
    function fault(reason) {
        var error = new Error("Optional GPU backdrop unavailable; using the compatibility backdrop.");
        error.code = reason;
        error.graphicsFault = true;
        return error;
    }
    function cover(width, height, boxWidth, boxHeight) {
        var x = Math.min(1, boxWidth * height / (boxHeight * width));
        var y = Math.min(1, boxHeight * width / (boxWidth * height));
        return [0.5 * (1 - x), 0.5 * (1 - y), x, y];
    }
    function create(options) {
        options = options === undefined ? {} : options;
        if (!options || typeof options !== "object" || Array.isArray(options)) {
            throw new TypeError("Graphics options must be an object.");
        }
        var doc = options.document === undefined ? root.document : options.document;
        if (!doc || !doc.createElement || !doc.documentElement) { throw new TypeError("Graphics requires a document."); }
        var view = doc.defaultView || root;
        function callback(name, fallback) {
            var value = options[name] === undefined ? fallback : options[name];
            if (typeof value !== "function") { throw new TypeError("Graphics " + name + " must be a function."); }
            return value;
        }
        var raf = callback("requestAnimationFrame", function (fn) { return view.requestAnimationFrame(fn); });
        var cancelRaf = callback("cancelAnimationFrame", function (id) { view.cancelAnimationFrame(id); });
        var now = callback("now", function () { return view.performance.now(); });
        var delay = callback("setTimeout", function (fn, ms) { return view.setTimeout(fn, ms); });
        var cancelDelay = callback("clearTimeout", function (id) { view.clearTimeout(id); });
        var onStatus = callback("onStatus", function () {});
        var onError = callback("onError", function () {});
        var requested = false, disposed = false, notifying = false, blocked = false;
        var backend = "compatibility", reason = "disabled", renderer = null;
        var canvas = null, gl = null, parent = null, program = null, buffer = null;
        var vertex = null, fragment = null, locations = null;
        var current = null, previous = null, lastImage = null, hidden = null;
        var frame = null, deadline = null, generation = 0, started = 0, frames = 0;
        var boxWidth = 0, boxHeight = 0;

        function status() { return { requested: requested, backend: backend, reason: reason, renderer: renderer }; }
        function admit() {
            if (notifying) { throw new Error("Graphics callbacks must not reenter the backend."); }
            if (disposed) { throw new Error("Graphics backend is disposed."); }
        }
        function notify(error) {
            notifying = true;
            try {
                onStatus(status());
                if (error) { onError(error); }
            } finally { notifying = false; }
        }
        function restore() {
            if (hidden) {
                if (hidden.opacity) { hidden.image.style.setProperty("opacity", hidden.opacity, hidden.priority); }
                else { hidden.image.style.removeProperty("opacity"); }
                hidden = null;
            }
        }
        function stopFrames() {
            generation += 1;
            if (frame !== null) { cancelRaf(frame); frame = null; }
            if (deadline !== null) { cancelDelay(deadline); deadline = null; }
        }
        function deleteTexture(value) { if (value && gl && !gl.isContextLost()) { gl.deleteTexture(value.texture); } }
        function release() {
            stopFrames();
            restore();
            if (canvas) {
                canvas.removeEventListener("webglcontextlost", lost);
                if (view.removeEventListener) { view.removeEventListener("resize", resized); }
            }
            if (gl && !gl.isContextLost()) {
                deleteTexture(previous);
                deleteTexture(current);
                if (buffer) { gl.deleteBuffer(buffer); }
                if (program) { gl.deleteProgram(program); }
                if (vertex) { gl.deleteShader(vertex); }
                if (fragment) { gl.deleteShader(fragment); }
                var lose = gl.getExtension("WEBGL_lose_context");
                if (lose) { lose.loseContext(); }
            }
            if (canvas && canvas.parentNode) { canvas.parentNode.removeChild(canvas); }
            canvas = gl = parent = program = buffer = vertex = fragment = locations = null;
            current = previous = null;
            backend = "compatibility";
        }
        function fallback(error) {
            release();
            blocked = true;
            reason = error.graphicsFault === true ? error.code : "webgl-error";
            return fault(reason);
        }
        function lost(event) {
            event.preventDefault();
            var error = fallback(fault("context-lost"));
            notify(error);
        }
        function validate(image) {
            if (!image || image.nodeType !== 1 || image.tagName !== "IMG" || image.ownerDocument !== doc ||
                    !doc.documentElement.contains(image) || !image.complete ||
                    !positive(image.naturalWidth) || !positive(image.naturalHeight) ||
                    !/^blob:/.test(image.currentSrc || image.src || "")) {
                throw fault("invalid-image");
            }
            if (image.naturalWidth > MAX_TEXTURE_EDGE || image.naturalHeight > MAX_TEXTURE_EDGE ||
                    image.naturalWidth * image.naturalHeight > MAX_PIXELS) { throw fault("texture-budget"); }
        }
        function measure(image) {
            boxWidth = image.clientWidth;
            boxHeight = image.clientHeight;
            if (!positive(boxWidth) || !positive(boxHeight) || boxWidth > 16384 || boxHeight > 16384) {
                throw fault("layout-budget");
            }
            var scale = Math.min(1, MAX_CANVAS_EDGE / boxWidth, MAX_CANVAS_EDGE / boxHeight,
                Math.sqrt(MAX_PIXELS / (boxWidth * boxHeight)));
            var width = Math.max(1, Math.floor(boxWidth * scale));
            var height = Math.max(1, Math.floor(boxHeight * scale));
            if (canvas.width !== width) { canvas.width = width; }
            if (canvas.height !== height) { canvas.height = height; }
        }
        function shader(type, source) {
            var value = gl.createShader(type);
            if (!value) { throw fault("shader"); }
            if (type === gl.VERTEX_SHADER) { vertex = value; } else { fragment = value; }
            gl.shaderSource(value, source);
            gl.compileShader(value);
            if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) { throw fault("shader"); }
            return value;
        }
        function initialize(image) {
            parent = image.parentNode;
            canvas = doc.createElement("canvas");
            canvas.className = image.className + " plex-graphics-backdrop";
            canvas.style.cssText = image.style.cssText;
            canvas.style.pointerEvents = "none";
            canvas.setAttribute("aria-hidden", "true");
            measure(image);
            gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false,
                antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
            if (!gl) { throw fault("unsupported"); }
            canvas.addEventListener("webglcontextlost", lost);
            var debug = gl.getExtension("WEBGL_debug_renderer_info");
            var driver = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
            renderer = typeof driver === "string" ? driver.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 160) : null;
            if (renderer && /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i.test(renderer)) {
                throw fault("software-renderer");
            }
            var units = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
            if (!positive(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || !positive(units) || units < 2) {
                throw fault("texture-budget");
            }
            program = gl.createProgram();
            if (!program) { throw fault("shader"); }
            gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
            gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { throw fault("shader"); }
            buffer = gl.createBuffer();
            if (!buffer) { throw fault("initialization"); }
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            gl.useProgram(program);
            var attribute = gl.getAttribLocation(program, "position");
            if (attribute < 0) { throw fault("shader"); }
            gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(attribute);
            locations = {};
            ["beforeImage", "afterImage", "beforeCover", "afterCover", "blend"].forEach(function (name) {
                locations[name] = gl.getUniformLocation(program, name);
                if (locations[name] === null) { throw fault("shader"); }
            });
            gl.disable(gl.BLEND);
            gl.disable(gl.DEPTH_TEST);
            parent.insertBefore(canvas, image);
            if (view.addEventListener) { view.addEventListener("resize", resized); }
        }
        function draw(blend) {
            if (gl.isContextLost()) { throw fault("context-lost"); }
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.useProgram(program);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, (previous || current).texture);
            gl.uniform1i(locations.beforeImage, 0);
            gl.uniform4fv(locations.beforeCover, cover((previous || current).width, (previous || current).height, boxWidth, boxHeight));
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, current.texture);
            gl.uniform1i(locations.afterImage, 1);
            gl.uniform4fv(locations.afterCover, cover(current.width, current.height, boxWidth, boxHeight));
            gl.uniform1f(locations.blend, blend);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            if (gl.getError() !== gl.NO_ERROR) { throw fault("draw"); }
        }
        function settle() {
            stopFrames();
            if (current) { draw(1); }
            deleteTexture(previous);
            previous = null;
        }
        function resized() {
            if (!current || disposed || blocked) { return; }
            var error = null;
            try {
                if (!doc.documentElement.contains(lastImage)) { throw fault("detached-image"); }
                measure(lastImage);
                settle();
            } catch (failure) { error = fallback(failure); }
            if (error) { notify(error); }
        }
        function tick(own) {
            if (own !== generation || disposed || !current) { return; }
            frame = null;
            var error = null;
            try {
                if (!doc.documentElement.contains(lastImage)) { throw fault("detached-image"); }
                var elapsed = now() - started;
                if (!isFinite(elapsed) || elapsed < 0) { throw fault("clock"); }
                frames += 1;
                if (elapsed > FRAME_DEADLINE_MS || frames >= MAX_FRAMES && elapsed < FADE_MS) {
                    throw fault("frame-budget");
                }
                draw(Math.min(1, elapsed / FADE_MS));
                if (elapsed >= FADE_MS) {
                    stopFrames();
                    deleteTexture(previous);
                    previous = null;
                } else { frame = raf(function () { tick(own); }); }
            } catch (failure) { error = fallback(failure); }
            if (error) { notify(error); }
        }
        function render(image) {
            if (parent && parent !== image.parentNode) { release(); }
            if (!gl) { initialize(image); }
            measure(image);
            if (image.naturalWidth > gl.getParameter(gl.MAX_TEXTURE_SIZE) ||
                    image.naturalHeight > gl.getParameter(gl.MAX_TEXTURE_SIZE)) { throw fault("texture-budget"); }
            if (current && lastImage === image && current.source === (image.currentSrc || image.src)) {
                settle();
                return;
            }
            if (current) { settle(); }
            restore();
            canvas.className = image.className + " plex-graphics-backdrop";
            canvas.style.cssText = image.style.cssText;
            canvas.style.pointerEvents = "none";
            previous = current;
            current = { texture: gl.createTexture(), width: image.naturalWidth, height: image.naturalHeight,
                source: image.currentSrc || image.src };
            if (!current.texture) { throw fault("upload"); }
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, current.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            if (gl.getError() !== gl.NO_ERROR) { throw fault("upload"); }
            draw(previous ? 0 : 1);
            hidden = { image: image, opacity: image.style.getPropertyValue("opacity"),
                priority: image.style.getPropertyPriority("opacity") };
            image.style.setProperty("opacity", "0", "important");
            lastImage = image;
            backend = "webgl";
            reason = "active";
            if (previous) {
                started = now();
                if (!isFinite(started)) { throw fault("clock"); }
                frames = 0;
                var own = generation;
                frame = raf(function () { tick(own); });
                deadline = delay(function () {
                    if (own !== generation) { return; }
                    deadline = null;
                    notify(fallback(fault("frame-budget")));
                }, FRAME_DEADLINE_MS);
            }
        }
        function present(image) {
            admit();
            var error = null;
            try {
                validate(image);
                if (requested && !blocked) { render(image); }
                lastImage = image;
            } catch (failure) {
                error = fallback(failure);
                lastImage = image && image.nodeType === 1 ? image : null;
            }
            notify(error);
            return status();
        }
        function setEnabled(value) {
            admit();
            if (typeof value !== "boolean") { throw new TypeError("Graphics enabled must be a boolean."); }
            if (!value) {
                requested = false;
                blocked = false;
                release();
                renderer = null;
                reason = "disabled";
                notify();
                return status();
            }
            var retry = !requested || blocked;
            requested = true;
            blocked = false;
            if (retry && lastImage) { return present(lastImage); }
            if (!current) { reason = "awaiting-image"; }
            notify();
            return status();
        }
        function clear() {
            admit();
            release();
            lastImage = null;
            reason = requested ? "cleared" : "disabled";
            notify();
            return status();
        }
        function dispose() {
            if (notifying) { throw new Error("Graphics callbacks must not reenter the backend."); }
            if (disposed) { return status(); }
            release();
            lastImage = null;
            disposed = true;
            reason = "disposed";
            try { notify(); } finally { onStatus = onError = function () {}; }
            return status();
        }
        return { setEnabled: setEnabled, present: present, clear: clear, status: status, dispose: dispose };
    }
    return { create: create };
}));
