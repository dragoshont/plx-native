(function (root) {
    "use strict";

    function isWord(value) {
        return typeof value === "number" && isFinite(value) &&
            Math.floor(value) === value && value >= 0 && value <= 4294967295;
    }

    function run(bytes, first, second) {
        if (!isWord(first) || !isWord(second)) {
            throw new Error("Rust probe challenge must contain two unsigned 32-bit words");
        }
        if (typeof WebAssembly !== "object") {
            throw new Error("This runtime does not support WebAssembly");
        }
        return WebAssembly.instantiate(bytes, {}).then(function (loaded) {
            var exports = loaded.instance.exports;
            if (typeof exports.probe_abi !== "function" ||
                typeof exports.probe_response !== "function") {
                throw new Error("Rust probe entry points are missing");
            }
            var abi = exports.probe_abi();
            if (abi !== 1) {
                throw new Error("Unsupported Rust probe ABI: " + abi);
            }
            return {
                runtime: "rust-wasm",
                abi: abi,
                challenge: [first, second],
                result: exports.probe_response(first, second) >>> 0
            };
        });
    }

    var bridge = { run: run };
    if (typeof module === "object" && module.exports) {
        module.exports = bridge;
    } else {
        root.RustWasmProbe = bridge;
    }
}(typeof window === "object" ? window : this));
