# Samsung Tizen (2017+) feasibility study

> **Native execution update 2026-10-13:** on a QE65Q80CATXXH reporting current
> Tizen 9.0 / ARMv7, a thin vendor .NET lifecycle host loaded an ordinary Rust
> cdylib and received its exact nonce packet. A separate browser-hosted Rust
> Wasm probe also executed. These prove isolated Rust execution, not an unchanged
> LG binary, shared renderer, decoder backend or finished client. The newer
> evidence supersedes Samsung-wide interpretations of the historical verdict
> below; the 2017 target still lacks a proven Rust route. See the
> [native probe and device register](../tools/tizen/dotnet-probe/README.md) and
> [the bounded runtime experiments report](samsung-rust-runtime-results.md)
> for attempts, verified results, unsupported runtimes and unresolved routes.

> **Scope update 2026-10-09:** the floor is now **2017 (Tizen 3.0, Chromium M47)**, set by the oldest
> sets the owner has (a 2017 MU series). 2017 is the hardest tier: M47 predates much of ES2015+, so the
> JavaScript client must be transpiled and polyfilled, and 2017 video limits (`17TV_PREMIUM` etc.) are
> per model group. Everything below written about "2018" is the *next* tier up, not the floor.
>
> **First device evidence 2026-10-09:** a signed hello `.wgt` installed and ran on a 2017 UE55MU6172
> (PoC probe P0 passed). It confirmed no WebAssembly, no `async` and no sloppy-mode `class`/`let` on that
> set, and that AVPlay, MSE, `fetch` and `Promise` exist. A second probe on the same set passed P1 and P5:
> it direct-played a 1080p H.264 MKV (AC-3 5.1) from the owner's PMS over HTTPS via AVPlay, with first frame
> in 2.4 s and no stalls in 10 minutes, and reached PMS and plex.tv over HTTPS. Later probes on the
> same set played selected 4K HEVC Main 10 (SDR and 57 Mbps HDR10, HDR seen by the owner), AAC,
> E-AC-3, DTS core and embedded text subtitles via AVPlay; an unoptimized DOM grid loaded 169/170
> posters and met the scripted focus-latency target. These are probe results from one set, not a
> completed client or broad support claim. Results: [PoC](samsung-tizen-poc.md).

Status: desk study, 2026-10-09, against upstream `GLinnik21/plx-native` at `38c07fc3` (this fork,
`dragoshont/plx-native`, is identical at that revision). The P0-P6 probe results recorded in the
[test register](samsung-tizen-poc.md) were observed on one 2017 Samsung set. They do not establish
compatibility with any other model or firmware; no Samsung product support is claimed. The LG app
is untouched. A full Tizen client is being specified and developed separately in
[samsung-tizen-client-spec.md](samsung-tizen-client-spec.md), with a reusable workflow for future
Tizen apps in [samsung-tizen-development-process.md](samsung-tizen-development-process.md).
Developer guidance is in [getting started](samsung-getting-started.md).

Evidence labels used throughout:

- **[code]** read in this tree at `38c07fc3`.
- **[release/issue]** read on the upstream GitHub releases or issues, 2026-10-09.
- **[author]** a claim by the upstream author that this study could not reproduce.
- **[telemetry]** the author's reading of opt-in usage reports; not independently reproducible.
- **[samsung]** Samsung developer documentation (URLs in the last section).
- **[inference]** reasoning from the above, not stated by any source.
- **[untested]** needs hardware.

## 1. Historical verdict (2026-10-09)

1. **Porting the existing native binary to Samsung is not available on the evidence.** It is an
   ARM GCC/glibc program that draws with GLES2/EGL/SDL and decodes through LG's Starfish/ACB
   libraries. Samsung's public TV tooling documents web apps (`.wgt`), Tizen .NET and Flutter; no
   public route to deploy and run this kind of native code with decoder access was found [samsung]. "It is Linux underneath" does not change that:
   every platform interface the binary uses is an LG library [code].
2. **The Rust code is largely reusable as a *design and specification*, much less as a library.**
   The Plex/session/data layers are pure logic over a transport, but they sit on a libcurl/socket
   transport and threads, and Rust-to-WebAssembly is documented by Samsung only from 2020 models
   [samsung], so it cannot serve the 2018 and 2019 sets.
