# Samsung Rust runtime experiments

Date: 2026-10-13. This records isolated experiments, not a finished Samsung port
of the LG application. It distinguishes an unsupported runtime from a route
that has not been established. No household Plex data or production app was
changed.

The user subsequently chose hardware acceleration and optimization of the
existing Samsung Plx app instead of a Rust port. Rust/.NET/NaCl porting is now
parked; its results below are retained, not a reason to require a rewrite.
The subsequent [current-app acceleration assessment](samsung-acceleration-assessment.md)
demonstrates working WebGL and compositor promotion on the Q80C without Rust.
It does not establish the separate native Rust GLES surface or a product speedup.

## What can be stated with confidence

| Target and observed runtime | Result |
| --- | --- |
| QE65Q80CATXXH, current Tizen 9.0, ARMv7 | An ordinary .NET host loaded and executed a Rust shared library. A separate Web app executed Rust Wasm. |
| Same Q80C | ElmSharp window construction, resize/show requests and destruction returned successfully. Displayed pixels, a current GLES context and the shared Rust UI are not established. |
| UE55MU6172, current Tizen 3.0, ARMv7 | The signed Web control runs. .NET is outside Samsung's documented minimum of Tizen 4.0; Wasm is outside its minimum of Tizen 5.5 and is absent in the observed runtime. |
| Same 2017 TV | NaCl/PNaCl MIME entries are advertised, but neither a NaCl module nor Rust through NaCl was executed. A standalone native Rust route remains unestablished, not proven impossible. |

The Q80C originally shipped with a different OS generation; its current version
was queried rather than inferred from its year. Exact firmware versions were
not established. The household 2019 and 2025 TVs were unreachable during this
scan; no compatibility conclusion is drawn for them.

## Attempts and observations

| Experiment | Observed result | What it does not prove |
| --- | --- | --- |
| Rust ARMv7 static probe and ELF validator | Host cross-build and 21 malformed-ELF regressions passed | Installation, TV execution or native lifecycle support |
| 2017 native `capp` TPK, official packager | Installation rejected with `download failed[110]` | The precise error mapping, an entitlement requirement or universal native prohibition |
| Same valid Web bytes under `.wgt` versus `.tpk` filenames | WGT installed; TPK rejected | A native runtime through filename renaming |
| Native archive renamed to WGT | Registered; SDK acknowledged launch | Executing its ARM payload; the reported `app_type=2` was not independently mapped |
| 2017 fresh-identity Rust UDP witness after SDB restart | Installed and SDK launch returned zero, but no Rust receipt arrived | Non-execution: startup, syscall policy and network delivery were not independently separated |
| Q80C managed-only control, `PlxRNet042.Probe` | Exact target-source/nonce UDP receipt | Rust or graphics execution |
| Q80C ordinary P/Invoke, `PlxRNet043.Probe` and committed-source `PlxRNet045.Probe` | Exact Rust-generated nonce receipts; packaged ARM `ET_DYN` library used ordinary `DllImport` | The real application's libc/thread/native-library dependency closure |
| Q80C OpenTK graphics host, two bounded attempts | Installed/launched; no final or callback-stage receipt | A presented frame or working current context |
| Q80C isolated entry before OpenTK, `PlxRNet046.Probe` | Stage 99 accepted before OpenTK startup; no subsequent lifecycle/render/final receipt | Why startup stopped. Only the decoded stage was retained, not the original packet |
| Q80C ElmSharp window control, `PlxRNet047.Probe` | Four retained exact stages 300-303 and final Rust receipt | Pixels, rendering callbacks, swap or video composition |
| Q80C Rust Wasm, `PlxWasm001.Probe` | Inspector result matched an independent rotate/XOR/multiply challenge calculation; packaged module matched the compiled artifact | Browser-free execution or upstream renderer reuse |
| 2017 Web control, `PlxWeb0051.Probe` | Inspector observed Tizen 3.0, `WebAssembly` undefined and NaCl/PNaCl MIME entries | A loaded NaCl module, working legacy compiler or executed Rust |
| Unchanged `plx_gfx` dependency closure | Actual ARMv7 soft-float rlibs built with `std`, including `plx_base`, `plx_machine`, `libc` and `image` | Final Samsung shared-library linkage, runtime ABI, SDL/text services or graphics output |
| Newer NUI/API12 signature control | Official reference-package prototype compiled; no deployment | Retail-TV surface support or native binder presence. API/editor annotations alone are not runtime acceptance |
| Legacy NaCl compiler feasibility | Official SDK archive directory inspected without a full 1.8-GB download; its x86-64 Mac ARM-NaCl GCC driver ran under Rosetta and reported version 4.9.2 | Complete SDK installation, NaCl compilation or TV module execution |
| Rust → Wasm → generated C → NaCl proposal | WABT documents equivalent C99 output; lowering was not built or deployed | A successful 2017 Rust route. This is a parked hypothesis, not an implemented stack |

