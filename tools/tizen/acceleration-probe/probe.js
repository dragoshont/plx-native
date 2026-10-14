(function () {
    "use strict";
    var track = document.getElementById("track");
    var viewport = document.getElementById("viewport");
    var motion = null;
    for (var row = 0; row < 12; row += 1) {
        var shelf = document.createElement("div");
        shelf.className = "probe-row";
        for (var card = 0; card < 8; card += 1) {
            var tile = document.createElement("div");
            tile.className = "probe-card";
            tile.textContent = "Synthetic " + row + ":" + card;
            shelf.appendChild(tile);
        }
        track.appendChild(shelf);
    }
    function graphics() {
        var canvas = document.getElementById("gpu");
        var gl = canvas.getContext("webgl", { antialias: false });
        if (!gl) { throw new Error("WebGL context unavailable"); }
        function shader(type, source) {
            var result = gl.createShader(type);
            gl.shaderSource(result, source);
            gl.compileShader(result);
            if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
                var message = gl.getShaderInfoLog(result);
                gl.deleteShader(result);
                throw new Error("Shader compilation failed: " + message);
            }
            return result;
        }
        var vertex = null;
        var fragment = null;
        var program = null;
        var buffer = null;
        try {
            vertex = shader(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}");
            fragment = shader(gl.FRAGMENT_SHADER, "precision mediump float;void main(){gl_FragColor=vec4(.25,.5,.75,1.);}");
            program = gl.createProgram();
            gl.attachShader(program, vertex);
            gl.attachShader(program, fragment);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error("Program link failed: " + gl.getProgramInfoLog(program));
            }
            gl.useProgram(program);
            buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            var location = gl.getAttribLocation(program, "p");
            gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(location);
            gl.viewport(0, 0, 8, 8);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            var pixel = new Uint8Array(4);
            gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            var error = gl.getError();
            if (error !== gl.NO_ERROR || Math.abs(pixel[0] - 64) > 1 ||
                    Math.abs(pixel[1] - 128) > 1 || Math.abs(pixel[2] - 191) > 1 || pixel[3] !== 255) {
                throw new Error("Rendered pixel mismatch: " + Array.prototype.join.call(pixel, ",") + "; GL error " + error);
            }
            var debug = gl.getExtension("WEBGL_debug_renderer_info");
            return { pixel: Array.prototype.slice.call(pixel), glError: error,
                vendor: gl.getParameter(gl.VENDOR), renderer: gl.getParameter(gl.RENDERER),
                unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
                unmaskedRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
                version: gl.getParameter(gl.VERSION) };
        } finally {
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.useProgram(null);
            if (buffer) { gl.deleteBuffer(buffer); }
            if (program) { gl.deleteProgram(program); }
            if (vertex) { gl.deleteShader(vertex); }
            if (fragment) { gl.deleteShader(fragment); }
            var lose = gl.getExtension("WEBGL_lose_context");
            if (lose) { lose.loseContext(); }
        }
    }
    function startMotion(mode) {
        if (motion && !motion.done) { throw new Error("A motion trial is still running"); }
        if (mode !== "transform" && mode !== "scroll") { throw new Error("Unknown trial"); }
        viewport.scrollTop = 0;
        track.style.webkitTransform = track.style.transform = "translate3d(0,0,0)";
        motion = { mode: mode, frames: 0, done: false, intervals: [], started: performance.now() };
        var previous = null;
        function frame(time) {
            if (previous !== null) { motion.intervals.push(time - previous); }
            previous = time;
            var y = (motion.frames % 60) * 8;
            if (mode === "transform") {
                track.style.webkitTransform = track.style.transform = "translate3d(0," + (-y) + "px,0)";
            } else { viewport.scrollTop = y; }
            motion.frames += 1;
            if (motion.frames < 120) { window.requestAnimationFrame(frame); }
            else { motion.done = true; motion.elapsed = performance.now() - motion.started; }
        }
        window.requestAnimationFrame(frame);
        return mode;
    }
    window.accelerationProbe = {
        graphics: graphics,
        startMotion: startMotion,
        motion: function () { return motion; },
        identity: function () {
            var product = window.webapis && window.webapis.productinfo;
            return { userAgent: navigator.userAgent,
                model: product ? product.getModel() : null,
                firmware: product ? product.getFirmware() : null,
                avplayVersion: window.webapis && window.webapis.avplay ? window.webapis.avplay.getVersion() : null };
        }
    };
}());