3. **The only approach that can reach 2018 sets is a new web (`.wgt`) client** that implements the Plex
   protocol in JavaScript for Chromium 56 and plays through Samsung's AVPlay, which is the analogue of the LG video-plane design.
4. **Recommendation:** the observed 2017 results justify starting the separately specified full
   Tizen client and reusable app-development workflow. They do not justify a support claim: validate
   the Samsung emulator and each intended model/firmware tier, including 2018/2019 behavior, before
   advertising compatibility or release readiness.

## 2. Claims and evidence audit

Upstream evidence is mostly the README, the site, 6,578 `#[test]` functions [code], a mock Plex
server and fixtures under `tests/`, and GitHub releases/issues.

| Claim | Evidence | Status |
| --- | --- | --- |
| Native Rust, "no Chromium, no JavaScript, no web view" | 13 layer crates plus the `app` staticlib, about 492k Rust lines; C is about 2.0k lines (`starfish.c` 850, `ass.c` 399, `crashtrace.c` 333, `main.c` 191, `svg.c` 66) [code] | **Verified in source** |
| GPU UI on the TV | `gfx` declares GLES2/EGL/SDL2_ttf externs; pure-Rust JPEG/PNG decode [code] | Verified in source |
| Video on the TV's own decoder, DV 5/8, HEVC 10-bit, E-AC-3 Atmos | `tv::sink::VideoSink` is implemented over Starfish/ACB (`src/starfish.c`, `player::ffi`) [code]. Whether a stream looks right is a device fact | Mechanism verified; output **[author]** |
| Plex server stays; resume, progress, markers | `plex`, `session`, `data` crates and mock-PMS tests; no server code [code] | Verified in source and mock tests; against a real server **[author]** |
| 60 fps on a 2019 LG | On-device scenes exist (`tests/run.py --fps*`) but results are not committed [code] | **[author]**, not reproduced |
| "webOS 4.0 or newer", one tested 3.4.3 set | README [author]; 3.x seeks by reload [code/README] | [author] |
| "Opt-in usage reports show video playing on sets from 2018 through the newest" | README [telemetry] | Not independently reproducible. The same README says 2018 sets on platform 3.9.3 never started video |
| 2018 / platform 3.9.3 never plays | Issue 249: nine sets, eight play attempts, none ever logged `playback.started` [release/issue]. Closed "not planned" on 2026-10-01 because no owner reported back and the maintainer cannot reproduce it | **Open failure**, no root cause |
| Some 2019 sets (k5lp/k3lp) cannot play via Developer Mode | README; the app detects the sandbox condition [code/author] | Author-reported |
| k6hp crash | README, issue 174; "not reproduced" [author] | Unreproduced |
| Nightlies "not tested on a television" | README [author] | The author states so; so do not equate a nightly with tested |
| Screenshots | README says they are desktop-simulator output | Simulator, not hardware |
| GPL-3.0-or-later, name/brand excluded | `LICENSING.md`, `TRADEMARKS.md` [code] | Verified in source |
| Release cadence | v0.8.0 published 2026-10-07; daily nightlies; RC builds [release/issue] | Verified; shows an active project, not quality |

Observations that matter for Samsung:

- The strongest hardware evidence is for **one 2019 LG** [author]. Everything about 2018 LG is
  telemetry or an open bug, so "2018 and later" is the wrong evidence base to inherit for Samsung.
- A simulator (`hostsim`, `HostSink`) exists for host tests [code]; it proves logic, not decoder behaviour.
- `docs/module-layers.md` calls the layers "OS-neutral port (L15b)" **open** work: the video sink verbs are still
  Starfish-shaped and the ACB bind sequence lives outside the sink. No Samsung reference exists
  anywhere in the tree (searched `.rs`, `.md`, `.toml`, `Makefile`) [code].
- The older figure of a single 441k-line crate in the module doc predates the split; this study
  used live counts.

Remaining uncertainties: real-server behaviour at scale, any hardware result other than the author's,
and the root cause of issue 249. None changes the Samsung conclusion, but they limit how much of
the LG evidence a Samsung effort may cite.

