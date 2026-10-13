(function () {
    "use strict";
    var capture = window.graphicsBenchmarkCapture;
    var result = { phase: "idle", blocks: [], errors: [] };
    window.graphicsBenchmarkResult = result;
    function assert(value, message) { if (!value) { throw new Error(message); } }
    function find(pattern) {
        return Array.prototype.filter.call(document.querySelectorAll("button"), function (node) {
            return pattern.test(node.textContent) && !node.disabled;
        })[0];
    }
    function click(pattern) {
        var node = find(pattern);
        assert(node, "Missing synthetic control: " + String(pattern));
        node.focus();
        node.click();
    }
    function loaded(selector) {
        return new Promise(function (resolve, reject) {
            var until = performance.now() + 8000;
            function poll() {
                var image = document.querySelector(selector);
                if (image && image.getAttribute("data-artwork-state") === "loaded") { resolve(image); }
                else if (performance.now() >= until) { reject(new Error("Synthetic backdrop did not finish real decode.")); }
                else { setTimeout(poll, 5); }
            }
            poll();
        });
    }
    function frames(count) {
        return new Promise(function (resolve) {
            var gaps = [], before = null;
            function tick(time) {
                if (before !== null) { gaps.push(time - before); }
                before = time;
                if (--count > 0) { requestAnimationFrame(tick); }
                else { resolve(gaps); }
            }
            requestAnimationFrame(tick);
        });
    }
    function settings(enabled) {
        click(/^Account$/);
        click(/^Settings$/);
        var toggle = find(/^New graphics enhancements:/);
        assert(toggle, "Real post-connect Graphics setting not present.");
        if ((toggle.getAttribute("aria-pressed") === "true") !== enabled) { toggle.click(); }
        assert(find(/^New graphics enhancements:/).getAttribute("aria-pressed") === String(enabled),
            "Real Settings preference did not match requested mode.");
        click(/^Back$/);
        return loaded("img.home-hero-art");
    }
    function operation(block, kind, index, action, selector) {
        var name = block.order + ":" + kind + ":" + index;
        capture.operation = name;
        var start = performance.now(), beforeCalls = capture.calls.length, beforeDecodes = capture.decodes.length;
        action();
        return loaded(selector).then(function () {
            var ready = performance.now() - start;
            return frames(2).then(function (gaps) {
                block.operations.push({ kind: kind, index: index, label: name,
                    warmup: index === 0, readyMs: ready, throughTwoCallbacksMs: performance.now() - start,
                    calls: capture.calls.slice(beforeCalls), decodes: capture.decodes.slice(beforeDecodes),
                    callbackIntervals: gaps });
            });
        });
    }
    function nav(block) {
        capture.operation = block.order + ":navigation";
        var gaps = [], durations = [], before = null, count = 0;
        var card = document.querySelector(".shelf-row .media-card");
        assert(card, "Synthetic shelf is missing real product cards.");
        card.focus();
        return new Promise(function (resolve) {
            function step(time) {
                if (before !== null) { gaps.push(time - before); }
                before = time;
                var code = count % 2 ? 37 : 39, start = performance.now();
                var event = new Event("keydown", { bubbles: true, cancelable: true });
                Object.defineProperty(event, "keyCode", { value: code });
                Object.defineProperty(event, "which", { value: code });
                document.dispatchEvent(event);
                durations.push(performance.now() - start);
                count += 1;
                if (count < 32) { requestAnimationFrame(step); }
                else { block.navigation = { events: count, dispatchMs: durations, callbackIntervals: gaps }; resolve(); }
            }
            requestAnimationFrame(step);
        });
    }
    window.graphicsBenchmarkConnect = function () {
        assert(result.phase === "idle", "Benchmark connection already started.");
        result.phase = "connecting";
        document.querySelector('input[name="server"]').value = "https://benchmark.synthetic.invalid";
        click(/^Connect$/);
        loaded("img.home-hero-art").then(function () {
            result.phase = "ready";
        }).catch(function (error) { result.phase = "failed"; result.errors.push(error.message); });
        return "connecting";
    };
    window.graphicsBenchmarkBlock = function (order, enabled) {
        assert(result.phase === "ready", "Previous benchmark operation is not complete.");
        assert(typeof enabled === "boolean" && order >= 0 && order < 4, "Invalid ABBA block.");
        result.phase = "running";
        var block = { order: order, enabled: enabled, operations: [] };
        result.blocks.push(block);
        capture.operation = order + ":activation";
        var start = performance.now(), before = capture.calls.length, decodeBefore = capture.decodes.length;
        settings(enabled).then(function () {
            block.activation = { readyMs: performance.now() - start, calls: capture.calls.slice(before),
                decodes: capture.decodes.slice(decodeBefore) };
            var work = Promise.resolve();
            for (var i = 0; i < 7; i += 1) {
                (function (index) {
                    work = work.then(function () {
                        return operation(block, "featured", index, function () { click(/^Next featured title$/); }, "img.home-hero-art");
                    });
                }(i));
            }
            for (var j = 0; j < 7; j += 1) {
                (function (index) {
                    work = work.then(function () {
                        return operation(block, "detail", index, function () { click(/^Open details$/); }, "img.detail-backdrop");
                    }).then(function () {
                        capture.operation = order + ":home-return:" + index;
                        var back = new Event("keydown", { bubbles: true, cancelable: true });
                        Object.defineProperty(back, "keyCode", { value: 10009 });
                        document.dispatchEvent(back);
                        return loaded("img.home-hero-art");
                    });
                }(j));
            }
            return work;
        }).then(function () {
            assert(capture.networkAttempts === 0 && capture.playbackAttempts === 0, "Unsafe request/playback attempted.");
            assert(!document.getElementById("status").textContent.match(/unavailable here|Artwork unavailable/),
                "Optional backend or artwork failed; this block is not a performance success.");
            result.phase = "ready";
        }).catch(function (error) { result.phase = "failed"; result.errors.push(error.message); });
        return "started";
    };
    window.graphicsBenchmarkNavigation = function (order) {
        assert(result.phase === "ready", "Image work is not settled.");
        var block = result.blocks[order];
        assert(block && block.order === order && !block.navigation, "Invalid navigation block.");
        result.phase = "running";
        nav(block).then(function () {
            capture.operation = order + ":settled";
            return frames(16).then(function (gaps) { block.settledCallbackIntervals = gaps; });
        }).then(function () {
            assert(capture.networkAttempts === 0 && capture.playbackAttempts === 0, "Unsafe request/playback attempted.");
            result.phase = "ready";
        }).catch(function (error) { result.phase = "failed"; result.errors.push(error.message); });
        return "started";
    };
}());
