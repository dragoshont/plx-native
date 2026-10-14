(function () {
    "use strict";
    var memory = {};
    var capture = { networkAttempts: 0, playbackAttempts: 0, calls: [], decodes: [], operation: "boot" };
    window.graphicsBenchmarkCapture = capture;
    function refuse() {
        capture.networkAttempts += 1;
        throw new Error("Account-free benchmark refuses all external networking.");
    }
    Object.defineProperty(window, "localStorage", { configurable: true, value: {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; },
        setItem: function (key, value) { memory[key] = String(value); },
        removeItem: function (key) { delete memory[key]; }
    } });
    window.fetch = refuse;
    window.XMLHttpRequest = refuse;
    window.WebSocket = refuse;
    window.EventSource = refuse;
    if (navigator.sendBeacon) { navigator.sendBeacon = refuse; }
    var source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    Object.defineProperty(HTMLImageElement.prototype, "src", {
        configurable: source.configurable,
        enumerable: source.enumerable,
        get: source.get,
        set: function (value) {
            if (!/^(?:blob:|data:image\/)/.test(value)) { refuse(); }
            if (/^blob:/.test(value)) {
                var start = performance.now(), image = this, operation = capture.operation;
                var recorded = false;
                function done(event) {
                    if (recorded) { return; }
                    recorded = true;
                    image.removeEventListener("load", done, true);
                    image.removeEventListener("error", done, true);
                    capture.decodes.push({ operation: operation, durationMs: performance.now() - start,
                        result: event.type, width: image.naturalWidth, height: image.naturalHeight,
                        backdrop: /home-hero-art|detail-backdrop/.test(image.className) });
                }
                image.addEventListener("load", done, true);
                image.addEventListener("error", done, true);
            }
            source.set.call(this, value);
        }
    });
    var create = document.createElement;
    document.createElement = function (name) {
        var node = create.call(document, name);
        if (String(name).toLowerCase() === "canvas") {
            var get = node.getContext;
            node.getContext = function (kind, options) {
                var start = performance.now(), context = get.call(node, kind, options);
                capture.calls.push({ operation: capture.operation, method: "getContext",
                    durationMs: performance.now() - start, result: !!context });
                if (context && kind === "webgl") {
                    ["compileShader", "linkProgram", "texImage2D", "drawArrays"].forEach(function (method) {
                        var original = context[method];
                        context[method] = function () {
                            var began = performance.now();
                            try { return original.apply(context, arguments); }
                            finally {
                                capture.calls.push({ operation: capture.operation, method: method,
                                    durationMs: performance.now() - began });
                            }
                        };
                    });
                }
                return context;
            };
        }
        return node;
    };
}());
