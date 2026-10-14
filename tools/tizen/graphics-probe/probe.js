(function () {
    "use strict";
    var SMALL = "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAYAAACzzX7wAAAAEklEQVR4nGNwaNj/Hx9moL0CAGlwT8GsVhGBAAAAAElFTkSuQmCC";
    var WIDE = "iVBORw0KGgoAAAANSUhEUgAAEAEAAAABCAYAAACx4wBCAAAALUlEQVR4nO3DQQ0AAAgEIKMZzWYXTWP4gY3qyaqqqqqqqqqqqqqqqqqqqqqqr/D6a45MhArDAHAAAAAElFTkSuQmCC";
    var receipt = { phase: "idle", cases: {}, statuses: [], errors: [], pixels: [],
        canvasAllocations: 0, contextRequests: 0, sourceKind: "same-document Blob PNG" };
    var active = null, lastGL = null, lastCanvas = null, urls = [], images = [];
    var originalCreate = document.createElement;
    var tag = "";
    window.graphicsMatrixReceipt = receipt;
    function assertion(value, message) { if (!value) { throw new Error(message); } }
    function opacity(image) { return [image.style.getPropertyValue("opacity"), image.style.getPropertyPriority("opacity")]; }
    function sameOpacity(image, before) { var current = opacity(image); return current[0] === before[0] && current[1] === before[1]; }
    function canCount() { return document.querySelectorAll(".plex-graphics-backdrop").length; }
    function instrument() {
        document.createElement = function (name) {
            var node = originalCreate.call(document, name);
            if (String(name).toLowerCase() === "canvas") {
                receipt.canvasAllocations += 1;
                lastCanvas = node;
                var get = node.getContext;
                node.getContext = function (kind, options) {
                    receipt.contextRequests += 1;
                    var gl = get.call(node, kind, options);
                    if (gl) {
                        lastGL = gl;
                        var draw = gl.drawArrays;
                        var getError = gl.getError, pendingError = 0;
                        gl.getError = function () {
                            var error = pendingError;
                            pendingError = 0;
                            return error || getError.call(gl);
                        };
                        gl.drawArrays = function (mode, first, count) {
                            draw.call(gl, mode, first, count);
                            var pixel = new Uint8Array(4);
                            gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2),
                                1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                            var error = getError.call(gl);
                            pendingError = error;
                            receipt.pixels.push({ phase: tag, rgba: Array.prototype.slice.call(pixel),
                                glError: error, buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] });
                        };
                    }
                    return gl;
                };
            }
            return node;
        };
    }
    function decode(encoded) {
        return new Promise(function (resolve, reject) {
            var binary = atob(encoded), bytes = new Uint8Array(binary.length);
            for (var index = 0; index < binary.length; index += 1) { bytes[index] = binary.charCodeAt(index); }
            var image = originalCreate.call(document, "img");
            image.className = "home-hero-art";
            image.alt = "Original synthetic backdrop retained";
            images.push(image);
            var url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
            urls.push(url);
            var timer = setTimeout(function () {
                image.onload = image.onerror = null;
                reject(new Error("Synthetic image decode deadline exceeded"));
            }, 5000);
            image.onload = function () {
                clearTimeout(timer);
                image.onload = image.onerror = null;
                resolve(image);
            };
            image.onerror = function () {
                clearTimeout(timer);
                image.onload = image.onerror = null;
                reject(new Error("Synthetic image decode failed"));
            };
            document.getElementById("fixture").appendChild(image);
            image.src = url;
        });
    }
    function validPixel(phase) {
        var samples = receipt.pixels.filter(function (row) { return row.phase === phase; });
        assertion(samples.length > 0, "Active backend did not perform an observed draw");
        samples.forEach(function (row) {
            assertion(row.glError === 0 && Math.abs(row.rgba[0] - 64) <= 1 && Math.abs(row.rgba[1] - 128) <= 1 &&
                Math.abs(row.rgba[2] - 191) <= 1 && row.rgba[3] === 255, "Immediate GPU pixel validation failed");
        });
    }
    function waitLoss() {
        return new Promise(function (resolve, reject) {
            var until = performance.now() + 1500;
            function poll() {
                if (active.status().reason === "context-lost") { resolve(); }
                else if (performance.now() >= until) { reject(new Error("Standard context loss was not observed")); }
                else { setTimeout(poll, 20); }
            }
            poll();
        });
    }
    function identity() {
        var product = window.webapis && window.webapis.productinfo;
        var data = { userAgent: navigator.userAgent, protocol: location.protocol };
        if (product) { data.model = product.getModel(); data.firmware = product.getFirmware(); }
        return data;
    }
    window.graphicsMatrixStart = function () {
        assertion(receipt.phase === "idle", "This probe can only run once");
        receipt.phase = "running";
        receipt.identity = identity();
        instrument();
        var memory = null;
        var storage = {
            getItem: function () { return memory; },
            setItem: function (key, value) { memory = value; },
            removeItem: function () { memory = null; }
        };
        var prefs = PlexPreferences.load(storage);
        active = PlexGraphics.create({
            onStatus: function (value) { receipt.statuses.push(value); },
            onError: function (error) { receipt.errors.push({ code: error.code, message: error.message }); }
        });
        var image, before;
        decode(SMALL).then(function (decoded) {
            image = decoded;
            before = opacity(image);
            assertion(prefs.enhancedGraphics === false, "Preferences do not default to off");
            active.setEnabled(prefs.enhancedGraphics);
            active.present(image);
            assertion(receipt.canvasAllocations === 0 && receipt.contextRequests === 0 && canCount() === 0 &&
                sameOpacity(image, before), "Default-off allocated or changed original pixels");
            receipt.cases.defaultOff = { result: "PASS", status: active.status(), contexts: receipt.contextRequests };
            prefs.enhancedGraphics = true;
            PlexPreferences.save(storage, prefs);
            active.setEnabled(PlexPreferences.load(storage).enhancedGraphics);
            tag = "optIn";
            active.present(image);
            var state = active.status();
            if (state.backend === "webgl") {
                validPixel(tag);
                assertion(canCount() === 1 && image.style.opacity === "0", "GPU original/canvas ownership mismatch");
                receipt.cases.optIn = { result: "WEBGL", status: state, sameDocumentBlobUpload: true };
            } else {
                assertion(receipt.errors.length > 0 && sameOpacity(image, before) && canCount() === 0,
                    "Compatibility fallback was not explicit or did not restore the image");
                receipt.cases.optIn = { result: "COMPATIBILITY", status: state, sameDocumentBlobUpload: "unestablished" };
            }
            prefs.enhancedGraphics = false;
            PlexPreferences.save(storage, prefs);
            active.setEnabled(PlexPreferences.load(storage).enhancedGraphics);
            assertion(canCount() === 0 && sameOpacity(image, before) && active.status().backend === "compatibility",
                "Off-again did not restore original image and release canvas");
            receipt.cases.offAgain = { result: "PASS", status: active.status() };
            if (receipt.cases.optIn.result !== "WEBGL") {
                receipt.cases.contextLoss = { result: "SKIP", reason: "opt-in backend unavailable" };
                return null;
            }
            tag = "lossSetup";
            active.setEnabled(true);
            assertion(active.status().backend === "webgl", "A fresh enabled context failed");
            validPixel(tag);
            var lose = lastGL.getExtension("WEBGL_lose_context");
            if (!lose) {
                receipt.cases.contextLoss = { result: "SKIP", reason: "standard extension unavailable" };
                return null;
            }
            lose.loseContext();
            return waitLoss().then(function () {
                assertion(canCount() === 0 && sameOpacity(image, before), "Lost context did not restore original");
                var count = receipt.contextRequests;
                active.present(image);
                assertion(active.status().reason === "context-lost" && receipt.contextRequests === count,
                    "Context fallback was not sticky");
                receipt.cases.contextLoss = { result: "PASS", status: active.status() };
                tag = "retry";
                active.setEnabled(true);
                if (active.status().backend === "webgl") { validPixel(tag); }
                receipt.cases.explicitRetry = { result: active.status().backend === "webgl" ? "WEBGL" : "COMPATIBILITY",
                    status: active.status() };
            });
        }).then(function () {
            active.clear();
            active.setEnabled(false);
            return decode(WIDE);
        }).then(function (oversize) {
            var count = receipt.contextRequests;
            active.setEnabled(true);
            active.present(oversize);
            assertion(oversize.naturalWidth === 4097 && oversize.naturalHeight === 1 &&
                active.status().reason === "texture-budget" && active.status().backend === "compatibility" &&
                receipt.contextRequests === count && oversize.style.opacity !== "0" && canCount() === 0,
                "Known oversize edge was not rejected before GPU allocation");
            receipt.cases.oversize = { result: "PASS", dimensions: [oversize.naturalWidth, oversize.naturalHeight],
                decodedPixels: 4097, status: active.status() };
            active.dispose();
            assertion(canCount() === 0 && active.status().reason === "disposed", "Disposal did not release canvas");
            receipt.cases.dispose = { result: "PASS", status: active.status() };
            receipt.phase = "complete";
        }).catch(function (error) {
            receipt.phase = "failed";
            receipt.failure = String(error.message);
        }).then(function () {
            if (active) { active.dispose(); }
            document.createElement = originalCreate;
            images.forEach(function (item) { item.onload = item.onerror = null; item.removeAttribute("src"); });
            urls.forEach(function (url) { URL.revokeObjectURL(url); });
            lastGL = lastCanvas = null;
            receipt.fixtureReleased = true;
        });
        return "started";
    };
}());
