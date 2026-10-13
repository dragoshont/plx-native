# Rust library with a thin Samsung .NET launcher

This isolated probe executes Rust through ordinary `DllImport`, not a custom
loader, browser, account operation, or PlxNative application port. The C# host
owns the vendor lifecycle; Rust owns configuration parsing and the UDP receipt.
The optional managed-only control has a different packet prefix.

## Observed device register (2026-10-13)

| Target / current runtime | Experiment | Install / launch | Execution evidence | Cleanup |
| --- | --- | --- | --- | --- |
| QE65Q80CATXXH / Tizen 9.0 / ARMv7 | Managed-only control | Both observed | Exact managed nonce packet | Probe absent |
| Same target | Ordinary .NET P/Invoke of Rust cdylib | Both observed | Exact Rust-generated nonce packet, checked against target source address | Probe absent |
| Same target | Optional OpenTK GLES host | Both observed, twice | No final receipt; added Rust stage diagnostics also produced no packets | Probes absent |
| Same target | Separate `../wasm-probe` browser comparison | Both observed | Actual Rust export result matched an independent challenge calculation | Probe and owned inspector forward removed |
| UE55MU6172 / Tizen 3.0 / ARMv7 | Owned web capability control | Both observed | Inspector observed `WebAssembly` undefined and NaCl/PNaCl MIME entries advertised | Probe and owned inspector forward removed |
| Same 2017 target | .NET / Wasm | **Unsupported; skipped** | Samsung minima are Tizen 4.0 / 5.5 respectively | No installation attempted |

The Q80C's current Tizen 9.0 was read from SDB, not inferred from its 2023
Tizen 7.0 baseline. Firmware version was not established. The other household
2019/2025 sets were unreachable in the scan, not declared incompatible.

Original signed archives, nonces, endpoint configuration, command output,
registration checks and source-bound receipts stay in private session storage.
No addresses, DUIDs, credentials, signed packages or receipt files belong here.
UDP receipts establish the observed probe execution, not attestation against
a hostile network or general model compatibility.

## Host build

Host inputs used: Rust `1.101.0-nightly (6f5da406b 2026-10-10)`,
Microsoft .NET SDK `8.0.408` in isolated storage, Tizen CLI `2.5.25`,
SDB `4.2.36`, `Tizen.NET.Sdk/1.1.6`, and the installed Tizen 5.0 ElmSharp
template. The target framework is **tizen50**, not the host's .NET 8 runtime.
The template's `CoreUIApplication` uses ElmSharp to initialize the lifecycle;
the ordinary host renders no managed UI.

```sh
cd tools/tizen/dotnet-probe
CARGO_INCREMENTAL=0 cargo +nightly build --release --features gles
python3 test_receipt.py
CARGO_INCREMENTAL=0 cargo +nightly build --release --features gles \
  -Z json-target-spec -Z build-std=core,compiler_builtins \
  -Z build-std-features=compiler-builtins-mem --target armv7-tizen-probe.json
dotnet publish host/Probe.csproj -c Release
```

Without `--features gles`, the library exports only `plx_probe_entry`.
`--features gles` additionally exports the graphics experiment and stage
diagnostics. The ARM artifact is PIC ELF32 ARM EABI5 `ET_DYN`, soft-float,
with no `DT_NEEDED` or undefined symbols. This deliberately small `no_std`
syscall probe does **not** establish compatibility of the real application's
libc, threads, TLS, allocator, native dependencies or standard library.
The target is not an ARM64 fallback; reject an unverified architecture.

Copy the ARM `.so` to a **private staged project's** `lib/`. Its
`res/receipt.bin` is exactly 38 bytes: four IPv4 octets, two big-endian UDP
port bytes, and 32 raw random nonce bytes. Rust reads this file using the
resource path passed by C#, sends one datagram on a nonblocking ARM socket,
closes descriptors and returns an explicit status. Error codes are:
10-13 configuration/path/read/close failures; 20-23 socket/connect/write/close
failures. No panic or error is a successful receipt.
Panics terminate the entire process: ARM uses Linux `exit_group(134)` with
an undefined-instruction fallback if the syscall unexpectedly returns, and
macOS uses `abort()`. They never spin or unwind across the managed/native ABI.
The host tests build a separate `panic-test` library and require its compiled
panic entry to abort within two seconds. This feature is rejected on non-macOS
targets; its test entry is absent from the ordinary and GLES package exports.

Wire framing is `PLX-RUST-V1:\n` followed by the **raw 32-byte nonce**.
Private metadata represents that nonce as hex; compare with `bytes.fromhex`,
not with the UTF-8 bytes of the hexadecimal text. Graphics stage packets append
a big-endian 32-bit code and are not final success packets. The managed-only
control, compiled with `-p:DefineConstants=MANAGED_CONTROL`, instead sends
`PLX-CS-V1:\n` plus its own nonce.

Run a bounded receiver before launching, accept only the exact source and
nonce, and retain package SHA256 and registration checks. Never treat
`launched` alone, a missing UDP packet, or a host test as TV execution proof.

## Official packaging

Publish before packaging: this CLI prefers the `publish/` directory, even
when it exists but is empty. Verify the final archive contains the exact
`bin/PlxRustNetProbe.dll`, `res/receipt.bin` and native library.

```sh
tizen package-cs -C Release -s EXISTING_SAMSUNG_PROFILE \
  -o /private/probe-output -- /private/staged-project
```

