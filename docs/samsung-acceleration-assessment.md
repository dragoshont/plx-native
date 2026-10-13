# Living-room Samsung Plx acceleration assessment

**2026-10-13: the existing Web app can access the GPU without a Rust rewrite.
Its Home already requests compositor-based movement. No additional product
speedup was established, so this investigation changes no production code.**

The subsequent user-requested [optional graphics backend](samsung-optional-graphics.md)
adds an off-by-default WebGL artwork path with automatic fallback. It preserves
existing acceleration and does not turn these assessment measurements into a
claim that the new path is faster.

## Exact product and target

Private companion metadata maps **livingroom tv** to **QE65Q80CATXXH**, a 2023
Q80C. The current device reports **Tizen 9.0**, **ARMv7**, TV profile,
Chromium **120.0.6099.5**, product family **QCQ80**, firmware
**T-PTMCDEUC-0090-2220.4**, and AVPlay **7.0**. The current runtime was measured,
not inferred from the model's original Tizen 7.0 baseline.

The TV lists `PlxNative0.Plx`; the isolated probe's public
`tizen.application.getAppInfo("PlxNative0.Plx")` reports **Plx 0.2.6**.
The latest matching public release is
[samsung-v0.2.6](https://github.com/dragoshont/plx-native/releases/tag/samsung-v0.2.6),
source **5a601a3ea0b37a44e7413ccd26966e119539b4ac**.
Its downloaded WGT matches the published SHA256:
`703f023fc4def8e526c6f504bec17da0539d85058a9b1d57b8e6614591666362`.
Its packaged manifest really says 0.2.6; the source manifest's 0.2.3 is not
the packaged version. Installed source bytes were not extracted: matching
installed version/ID is not proof of byte-identical installation.

This worktree started at **203dd0cfcc556802f0481b9f6bad3fee41159e2a**, which
contains additional Samsung changes and is **not** the 0.2.6 release tree.
The assessment therefore pins product behavior to the release, not arbitrary
HEAD. The probe uses its exact released `css/style.css`; the source/release
CSS byte comparison passed.

## What acceleration means here

| Category | Result | Evidence and boundary |
| --- | --- | --- |
| WebGL/GPU access | **Working, driver-reported Mali backend** | Actual vertex/fragment compilation, link, triangle draw and pixel readback `[64,128,191,255]`, GL error 0; unmasked vendor ARM / renderer Mali-G51; WebGL 1.0 / OpenGL ES 2.0. More than method presence or a renderer string. Hardware counters/driver residency were not measured. |
| DOM/CSS composition | **Compositor promotion observed with released CSS** | The synthetic `.home-track` is a separate 1760x3000 layer with `Trivial3DTransform` and `WillChangeTransform` reasons. The root reports accelerated overflow scrolling. Production Plx was not launched; its complete layer tree remains unmeasured. |
| Existing UI graphics | **Already uses the browser compositor path** | Released `main.js` `moveHome` sets `translate3d`; `.home-track` has `will-change: transform`. There is no WebGL renderer in the released product. This is not a wholly software UI waiting for an OpenGL switch. |
| Video decoding | **Existing supported AVPlay route; exact decoder hardware use unestablished** | Released `js/avplay.js` uses `webapis.avplay.open/prepareAsync/play` and `application/avplayer`, not a JavaScript codec. AVPlay version was read. No clip was played and no decoder identity/counter was obtained; this does not certify a codec, HDR, audio or hardware video plane. |
| Plex transcoding | **Separate server operation** | Released `js/playback.js` negotiates Direct Play, Direct Stream or `/transcode/universal` HLS and falls back after decoder refusal. A TV GPU cannot establish or enable the server's hardware transcoder. Direct Play/Stream policy already exists; forcing either is not a universal optimization. |
| Rooted LG native OpenGL | **Different deployment/API contract** | LG PlxNative owns a native GLES renderer and privileged/rooted deployment. Retail Samsung Plx owns DOM/CSS, public WebGL and AVPlay. Working WebGL does not provide arbitrary native EGL contexts, LG libraries, GPU counters or shared AVPlay textures. |

`SystemInfo.getInfo` was rejected on the page inspector target. This records
one missing diagnostic, **not** a categorical denial of GPU hardware or of
the command on a browser-level target.

## Small A/B: existing transform versus native scroll

One disposable app displayed 12 shelves of eight synthetic gradient cards,
with released Plx CSS. Two hypotheses were exercised: functional WebGL plus
layer promotion, and transform versus native scrolling. No extra framework,
native/Rust host or account workload was introduced.

Each motion trial used 120 `requestAnimationFrame` callbacks, identical
8-pixel increments and ordering **transform / scroll / scroll / transform**.
Inspector `Performance` deltas below are main-thread accounting, not GPU
timing or panel frame counts.

| Trial | Layout count / time | Style recalculations / time | Script time | Task time | Median callback interval |
| --- | --- | --- | --- | --- | --- |
| Transform 1 | 0 / 0 ms | 120 / 33.040 ms | 29.512 ms | 412.226 ms | 16.7 ms |
| Scroll 1 | 0 / 0 ms | 1 / 0.183 ms | 31.930 ms | 331.779 ms | 16.7 ms |
| Scroll 2 | 0 / 0 ms | 0 / 0 ms | 36.851 ms | 385.795 ms | 16.7 ms |
| Transform 2 | 0 / 0 ms | 119 / 33.170 ms | 26.358 ms | 338.974 ms | 16.7 ms |

**Native scrolling is also compositor-eligible on this newer TV:** the
inspector explicitly reports accelerated scrolling, both paths avoid layout,
and native scroll has less style work. Paint was not counted, so this does
not confirm or refute the older TV's repaint observation. The app's existing
transform costs about 0.28 ms of style
work per callback here. This is not a production bottleneck or a reason to
replace `moveHome`: the fixture has no real image decode, overlays, focus
geometry or network work, and inspector attachment adds overhead. Paint/GPU
cost and panel pacing were not measured. Occasional callback gaps have no
attributed cause; these numbers are **not** product FPS.

### Practical decision

Keep the existing DOM/CSS + AVPlay architecture. There is no evidence that
replacing it with WebGL would improve this product: moving cards is already
composited, and the measured fixture is not layout-bound. WebGL can help a
future identified shader/image-processing workload, but would also take
ownership of text, textures, focus/accessibility and context-loss recovery.
No such workload was demonstrated here.

The cheapest next useful experiment is an **account-free product-shaped
navigation trace**, with synthetic artwork, retaining the current
`revealControl` and D-pad geometry loops. They read multiple bounding
rectangles, sometimes after a transform/class/scroll write; that is a
source-grounded candidate for forced layout, **not a measured bottleneck**.
Attribute layout/paint/script/image-decode time before batching those reads
or changing image budgets. Released image requests already have three active
slots, bounded queues and Blob ownership; neither removing the limits nor
adding more `will-change` is justified. Never extrapolate this Q80C result to
the older 2017 engine.

## Attempt register and teardown

Skills invoked: `tizen-tv-builder`, `architrave-work` (research/development)
and `which-tier`. Read the installed toolkit README, compatibility, lessons
and experience-review documents and this repo's Samsung development guide.
The LG host/simulator tiers cannot answer Samsung GPU access, so this used
the actual named Samsung target rather than the LG lock or simulator.

Host tools: installed toolkit **0.1.0**, read-only companion candidate
`/private/tmp/tvb-clean` (also reports 0.1.0), Tizen CLI **2.5.25**, SDB
**4.2.36**. No SDK installation, new dependency, certificate modification or
security-setting change occurred. The declared Tizen host-test dependencies
were restored with `npm ci` after the ES5 checker reported missing Acorn.

| Attempt | Result |
| --- | --- |
| `tizen.py --version`, `--help`, `doctor`; private companion mapping; target `capability` / `shell 0 applist` | Passed; exact target/runtime and production registration read under both Samsung leases. |
| Git/release metadata and `gh release download samsung-v0.2.6 --pattern Plx-0.2.6.wgt` | WGT digest and release/source CSS equality passed. |
| `node --check probe.js`; toolkit `validate`; official `tizen package -t wgt -s EXISTING_PROFILE ...` | Passed; staged only probe XML/HTML/JS and released CSS. |
| First `check-package` / session admission | Refused before installation: toolkit audit required declared AVPlay privilege for the read-only version query. Added it, rebuilt; both signature-reference digest sets and package audit then passed. Samsung's current AVPlay guide says the privilege is not used since 2015; retaining it satisfies this toolkit's stricter gate, without bypassing it. |
| Install/debug/owned forward; public product/installed-app reads; shader draw/readback; LayerTree; four Performance trials | Observed on Q80C. `SystemInfo.getInfo` rejected; no unchanged retry. |
| Initial toolkit teardown / package-prefix uninstall | Owned forward removed and probe killed, but prefix-based CLI removal failed. Separate SDB prefix removal was ineffective despite exit 0. |
| `tizen uninstall -p PlxAccel01.Probe -s TARGET_SERIAL`; `shell 0 applist` | Full Web application ID succeeded; probe absent and production Plx still registered. Both leases released. |
| Household playback, server mutations, production launch/replacement, native port, decoder counters, panel/video-plane capture | Not attempted; unsafe or outside this bounded packet. |

The probe's dependency-free host contract checks also exercise successful
pixel validation, wrong pixels, GL errors, shader/link/context failures,
resource release, invalid/concurrent motion and the exact 120-callback bound.
They are host mocks, not additional GPU evidence.

Successful probe WGT SHA256:
`530c80ef0c7baf0960d24e253d12a03a1d9c68a1002bd4f90175a72e24bb4f70`.
Structural/signature-digest checks are not independent certificate-chain
verification; actual device installation supplied retail admission evidence.
Signed archives, raw identity/listings, exact commands and inspector results
remain in private session storage. No addresses, DUIDs, credentials, household
content or certificate files are published. Only the owned probe/forward was
removed; no SDB restart, IDE kill or other television operation was needed.

The final absence/preserved-production listing was checked during teardown,
but its raw response was not retained. The saved result contains the cleanup
assertions and successful full-ID uninstall transcript; the earlier failed
removal listing must not be cited as the final state. Parent verification
independently matched the signed archive and committed probe bytes, release CSS,
WebGL pixel/driver result, layer reasons and bounded ABBA records. It did not
perform another live production/probe query or claim GPU-counter evidence.

## Primary references

- [Samsung Web engine specifications](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html): current Tizen/Chromium table and Graphics/WebGL feature support, retrieved 2026-10-13.
- [Samsung AVPlay guide](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-avplay.html): supported player integration, lifecycle and separate media surface.
- [Samsung AVPlay API reference](https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html): public streaming/track diagnostics do not supply the decoder implementation/counters needed by this packet; codec names are not hardware-decoder proof.
- [Samsung UHD playback](https://developer.samsung.com/smarttv/develop/guides/multimedia/4k-8k-uhd-video.html): uses AVPlay, with per-device/media limits.
- [Samsung 2023 video specifications](https://developer.samsung.com/smarttv/develop/specifications/media-specifications/2023-tv-video-specifications.html): model-group decoder constraints, not an acceptance result for this updated installation.
- [Account-free probe source and reproduction](../tools/tizen/acceleration-probe/README.md).