## 3. Reuse boundaries

Lines are Rust, `src/` only [code]. The layer rule (`ci/module-layers.ini`,
`ci/check-module-layers.py`) fences LG code in `[port webos]`: `webos`, `keymanager`, `system`,
`player::ffi`, `port`; the `platform::tv::Port` table is filled at boot.

| Layer | Lines | What it is | Samsung reuse |
| --- | --- | --- | --- |
| `base`, `machine` | 10k, 5k | Utilities, state machines | Logic only; reusable as Wasm on 2020+ or re-implemented |
| `platform` | 17k | TV port table, identity, secure storage | webOS-shaped; rewrite |
| `gfx` | 15k | GLES2/EGL/SDL2_ttf renderer | Not reusable |
| `net` | 12k | libcurl via `dlopen`, sockets, rustls | Not reusable; browser uses `fetch`/XHR |
| `plex` | 34k | PMS/plex.tv API, auth, models | **Protocol knowledge reusable**; code needs a new transport |
| `telemetry` | 16k | Opt-in reporting | Policy reusable, code not |
| `data`, `session` | 40k, 19k | Library, hubs, resume, sessions | Behaviour reusable as spec and test oracle |
| `media` | 97k | FFmpeg n3.3 demux (ABI offsets), HLS/ABR, buffer-feed pump to Starfish | Not reusable; capability and ABR **decision logic** is portable in principle |
| `ui`, `appkit`, `screens` | 70k, 14k, 84k | GPU widget toolkit, screens | Not reusable; layout/focus design (`docs/ui-restructure-spec-v4.md`) is |
| `app` | 60k | Boot, input, Magic Remote | webOS-specific |
| C seam | 2.0k | Starfish/ACB, crash tracer | LG-only |

Concrete blockers [code]: `ff.rs` carries FFmpeg struct offsets proven against LG's own libraries;
`net` loads `libcurl` at run time; the Makefile builds with the webOS NDK (soft-float ARMv7,
glibc 2.12) and packages an `.ipk`; the storage helper is an LS2 service. The sink reaches the
hardware plane through window/plane verbs that have no public Samsung counterpart.

Useful by-products regardless of approach: the mock PMS (`tests/mock_pms.py`) and fixtures, the
API notes (`docs/pms-api.md`), and the playback-decision tables. These can serve as a test oracle for a new client.

## 4. Samsung platform facts

All [samsung], fetched 2026-10-09.

| Model year | Tizen | Web engine | WebAssembly |
| --- | --- | --- | --- |
| 2017 | 3.0 | Chromium M47 | Not documented as supported |
| 2018 | 4.0 | Chromium M56 | Not documented as supported |
| 2019 | 5.0 | Chromium M63 | Not documented as supported |
| 2020 | 5.5 | M69 | Documented ("from Tizen 5.5 (2020 models) onwards") |
| 2021 | 6.0 | M76 | Yes |
| 2022 / 2023 / 2024 | 6.5 / 7.0 / 8.0 | M85 / M94 / M108 | Yes |
| 2025 / 2026 | 9.0 / 10.0 | M120 / M130 | Yes |

