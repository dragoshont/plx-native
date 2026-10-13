# Samsung 0.2.7: optional graphics OFF versus ON

**Measured 2026-10-14: no consistent product-shaped speedup was established.
Keep the new option OFF.** On the 2017 MU6172, enabling it substantially
increased time to decoded/backdrop-ready state. On the newer Q80C, that
latency also increased moderately and synchronous JavaScript/API work
increased substantially. Neither result is a panel-FPS measurement.

## What actually changed in 0.2.7

The new local, post-connection Graphics setting defaults strictly to **false**.
It optionally uploads Home/Detail backdrop pixels to a shared WebGL cover
renderer, checks runtime capabilities/limits, preserves the original image
and restores it on failure, context loss, disable or disposal. It can
crossfade consecutive presentations in one live backend, but the actual
Home wiring clears before changing featured metadata: **no Home crossfade
or retained context is promised by this build**.

Existing Home `translate3d`, DOM/CSS compositing, focus/navigation, image
request/decode limits and AVPlay remain. This is not a decoder/transcoder
change, native Rust port, blur effect or OS hardware-acceleration switch.

## Exact workload and evidence boundary

Both TVs' installed `PlxNative0.Plx` **0.2.7** was read safely from the owned
helper, not inferred from a package name. Production was never launched,
reinstalled, configured or connected to Plex.

The [reusable benchmark](../tools/tizen/graphics-benchmark/README.md) copies
the **exact published** `main.js`, CSS and modules unchanged. Only the
isolated manifest/HTML composition and fixture adapters differ: memory-only
storage, inert Plex metadata/PNG Blobs, external-network refusal and
playback/account-operation refusal. The real manual-connect, Settings toggle,
featured-title, Detail, Back and shelf-navigation handlers run.
Settings was activated with a DOM click on the real control, **bypassing
the separately reported remote Account-icon focus bug**; remote Settings
reachability was not verified.

One app session per TV, **OFF / ON / ON / OFF**. Each block has one Settings
activation, seven featured-image changes, seven Detail entries with Home
returns, 32 alternating shelf Left/Right events and 16 no-input callbacks.
The first image operation of each kind in each block is a separately
retained warmup, leaving **12 measured samples per mode per scene**.
Activation has only two samples per mode; it is not a cold application
launch benchmark. Every ON image presentation in these scenes creates a
fresh context after the product's own clear.

Both modes use the same four original 1280x720 backdrop PNGs and 480x270
card artwork, no image/server network latency, same dimensions/sequence.
The synthetic image compression and cache/resource scheduling are not
representative of every Plex library.

## Ready-state latency

Values are **median / empirical P95 milliseconds**. With only 12 scene
samples, this nearest-rank P95 equals the observed maximum, not a reliable
population tail estimate.

| Target and operation | OFF | ON |
| --- | --- | --- |
| Q80C featured artwork ready | 332.10 / 527.90 | 359.05 / 540.50 |
| Q80C Detail backdrop ready | 397.85 / 583.70 | 442.35 / 478.90 |
| MU6172 featured artwork ready | 23.01 / 34.50 | 344.34 / 718.57 |
| MU6172 Detail backdrop ready | 54.83 / 97.90 | 203.46 / 330.27 |
| Q80C Settings-to-Home activation (2 samples) | 487.80 / 593.20 | 612.95 / 707.30 |
| MU6172 Settings-to-Home activation (2 samples) | 212.85 / 241.72 | 486.80 / 494.54 |

“Ready” means the real image-load callback and optional rendering work
completed, detected by a bounded 5 ms DOM poll. It does **not** mean the
panel displayed the pixel. Waiting two subsequent animation callbacks gives
mixed results: Q80C featured medians OFF/ON **481.75/377.80 ms**, Detail
**543.75/455.35 ms**; MU6172 featured **244.62/374.85 ms**, Detail
**399.74/406.79 ms**. Different scheduling/paint timing can shift these
proxies; they do not erase the measured synchronous cost or prove a
physical speedup.

## Where ON spends synchronous time

These are observed **caller-wall-time/API submission costs**, not GPU
execution timings. Drivers can block inside calls; no GPU counters, timer
queries or `glFinish` were used. The observer times the real calls and
leaves the backend's GL error checks intact.

| Target / scene | `present` median / P95 | Context median / P95 | Texture upload median / P95 |
| --- | --- | --- | --- |
| Q80C featured | 157.65 / 249.90 ms | 61.45 / 83.90 ms | 72.90 / 171.80 ms |
| Q80C Detail | 130.60 / 194.80 ms | 37.95 / 75.20 ms | 55.50 / 81.80 ms |
| MU6172 featured | 96.45 / 181.45 ms | 23.01 / 70.36 ms | 57.29 / 86.34 ms |
| MU6172 Detail | 107.12 / 170.16 ms | 13.31 / 29.03 ms | 64.86 / 109.03 ms |

Every one of the **24 measured ON presentations per TV** exceeded both a
16.7 ms and a 33.4 ms reference interval. OFF allocates no optional context.
Each ON sample allocated a new context; the resulting context/upload cost
is directly observed. Shader compile-call medians were approximately
0–0.03 ms, link medians 0–0.36 ms, and draw submission 0.04–0.10 ms.
Compilation can be deferred, so tiny compile-call timing does not prove
compilation was free.

