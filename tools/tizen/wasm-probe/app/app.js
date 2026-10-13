(function () {
    "use strict";
    var output = document.getElementById("result");
    var limit = 65536;

    function fail(error) {
        window.rustWasmReceipt = { status: "failed", error: String(error.message || error) };
        output.textContent = JSON.stringify(window.rustWasmReceipt);
        console.error(output.textContent);
    }

    function load() {
        if (typeof WebAssembly !== "object") {
            throw new Error("WebAssembly is unavailable; Samsung documents support from Tizen 5.5");
        }
        if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
            throw new Error("A secure fresh challenge cannot be generated");
        }
        var words = new Uint32Array(2);
        window.crypto.getRandomValues(words);
        var xhr = new XMLHttpRequest();
        var settled = false;
        function reject(message) {
            if (settled) { return; }
            settled = true;
            xhr.abort();
            fail(new Error(message));
        }
        xhr.open("GET", "probe.wasm", true);
        xhr.responseType = "arraybuffer";
        xhr.timeout = 10000;
        xhr.onprogress = function (event) {
            if (event.loaded > limit) { reject("Rust module exceeds 64 KiB"); }
        };
        xhr.onerror = function () { reject("Rust module could not be loaded"); };
        xhr.ontimeout = function () { reject("Rust module load exceeded 10 seconds"); };
        xhr.onabort = function () { reject("Rust module load was cancelled"); };
        xhr.onload = function () {
            if (settled) { return; }
            settled = true;
            if (xhr.status !== 200 && xhr.status !== 0) {
                fail(new Error("Rust module load returned HTTP " + xhr.status));
                return;
            }
            if (!xhr.response || xhr.response.byteLength === 0 || xhr.response.byteLength > limit) {
                fail(new Error("Rust module has an invalid size"));
                return;
            }
            try {
                window.RustWasmProbe.run(xhr.response, words[0], words[1]).then(function (receipt) {
                    receipt.status = "executed";
                    window.rustWasmReceipt = receipt;
                    output.textContent = JSON.stringify(receipt);
                    console.log(output.textContent);
                }, fail);
            } catch (error) {
                fail(error);
            }
        };
        xhr.send();
    }

    window.rustWasmReceipt = { status: "loading" };
    try { load(); } catch (error) { fail(error); }
}());
