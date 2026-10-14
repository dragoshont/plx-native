(function () {
    "use strict";
    var descriptor = window.graphicsBenchmarkDescriptor;
    if (!descriptor || descriptor.schema !== 1) { throw new Error("Missing staged benchmark descriptor."); }
    var request = null;
    var timer = null;
    var cancelled = false;
    var nextBlock = 0;
    var state = null;
    var navigationStarted = false;
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function metrics(block) {
        var values = {};
        Object.keys(descriptor.metrics).forEach(function (name) { values[name] = []; });
        block.operations.forEach(function (operation) {
            var prefix = operation.warmup ? "warmup_" : "";
            values[prefix + operation.kind + "_ready_ms"].push(operation.readyMs);
            if (!operation.warmup) {
                operation.calls.forEach(function (call) {
                    var name = { present: "present_ms", getContext: "context_ms", texImage2D: "upload_ms" }[call.method];
                    if (name) { values[name].push(call.durationMs); }
                });
            }
        });
        values.activation_ms.push(block.activation.readyMs);
        values.navigation_dispatch_ms = block.navigation.dispatchMs.slice();
        values.callback_interval_ms = block.navigation.callbackIntervals.slice();
        values.settled_callback_interval_ms = block.settledCallbackIntervals.slice();
        Object.keys(values).forEach(function (name) {
            if (!values[name].length) { values[name] = null; }
        });
        return values;
    }
    function advance() {
        timer = null;
        if (cancelled) { return; }
        try {
            var result = window.graphicsBenchmarkResult;
            if (result.phase === "failed" || result.errors.length) { throw new Error("Product workload failed."); }
            if (result.phase === "ready") {
                var block = result.blocks[request.block];
                if (!block) {
                    window.graphicsBenchmarkBlock(request.block, request.mode === "on");
                } else if (!navigationStarted) {
                    navigationStarted = true;
                    window.graphicsBenchmarkNavigation(request.block);
                } else if (block.settledCallbackIntervals) {
                    state = { id: request.id, state: "complete", metrics: metrics(block) };
                    nextBlock += 1;
                    return;
                }
            }
            timer = window.setTimeout(advance, 10);
        } catch (error) {
            state = { id: request.id, state: "error" };
            window.graphicsBenchmarkCancel();
        }
    }
    window.__tvBenchmark = {
        describe: function () { return clone(descriptor); },
        begin: function (value) {
            if (cancelled || !value || typeof value.id !== "string" || value.block !== nextBlock ||
                    value.block < 0 || value.block > 3 || value.phase !== "sample" || value.index !== 0 ||
                    value.mode !== (value.block === 1 || value.block === 2 ? "on" : "off") ||
                    state && state.state !== "complete") {
                throw new Error("Plx adapter requires four ABBA blocks with warmup=0 and samples=1.");
            }
            request = clone(value);
            state = { id: request.id, state: "pending" };
            navigationStarted = false;
            if (window.graphicsBenchmarkResult.phase === "idle") { window.graphicsBenchmarkConnect(); }
            timer = window.setTimeout(advance, 0);
            return true;
        },
        poll: function (id) {
            if (!state || id !== state.id) { throw new Error("Unknown benchmark request."); }
            return clone(state);
        },
        cancel: function () {
            if (timer !== null) { window.clearTimeout(timer); timer = null; }
            cancelled = true;
            if (request) { state = { id: request.id, state: "error" }; }
            return window.graphicsBenchmarkCancel();
        }
    };
}());