Time from assigning the Blob source to capture-phase load-event delivery
(before GPU `present`) also differed. Featured OFF/ON medians were
**240.80/125.75 ms on Q80C** and **14.50/209.41 ms on MU6172**; Detail
**299.30/244.65 ms** and **9.27/115.60 ms** respectively. This interval
includes asynchronous decode/event-loop delivery and resource scheduling,
**not a pure codec/decode CPU measurement**. No unmeasured cause is assigned
to those differences.

## Navigation, counters and layers

For the matched 64 dispatches per mode across two blocks:

| Observation | Q80C OFF / ON | MU6172 OFF / ON |
| --- | --- | --- |
| Navigation-handler median / P95 | 5.40/7.20 vs 5.20/6.30 ms | 5.98/10.74 vs 5.36/9.65 ms |
| Callback interval median / P95 | 16.7/50.0 vs 16.7/50.0 ms | 33.33/66.66 vs 16.67/83.33 ms |
| Callback interval maximum | 83.4 vs 100.0 ms | 349.99 vs 533.31 ms |
| Intervals over 33.4 ms (62 intervals/mode) | 6 vs 5 | 16 vs 8 |
| No-input callback median / P95 | 16.7/16.8 vs 16.7/16.8 ms | 16.67/33.33 vs 16.67/33.33 ms |

The MU's callback median improved in this narrow navigation leg, but its
tail worsened and image-ready latency regressed. This is **not** a general
performance win. Callback gaps are not panel frame counts, and their
individual causes were not traced/attributed. Navigation can overlap
trailing synthetic card decode, so it is not an isolated focus-math test.

Q80C inspector Performance counters for each whole image block
(activation, all seven image operations, Home returns, including warmups):

| Counter | OFF block 0 / block 3 | ON block 1 / block 2 |
| --- | --- | --- |
| Layout count | 93 / 92 | 130 / 129 |
| Style-recalc count | 148 / 150 | 198 / 195 |
| Layout time | 371.55 / 268.80 ms | 264.31 / 253.22 ms |
| Style-recalc time | 200.19 / 183.29 ms | 222.34 / 216.15 ms |
| Script time | 136.23 / 95.63 ms | 3651.75 / 2999.39 ms |
| Task time | 10472.75 / 10338.83 ms | 11985.76 / 11351.59 ms |

Q80C navigation-leg script time was 104.28/102.44 ms OFF versus
95.97/99.29 ms ON; layout time 40.98/38.95 versus 35.91/36.06 ms,
with 40/39 versus 39/38 layouts. Small differences in this short leg
do not outweigh the per-image setup cost or establish a general win.

Both engines' LayerTree reasons show the **existing Home transform layer
in OFF and ON**. ON adds a canvas layer; backend statuses report Mali-G51
on Q80C and Mali-450 MP on MU6172. No software-renderer fallback occurred.
Paint duration/GPU execution/counters were not measured. Q80C
`SystemInfo.getInfo` was rejected at the page target. MU
`Performance.enable/getMetrics` and `SystemInfo.getInfo` were explicitly
unsupported, so those counters remain unavailable rather than fabricated.

## Target, provenance and teardown

| Target | Current verified runtime | Firmware boundary |
| --- | --- | --- |
| QE65Q80CATXXH | Tizen 9.0, ARMv7, Chromium 120.0.6099.5, Mali-G51 | Most recent earlier API observation T-PTMCDEUC-0090-2220.4; this run's read-only REST API omitted firmware |
| UE55MU6172 | Tizen 3.0, ARMv7, Mali-450 MP; current UA reports Tizen 3.0 without a Chrome number, most recent independent inspector identified Chrome 47.0.2526.69 | Most recent earlier API observation T-KTMDEUC-1410.1; this run's REST API omitted firmware |

Public source **6527197599d042bd52990222aa02cbbfc110ce05**, public WGT SHA256
`98de8a0990a443aa0912b00596686d84fe4297ba7dcee5bc4d8f2d9ad76c5944`.
Isolated signed benchmark WGT SHA256
`900d71e1acc1b9135af4b9c7a56d30efaf00fa9352efd039dfabeeb5f435be3c`.
Copied product-file hashes, fixture source identity and full archive/stage
binding remain in private provenance. Signature-reference/package audit
passed; it is not independent certificate-chain attestation.

The first fixture-only host attempt waited on a canvas sharing the image
class; an image-only selector corrected that harness error before device
measurements. The first package audit correctly refused missing public API
privilege declarations; they were retained while Internet access stayed
denied. Neither failure modified product source or became a successful
timing sample.

The Q80C owned synthetic Page screenshot succeeded and was looked at.
MU Page screenshot timed out; no substitute image was fabricated.
Original SDK argv/stdout/stderr, installed-version RPCs, full blocks,
metrics/layer RPCs and raw final app lists are retained privately.
Both `PlxBench01.Probe` installations and owned forwards were removed,
both production registrations preserved, and all leases released.
No production settings, Plex records, playback, native APIs, other TVs
or navigation fixes were touched. **This packet measures and reports;
optimization decisions remain separate future work.**