- 2018 Web engine capabilities differ from newer ones in many listed JavaScript/CSS rows (Samsung's table). Transpile and test; do not assume.
- MSE on 2018 is FHD-only; **UHD needs AVPlay** [samsung]. DTS is unsupported on 2018 [samsung].
- AVPlay is a JavaScript API (`webapis.avplay`) driving an `<object type="application/avplayer">`
  element and supports adaptive streaming, extra subtitle formats and 4K/8K [samsung]. Check
  `webapis.productinfo.isUdPanelSupported()` before offering 4K [samsung].
- The 2018 UHD sets (`18TV_PREMIUM`, `18TV_STANDARD1`) list H.264 up to 4096x2160 and HEVC Main 10; other model groups differ, so decisions are per model group, not per year [samsung].
- The Samsung simulator's engine differs from the TV's; final testing is on a TV [samsung].
- Retail install needs a signing certificate whose distributor profile contains the TV's DUID
  (menu: Support > Contact Samsung > Unique Device ID) [samsung].
- Samsung documents Tizen .NET (TizenFX TV) and Flutter for Tizen TV separately [samsung]; which model years they cover, and
  whether they need a partner programme, was **not verified**.
- Store distribution (Seller Office review), enterprise/partner signing, and whether Plex's own
  policies allow a third-party client in the store are **separate, unresolved** questions.
- The Frame is a product line of the same year families; Art Mode, standby and wake lifecycle must be tested separately [inference, **untested**].

Samsung page URLs: see section 8.

## 5. Options

| Option | Reuse | Reaches 2018/2019 | Main risk |
| --- | --- | --- | --- |
| **A. Native port** of this binary | Highest | Not established | No documented public path; no decoder access. Blocked pending written Samsung confirmation |
| **B. Rust core to Wasm + thin Tizen shell + AVPlay** | Data layers (medium) | **No** (Wasm from 2020) | Needs a new transport and a JS UI; still excludes the target sets; reasonable only for a later "2020+" tier |
| **C. New JavaScript client** (ES5-compatible build), AVPlay for playback, optional AVPlay-free `<video>` fallback | Spec, tests, UX design | Yes, in principle | A new product with its own team; the cost is UI performance on M56 and playback adaptation |
| **D. Document and recommend alternatives** | None | n/a | No engineering, but no better experience |

**Incremental native port** is rejected as a first step: its first milestone, a signed binary that
runs, is unproven on public tooling, so every later milestone is speculation.

**Recommended approach: C, informed by the first device probes and subject to a per-model release
gate.** Keep Plex Media Server, libraries and watch progress as the source of truth (server-side
`/:/timeline`, `/:/scrobble` semantics as already documented in `docs/pms-api.md`). A later 2020+
tier may adopt B's Wasm sharing as an optimization, not a prerequisite. Do not introduce a
replacement server.

## 6. Proposed support matrix (engineering targets, not claims)

Terms: **baseline** = documented by Samsung only; **package** = a `.wgt` was produced; **installed**; **playback tested**.
Every cell starts at *baseline*. A cell may be raised only with a dated observation by model and firmware.

| Group | Engine | Playback path | Engineering priority |
| --- | --- | --- | --- |
| 2017 (UHD `17TV_PREMIUM`; others per group) | M47 | AVPlay; MSE limits not yet verified for 2017 | **Development floor**; one UE55MU6172 has probe evidence, not client compatibility evidence |
| 2018 UHD (`18TV_PREMIUM`, `18TV_STANDARD1`) | M56 | AVPlay (UHD), MSE capped at FHD | Priority device-validation tier |
| 2018 FHD | M56 | AVPlay or MSE (FHD) | Validate as a separate capability row |
| 2019 | M63 | AVPlay | Additional engine/model tier |
| 2020+ | M69+ | AVPlay; Wasm possible | Compatibility extension after the baseline |
| The Frame (any year) | by year | As its year, plus Art Mode/standby tests | Separate row, never inferred from the year's other models |
| Pre-2017 | WebKit / Tizen 2.x | Out of scope | Not investigated |

## 7. What would change this conclusion

- Samsung confirming a public native-code route for retail TVs: reopens Option A.
- The PoC failing at playback or HTTPS: stops C for 2018 and narrows scope to 2020+.
- The maintainer completing the OS-neutral port work (L15b): lowers the cost of B.

## 8. Sources

Samsung (all fetched 2026-10-09):
`developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html`,
`.../specifications/media-specifications/2018-tv-video-specifications.html`,
`.../guides/multimedia/media-playback/using-avplay.html`,
`.../guides/multimedia/4k-8k-uhd-video.html`,
`.../extension-libraries/webassembly/webassembly.html`,
`.../getting-started/setting-up-sdk/creating-certificates.html`,
`.../getting-started/using-sdk/tv-device.html`, `.../develop/tizen-net-tv.html`.
The 2018 MSE FHD-only limit and the DTS-unsupported note were re-confirmed on the 2018 video
specifications page. Not re-fetched (carried from the earlier study; **re-verify**): Plex's smart-TV support page.
Upstream: `GLinnik21/plx-native` README, `LICENSING.md`, `docs/module-layers.md`, releases, issues 174 and 249.

The previously mentioned "KROMA" project was an unrelated false lead and is not part of this proposal.