The initial nine-character 2017 control identity returned error 118; correcting
it to ten characters allowed installation. Do not infer a certificate or
install-permit cause from that code alone.

The OpenTK package contains a reference assembly, not a deployable runtime
assembly. Its absence from the archive is not by itself a packaging bug.
Tizen OS and TizenFX/API numbers are different: Samsung's current table maps
TV OS 9 to TizenFX 12. Available classes, version annotations, native binder
symbols and supported retail behavior must be checked separately.

## Integrity, cleanup and scope

The parent independently checked original runtime packets, decoded binary
nonces, archive hashes, the native ARM shared-library payload, installation
completion, registration and final probe absence. Wasm responses and all four
window-stage packets were independently checked. The receiver accepted only the
selected TV source and exact expected packet, not arbitrary UDP activity.

Probes were removed, owned inspector forwards closed and Samsung lanes
released after completed experiments. SDB restarts were explicitly authorized;
they restored dropped developer connections without changing TV policy.
No production replacement, remote keys, Plex progress writes, root, firmware,
certificate mutation or custom executable-memory loader was used.

Signed archives, private endpoint configurations, raw nonces, transcripts and
source/package binding records remain in private session storage. They are not
included in this public report. UDP receipts are useful controlled-experiment
evidence, not cryptographic attestation against a hostile network.

Representative source revisions: original probe `5d9b91bc`; Wasm `38390b9c`;
native probe `260cc983`; window control `18245990`; bounded panic fix `cf94c653`;
macOS crash-report fix `830ad5b3`. These were integrated into the working branch;
they were not merged to `main` or released as a Samsung client.

## Python crash correction

Three current macOS Python crash reports matched the intentional ctypes panic
regression: `plx_probe_test_panic` called the native handler's `abort()`, producing
SIGABRT and "Python quit unexpectedly" dialogs. They were not evidence that the
portal crashed.

The handler now uses process-wide `_exit(134)` on macOS. Its test still requires
a fatal nonzero exit within two seconds with a live worker thread, no return
across the ABI and no Python finalization. ARM keeps `exit_group(134)` with a trap
fallback. The test-only panic export cannot be packaged for ARM.

Older buffered-I/O shutdown and ONNX Runtime reports have different signatures;
their invoking scripts were not identified. This fix is not a claim that every
historical Python crash was repaired.

## Final bounded sanity run

After the user requested one further sanity check and no prolonged investigation:

- Q80C / current Tizen 9.0 / ARMv7: fresh `PlxRNet048` built from clean source
  `81abdeef` installed and launched, produced the exact new Rust nonce packet,
  and was uninstalled with final absence. The parent independently checked the
  source binding, packaged library/configuration, packet and archive hashes.
- A stale SDB capability request failed first. One explicitly authorized
  server restart restored the connection; the successful attempt and failure
  were preserved separately.
- The fresh 2017 control stopped before installation because its developer
  connection was unavailable. There was no second recovery loop, no installed
  probe and no inspector forward. Its earlier executed capability result stands;
  this final attempt is **blocked**, not passed.

Final native package SHA256:
`505c2a417f2ee22d223fd21275b04a7ba91bdeb7f998371ab1836a551e6bc7ac`.
Packaged ARM library SHA256:
`75b64e1826e1a152716cd00cac41ed6f2be1c858cbabe2d39013e3de12fa39a3`.
No decoder, performance, current-context or full-client claim follows from this
sanity receipt.

## Remaining boundary

The supported, demonstrated starting point on the tested Q80C is a thin .NET
process/lifecycle host with Rust owning application behavior. The browser/Wasm
alternative also executes Rust. Neither is yet the shared LG UI or player.

The next native graphics prerequisite is an applicable TV surface/current-context
contract plus Samsung-compatible native dependencies. The 2017 next prerequisite
is a validated NaCl compiler/runtime/module path, including any Rust lowering
step. No more speculative implementation is included in this bounded report.

## Primary sources and reproducible probes

- [Native/.NET probe, build recipes and device register](../tools/tizen/dotnet-probe/README.md)
- [Rust Wasm probe and host tests](../tools/tizen/wasm-probe/README.md)
- [ARM static probe and ELF validator](../tools/tizen/native-probe/README.md)
- [Samsung general specifications](https://developer.samsung.com/smarttv/develop/specifications/general-specifications.html)
- [Samsung WebAssembly minimum and host structure](https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/webassembly.html)
- [Samsung NaCl overview and sandbox](https://developer.samsung.com/smarttv/develop/extension-libraries/nacl/overview.html)
- [Samsung NaCl module and signed-WGT structure](https://developer.samsung.com/smarttv/develop/extension-libraries/nacl/getting-started.html)
- [Samsung NaCl compiler configurations](https://developer.samsung.com/smarttv/develop/extension-libraries/nacl/managing-nacl-projects/building-nacl-projects.html)
- [WABT wasm2c: equivalent generated C](https://github.com/WebAssembly/wabt/blob/main/wasm2c/README.md)
