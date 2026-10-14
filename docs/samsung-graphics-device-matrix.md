# Optional graphics: named-device register

**2026-10-13, initial run before the 19:28 power-state update:** the exact optional WebGL backdrop backend rendered synthetic
Blob artwork on the **Q80C and QN70F**. Default-off, off-again, context-loss
fallback, explicit retry, oversize rejection and teardown passed on both.
The older targets were **BLOCKED**, not classified as GPU-incompatible.
There is no product speedup, panel FPS, codec/VPU or production-UI claim.

## Source and artifact binding

The isolated [matrix probe](../tools/tizen/graphics-probe/README.md) was built
from committed source **a1311ab3b7bcb072e6cde21203e3989b3114f0f7**.
Its `graphics.js`, `preferences.js` and `product.css` are byte-identical to
the respective files at parent integration **09d1169a**. Production `main.js`
was not included or executed.

| Input | SHA256 |
| --- | --- |
| Signed probe WGT | `25b5087570a393882a508c2fc72453dd76959d1c99b5d816517fad2cd33f6d2e` |
| `graphics.js` | `2c29ddba4e0488128f5be60768cdffb2a20dfa477f99696393cf192324d23143` |
| `preferences.js` | `859ff15a9b99504c682ecb49fd47598fb0b1efebb8cb212b1a508aa33c66eb2e` |
| `product.css` | `ab817639f7d79e3eeffe03036a8da38fb527f4845f6d1419c66df307115c6e38` |
| Probe observer | `84d3bfce3f947e38b7a8044005fb89c0d4105382ea4b10cd9a21b5080dbabebe` |

The official Tizen CLI signed one reusable package with the existing
target-covered profile. Both signature-reference digest sets and package
audit passed; extracted archive entries match the committed/staged inputs.
That is source/structure binding, not independent certificate-chain
attestation. Actual target installation was also observed.

## Initial target register, not model-year assumptions

| Exact model | Current runtime/engine | Firmware | Result |
| --- | --- | --- | --- |
| QE65Q80CATXXH (Q80C) | Tizen 9.0; ARMv7; Chromium 120.0.6099.5; product family QCQ80 | T-PTMCDEUC-0090-2220.4 | **PASS: WebGL draw and lifecycle cases** |
| QE55QN70FAUXXH (QN70F) | Tizen 9.0; ARMv7; Chromium 120.0.6099.5; product family QN70F | T-PTMFDEUC-0090-1301.0 | **PASS: WebGL draw and lifecycle cases** |
| UE55MU6172 (MU6172) | Not freshly established; companion previously recorded Tizen 3.0 | Not established | **BLOCKED:** absent from fresh discovery; the exact historical developer endpoint timed out in a bounded three-second TCP check. No install or graphics test. |
| UE43RU7092UXXH (RU7092; two remembered aliases) | Not freshly established; companion previously recorded Tizen 5.0 | Not established | **BLOCKED:** neither alias appeared in fresh discovery; supplied historical scan files had no endpoint for either. No guessed address, conflation, installation or GPU conclusion. |

For each reachable TV, read-only current discovery reported the full model,
SDB supplied current capabilities, and the fresh DUID matched the authorized
private companion record before installation. Public firmware/family/engine
values came from the owned probe. The user reported four TVs on; this did not
override the observed developer connectivity boundary. No wake, reboot,
certificate/permission change or SDB restart was used.

## Observed cases on both reachable TVs

| Case | Q80C | QN70F |
| --- | --- | --- |
| Actual `PlexPreferences.load` against empty in-memory storage | `enhancedGraphics=false` | Same |
| Default-off decoded presentation | Zero optional canvases/context requests; original inline opacity unchanged | Same |
| Opt-in actual shader/texture/cover draw | Mali-G51; immediate RGBA `[64,128,191,255]`; GL error 0 | Same |
| Same-document Blob upload | Accepted by the actual WebGL texture path | Same |
| Drawing-buffer dimensions in this fixture | 1904x1080, within the product cap | Same |
| Toggle off | Compatibility status; original opacity restored; optional canvas removed | Same |
| Standard `WEBGL_lose_context` | Original restored, canvas removed, `context-lost` fallback; subsequent `present` did not allocate a replacement context | Same |
| Explicit `setEnabled(true)` retry | Fresh WebGL draw, same correct immediate pixel and GL error 0 | Same |
| 4097x1 PNG, only 4097 decoded pixels | `texture-budget` fallback before any new context; original remained visible | Same |
| Dispose and fixture cleanup | No optional canvas; Blob URLs revoked | Same |
| Full app-ID uninstall and raw final registration list | Probe absent; production Plx still registered | Same |