Use an existing **Samsung TV** author/distributor profile that covers the
verified target DUID, with public Internet privilege only. This work did not
modify shared SDK installations, profiles, certificates or installation policy.
The source's `ProjectTypeGuids` is required by this installed CLI's C# project
recognition. The vendor `PackageCSCLI.execute()` returns its initial `-1` even
after successful packaging on CLI 2.5.25; a package was nevertheless produced.
Do not ignore generic failures: inspect the success transcript, included bytes,
manifest, both signature-reference digests and eventual device installation.
Signature reference validation is not independent trust-chain verification.

The observed package operation used the official CLI Java entry point with the
previously downloaded official NativeCLI jars supplied from private storage;
shared SDK files were unchanged. Samsung signing generated SHA512 file
references. Keep package filenames free of spaces for this CLI: two web
probe filenames with spaces failed generically; the newer-TV WGT worked
with `Probe.wgt`. A separate malformed nine-character legacy probe identity
returned 118, while its corrected ten-character identity installed; that
error alone does not diagnose certificate or permit state.

Hold `/tmp/tizen-tv-<alias>.lock` around connect/install/launch/inspect/uninstall,
not around building. Use fresh probe identities and never overwrite a registered
identity. Verify final absence and remove only owned forwards. Authorized SDB
restart was used once; Tizen Studio IDE remained running. No remote keys,
household playback, Plex writes, root or firmware changes were performed.

## Graphics boundary and architecture options

The optional `-p:GraphicsProbe=true` host follows the installed vendor
OpenTK.Tizen `3.0.2` / `TizenGameApplication` template. Rust loads the **unchanged
upstream** `vs_src.vert` and `fs_flat.frag` through `include_str!`, compiles,
draws, reads a pixel and deletes GL objects. C# supplies an ordinary EGL
function resolver and swaps the host window. Neither graphics attempt produced
an execution-stage or post-swap receipt. The cause remains undetermined;
installation and launcher acknowledgement do not establish callback/context
startup. This is **not** a passed graphics gate.

Even a success would prove only the original shader subset and framebuffer
readback/swap, not the `plx_gfx` draw primitives, text, screen widgets or panel
composition. The full crate's `plx_base`/`plx_machine`/`libc`/`image` and
native build/link closure still require Samsung-specific ABI and dependency
validation. Do not use the webOS sysroot as Samsung evidence.
The separate parent investigation successfully compiled unchanged `plx_gfx`,
`plx_base`, `plx_machine`, `libc` and `image` into ARMv7 Linux soft-float rlibs
with `std`. Crate compilation is therefore not the present blocker; final
Samsung shared-library linkage, runtime dependencies and context startup are.

Ranked routes:

1. **.NET lifecycle/process host, Rust semantic core:** device execution
   established here; best demonstrated browser-free starting point. Rust can
   remain owner of state, navigation, rendering decisions and playback
   orchestration even though .NET owns the OS entry point.
2. **Web shell + Rust Wasm:** execution established on the newer TV by the
   separate probe; browser-hosted and a different dependency/runtime contract.
3. **Standalone Rust process loading a .NET sidecar:** no supported retail
   TV launch contract established. Samsung's current TV profile documents Web
   and .NET application types, not native applications; generic TPK tooling
   does not establish a newer-TV native route.
4. **2017 web + NaCl:** vendor-documented legacy ARMv7 sandbox route, and MIME
   entries observed, but no module execution or Rust-compatible NaCl compiler
   proved. Current Rust lists no NaCl target; this installed SDK has neither
   `pnacl-clang` nor `arm-nacl-gcc`. A normal ARM ELF is not a NaCl module.

A Web app cannot gain an ELF launch API merely by opening a local IPC socket.
A network-hosted Rust core could communicate through supported HTTP/WebSocket
APIs, including on older TVs, but executes elsewhere and changes deployment,
security and offline behavior. It is not an on-TV Rust port and was not built.

The smallest future platform sidecar seam is a versioned C ABI:
initialize/step/shutdown on the current context thread; drawable size and context
generation; ordered key/lifecycle events; capability-tagged media commands
and completion/error events. Rust owns policy; the sidecar owns platform
mechanisms. Web AVPlay is a JavaScript API, not an invented native ABI.
Native URI playback or entitled ESPlayer need a separate synthetic-media gate.
No input, decoder or media-plane interface has been proved by this probe.

## Primary sources

- [Samsung specifications: .NET minimum, current OS upgrades and framework table](https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html)
- [Samsung/Tizen TV application types](https://github.com/Samsung/tizen-docs/blob/master/docs/application/profiles/index.md)
- [Samsung/Tizen first .NET app and TPK CLI](https://github.com/Samsung/tizen-docs/blob/master/docs/application/dotnet/get-started/first-app.md)
- [Samsung/Tizen .NET CLI prerequisites and commands](https://github.com/Samsung/tizen-docs/blob/master/docs/sdk-tools/vstools/tools/dotnet-cli-ext.md)
- [Samsung JuvoPlayer .NET/native GLES example](https://github.com/SamsungDForum/JuvoPlayer/tree/a0c9d78cd98a579025a6eac768be03aa727dbd2a/JuvoPlayer.OpenGL)
- [Samsung TV certificates](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html)
- [Samsung WebAssembly minimum](https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/webassembly.html)
- [Samsung NaCl build configurations and deprecation boundary](https://developer.samsung.com/smarttv/develop/extension-libraries/nacl/managing-nacl-projects/building-nacl-projects.html)

The installed SDK templates, CLI bytecode, restored vendor package targets,
actual SDB capabilities and retained device receipts are additional primary
evidence. No third-party native-loader workaround is used.
