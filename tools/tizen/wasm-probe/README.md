# Rust Wasm runtime probe

This is the browser-hosted comparison to the native/.NET Rust probe. It runs
compiled Rust through a thin JavaScript bridge; it is **not** the upstream UI,
a native ELF loader, or proof of Samsung device execution.

Samsung [documents WebAssembly from Tizen 5.5 (2020 models)](https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/webassembly.html).
Check the target's current platform and runtime capabilities, not just its model
year. This route does not apply to the observed 2017 Tizen 3.0 TV.

## Build and host execution

Use the installed nightly Rust compiler and its `wasm32-unknown-unknown` target.
If the build reports missing `core`, install that target with
`rustup target add --toolchain nightly wasm32-unknown-unknown`.
JavaScript tests reuse the existing `tests/tizen` Acorn dependency.

```sh
stage=$(mktemp -d)
cp tools/tizen/wasm-probe/app/* "$stage/"
PATH="$HOME/.cargo/bin:$PATH" sh tools/tizen/wasm-probe/build.sh "$stage/probe.wasm"
node tools/tizen/wasm-probe/test.js "$stage/probe.wasm"
```

Keep generated binaries and signed packages outside the checkout. The build
disables newer optional Wasm instructions; host execution still cannot establish
an older TV engine's compatibility.

## Device experiment

The staged app has disposable identity `PlxWasm001.Probe`, requires Tizen 5.5
and needs no account or network service. Sign with the applicable existing
Samsung developer profile; acquire the Samsung device lane and install only
this owned probe on an authorized target. A fresh crypto-generated challenge is
passed to the actual Rust export. JavaScript displays and retains the returned
result in `window.rustWasmReceipt`; it does not compute the response.

Use the official Tizen CLI to package the reviewed stage directly. The installed
`tizen-tv-builder` 0.1.0 package wrapper excludes `.wasm` from its staging
allowlist, so it would omit the executable module. Inspect the resulting WGT
and verify that `probe.wasm` matches the compiled artifact before installation.
Do not modify the installed toolkit to bypass this limitation.

Capture that object through an ordinary authorized Web Inspector session and
independently check the response against the packaged Rust source. Retain
source/package hashes, current firmware, challenge/result and cleanup evidence.
Installation or a launcher acknowledgement is not a Rust receipt.

Module loading has a 10-second deadline and 64-KiB limit; unsupported Wasm,
missing secure randomness, malformed modules and load errors are visible failures.
Remove the probe and only owned inspector forwards afterward.

This does not establish WebGL, shared renderer/text/network/thread compatibility,
AVPlay composition or a browser-free runtime. Those are separate port gates.