The observer reads one center pixel synchronously inside the actual
`drawArrays` call, before the production backend's drawing buffer may be
discarded. It keeps `preserveDrawingBuffer=false`, does not replace shaders,
texture data or context attributes, and replays nonzero observed GL errors
to the backend rather than swallowing them. The source image is an original
8x4 uniform-color PNG. This validates texture/shader output, **not** full
panel appearance, every crop position, arbitrary artwork, scrims or text.
Cover UV math and bounded transitions also have host contract coverage.

Settings-screen pixels and the full product's navigation/backgrounding were
not driven on the TVs. Host integration tests cover that wiring. The parent
intentionally clears before featured metadata changes, so this packet does
not promise a Home crossfade or compare performance.

## What was tried and retained

Invoked `architrave-work`, `tizen-tv-builder` and `which-tier`. Reused the
already-read toolkit/Samsung development guidance. Host tools were Tizen CLI
2.5.25, SDB 4.2.36 and the installed toolkit 0.1.0; no tooling mutation or
dependency installation occurred in this packet.

Executed committed host backend, graphics-UI and preference tests, ES5/M47
checks and manifest validation before device work. Built outside the device
leases. Then, one target at a time under canonical and exact-target Samsung
leases: connect, capability/DUID check, raw baseline app list, install,
debug/owned forward, raw inspector discovery and protocol receipt, owned
forward removal, kill, full-ID uninstall and **raw final app list**.
Original package/provenance, command argv/stdout/stderr, capabilities,
inspector responses and final absence/preserved-production listings remain
in private session storage. The offline MU endpoint attempt and unresolved
RU inventory are recorded separately, never counted as compatibility passes.

The disposable identity was `PlxGpuM001.Probe`; no production app was
launched, updated, uninstalled or configured. No household credentials,
Plex traffic, account writes, playback, remote keys, media/decoder experiment
or native/Rust route was used. Both device leases and owned forwards were
released after each initial attempt; no owned probe remained installed at
the end of that initial run.

## Follow-up after the 19:28 power-state update

One fresh bounded discovery now found MU6172 and **two distinct RU7092
identities**. Fresh SDB DUID reads matched each private companion record;
the RU DUIDs differ. Combined with the initial Q80C/QN70F checks, this is
**five unique observed identities**, not four or an alias-collapsed duplicate.
Neither newer TV's graphics cases were rerun.

The same signed package and unchanged product/probe inputs were used.

| Follow-up target | Current runtime/engine and firmware | Rendering/lifecycle | Teardown |
| --- | --- | --- | --- |
| UE55MU6172 | Tizen 3.0; ARMv7; Chrome 47.0.2526.69; family UMU6100; T-KTMDEUC-1410.1 | **PASS:** Mali-450 MP; correct `[64,128,191,255]` immediate pixels/GL error 0, default-off, off-again, loss/sticky fallback/retry, budget and disposal | **PASS:** raw final list proves probe absent and production registered |
| UE43RU7092UXXH, identity B | Tizen 5.0; ARMv7; Chrome 63.0.3239.0; family URU7100; T-MSLDEUC-1500.9 | **PASS for rendering/lifecycle cases:** Mali-TDVX, same correct pixel and all same cases | **BLOCKED:** probe stopped and owned forward removed, but SDK uninstall did not remove its registration |
| UE43RU7092UXXH, identity A | Fresh model/DUID verified; Tizen 5.0; ARMv7. Engine/firmware not tested in a probe | **NOT RUN:** do not create a second potentially unremovable probe while identity B's teardown is unresolved | No probe installed on this identity; production remains registered |

An obsolete target lease initially blocked identity A. The coordinator
explicitly authorized narrowly removing that lease after rechecking its
owner PID was absent and its metadata unchanged; no active owner was
overridden.

Identity B's first inspector response had no `graphicsMatrixStart`
entrypoint. A bounded recovery inspected Runtime contexts and the Page
resource tree, verified the owned `probe.js`/module entrypoint and then
executed the cases successfully. This was a startup/inspection boundary,
**not** evidence of GPU incompatibility.

**Current cleanup prerequisite:** delete the stopped **PlxGraphicsMatrix**
developer probe through the TV's Apps UI if the normal SDK path remains
ineffective. The exact owned identity is `PlxGpuM001.Probe`; production Plx
must not be deleted. Full app ID with explicit serial and with a unique
verified SDK target name returned successful exit codes without removal;
the package-prefix form reported not-exist, and direct SDK shell uninstall
returned `closed`. Each final-list observation was retained privately.
No root, policy/certificate change, remote keys, reboot or production
uninstall was used. This RU attempt is **not a clean overall acceptance
pass** despite successful shader/lifecycle cases.

All coordinator-owned leases and forwards are released; the identity B
probe registration remains the explicit exception to completed teardown.
