# Samsung Tizen platform probes: test register and observed results

Part of the [Samsung feasibility study](samsung-tizen-feasibility.md). The initial probes have been
run on one physical 2017 TV; the test register distinguishes measured results from pending
compatibility and product checks. They are not a full Plex client and do not establish broad
Samsung support. Product requirements and full-app implementation are tracked in the
[client specification](samsung-tizen-client-spec.md); reusable development tooling is tracked in
the [Tizen development process](samsung-tizen-development-process.md).

## Purpose

Record device evidence for the JavaScript/AVPlay approach and keep it available as a compatibility
test oracle for the full client. These probes test Samsung's platform, not PlxNative code, and they
must not change the LG app.

## Inputs to collect first (ask the owner)

Exact model code, year, region, firmware, whether it is The Frame, whether 4K is supported
(`isUdPanelSupported()`), and a Plex Media Server (test library only) reachable on the LAN over HTTP and HTTPS.

## Initial probe constraints

- The initial platform feasibility work used small throwaway `.wgt` probes outside the LG app's
  source; those are not the product architecture or code-size limit.
- No rooting, firmware changes, store submission, or TLS bypasses.
- No claims of Samsung support in any README or site until a matrix cell is raised by observation.

## Probes and criteria

For repeatable validation, run each probe 3 times on the same TV, cold start each time. Historical
results below state their actual sample counts. Record the model, firmware and date.

| # | Probe | Measure | Go | Stop |
| --- | --- | --- | --- | --- |
| P0 | Hello app installs and launches | Install succeeds; `userAgent` and screen size recorded | Works | Cannot install after fixing certificate/DUID issues |
| P1 | AVPlay H.264 1080p direct stream from the test PMS (HTTP) | Time to first frame; plays 10 minutes without stall | First frame within 5 s, 0 unrecovered stalls | Does not start, or more than 1 stall per 10 min |
| P2 | AVPlay HEVC Main 10 4K (UHD sets only) | Plays; seek lands within 2 s of target; pause/resume works | Plays and seeks | Fails to decode a stream Samsung lists as supported |
| P3 | Audio: AAC, AC-3/E-AC-3; DTS control | Which tracks play; what the error is for unsupported ones | Supported tracks produce audio and unsupported formats fail cleanly; DTS core decoded on the tested 2017 set, while failure on models where DTS is unsupported remains unverified. | Silence or a hang with no error |
| P4 | Subtitles: embedded text, external SRT, image-based | Which render, with what delay | At least one text format works | None render |
| P5 | HTTPS to the PMS (plex.direct certificate) and to plex.tv | Request succeeds without disabling verification | Succeeds | Certificate failure with no documented workaround |
| P6 | DOM UI: 200-poster grid scrolled with the remote | Frames per second by script timing; key-to-motion latency; memory after 5 minutes | Median latency 150 ms or less; no crash | Latency over 400 ms, or the app is killed |
| P7 | Resume and progress | Position reported to the PMS timeline endpoint on a test item and read back | Server shows updated viewOffset | Cannot report progress |
| P8 | Lifecycle (The Frame only) | App state after standby, Art Mode, wake, and a TV restart | App resumes or restarts cleanly | Black screen or stuck app after wake |

## Decision

- **Implementation direction:** selected web app + AVPlay approach has useful initial evidence on
  the 2017 set and is the basis of the owner-requested full-client specification. This is not a
  compatibility release gate. P7, repeated cold-start coverage, a 10-minute UHD stability run, and
  results on other model/firmware tiers remain open.
- **Re-scope:** P1 and P5 pass, but P6 fails: restrict to 2019+ or to a simpler UI. P5 fails only on
  the PMS certificate: document a workaround and test it before any further investment.
- **Stop:** P0, P1 or P5 fails with no workaround; record the reason and recommend Option D.

## Deliverables

A private notes file (device identifiers redacted) and a public results table with model group,
firmware, date, per-probe numbers, and the matrix state reached. Raise a cell in the feasibility study's support
matrix only for the model groups actually tested.

## Available test TVs (from rear labels, 2026-10-09)

Model codes were read from photographed rear labels; serial numbers are deliberately omitted. Year comes from the
model-code letter (M=2017, R=2019, C=2023, F=2025) and the Tizen/Chromium column from Samsung's published
per-year table. Firmware was **not** observed: record it from Settings > Support > About This TV before any probe.

| # | Model code | Year | Tizen / Chromium (ceiling for that year) | Notes |
|---|---|---|---|---|
| 1 | UE43RU7092 | 2019 | 5.0 / M63 | 43" UHD; no Wasm (documented from Tizen 5.5) |
| 2 | UE43RU7092 | 2019 | 5.0 / M63 | Same model as #1; use as a control pair |
| 3 | UE55MU6172 | 2017 | 3.0 / M47 | **The support floor**; no Wasm (observed), oldest JS engine; P0, P1, P5 passed; DTS decodes; UHD HEVC/HDR10, E-AC-3 and embedded subtitles play |
| 4 | QE65Q80C | 2023 | 7.0 / M94 | Wasm-capable |
| 5 | QE55QN70F | 2025 | 9.0 / M120 | Wasm-capable; label partly blurred, confirm model |

None is a The Frame, so Art Mode/lifecycle (P8) stays untested. No 2018, 2020-22 or 2024 set is owned.
Next compatibility targets: #1/#2 (2019 control pair), then #4 (2023), then #5 (2025), subject to
the owner's authorization and TV availability. The 2017 set supplies the current oldest-engine
evidence but does not by itself decide the support floor for other 2017 model groups.

Observed on #3 (2026-10-09), Developer Mode, via `sdb capability`: platform/product version 3.0, `cpu_arch`
armv7, `sdbd` 2.2.31 (plugin 3.2.5_TV_REL), `rootonoff_support` disabled, `filesync_support` push only,
`intershell_support` disabled, `can_launch` tv-samsung. This confirms Developer Mode gives no root or
general shell, which the native-port option (Option A) would need.

### P0 result on #3 (2026-10-09): pass

A minimal `.wgt` (Samsung-type certificate with this TV's DUID, `internet` and `productinfo` privileges)
installed and launched, and reported back over HTTP to the Mac. Firmware `T-KTMDEUC-1410.1`, model code
`17_KANTM_UHD_BASIC`. One run, not yet the three cold starts the method asks for.

| Observed | Value |
|---|---|
| `navigator.userAgent` | `Mozilla/5.0 (SMART-TV; LINUX; Tizen 3.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/3.0 TV Safari/538.1` |
| Viewport / screen | 1920x1080, devicePixelRatio 1 (the UI layer is FHD; UHD is the video plane only) |
| `productinfo.isUdPanelSupported()` | true |
| `webapis.avplay`, `tizen` | present |
| `MediaSource` | present; `isTypeSupported` true for H.264 and HEVC (claims only; nothing played yet) |
| `fetch`, `Promise` | present |
| `WebAssembly` | **absent** (confirms Option B cannot cover 2017) |
| ES2015 | arrow functions work; `class`/`let` outside strict mode is a SyntaxError; `async function` is a SyntaxError |

The `class`/`let` error text is V8's pre-M49 wording, consistent with the documented M47 engine despite the
WebKit-style user agent. A 2017 client must therefore be transpiled to ES5 (or strict-mode ES2015 without
`async`), with polyfills checked on the set.

The install failed with `install failed[118]` until the TV was given the certificate with `tizen
install-permit` (Device Manager's "Permit to install applications"). Before that step was found, a 2025 Samsung
CA change was suspected; that hypothesis is **refuted** for this set: a certificate issued under the
2025 "VD DEVELOPER Public CA Class" and "Samsung VD Author CA" installs on 2017 firmware.

### P1 and P5 results on #3 (2026-10-09): pass

A second `.wgt` (ES5, `internet` privilege only) ran the P5 requests and then direct-played one episode from
the owner's PMS on the LAN through `webapis.avplay` into a full-screen `<object type="application/avplayer">`.
It did not report a Plex timeline, so it wrote no watch state. The probe sent its results to the Mac by HTTP.
This is one run; the method asks for three.

| Probe | Observed |
|---|---|
| P5 PMS over HTTPS (`*.plex.direct`, certificate verified by the engine) | `/identity` 200 in 538 ms; the TV resolved the plex.direct name |
| P5 PMS over HTTP (LAN IP) | `/identity` 200 in 15 ms |
| P5 plex.tv over HTTPS | `/api/v2/user` 200 in 558 ms |
| P1 source | MKV, H.264 High 1920x1080, about 16 Mbps, AC-3 5.1 plus DTS-HD MA 5.1; direct play over **HTTPS**, no transcode, `X-Plex-Token` in the query |
| P1 `prepareAsync` to prepared | 1367 ms |
| P1 time to first frame (`oncurrentplaytime` > 0 after `play`) | 2379 ms (pass: under 5 s) |
| P1 playback | 626 s of media time over a 630 s window; **0 stalls**, 0 errors (pass) |
| Tracks reported (`getTotalTrackInfo`) | `h264` 1920x1080; `ac3` 6 ch 48 kHz; `dts` 6 ch 48 kHz |
| Default audio | AC-3 track; owner confirmed picture and sound normal (owner-observed, on the set) |

The later P3 run showed that DTS core decodes on this set. The MKV container played through AVPlay
without remuxing, which favours Option C's direct-play path.

### P3 and playback-control results on #3 (2026-10-09)

Same item and HTTPS URL as P1. The probe ran timed phases (shown on screen) and posted each event to the Mac.
Two complete runs; the second is the one in the table, and the first agreed on every row it measured.

| Observed | Value |
|---|---|
| Default audio after `prepareAsync` | AC-3 (`AUDIO#1`) |
| `setSelectTrack('AUDIO', 2)` **before** `play()` | throws `PLAYER_ERROR_INVALID_OPERATION`; the stream stays on AC-3 |
| `setSelectTrack('AUDIO', 2)` **during** playback | succeeds; `getCurrentStreamInfo` reports `dts` 6 ch 48 kHz 1536 kbps; state PLAYING; no error |
| Sound on the DTS track | owner heard normal sound, with a slight level change at the switch (owner-observed) |
| Switch back to AC-3 during playback | succeeds |
| Forward seek 0:38 to 5:00 (`seekTo`) | playback position within 0.9 s of the target after 0.35 s; success callback after 1.2 s |
| Pause for 4 s | state PAUSED, position drift 0 |
| Resume | state PLAYING, 3.8 s of media advanced in 4 s |
| Backward seek by 30 s | landed 2.8 s **before** the target after 1.8 s (keyframe snap, presumably) |

Two findings. First, DTS (core, from a DTS-HD MA track) **decodes on this 2017 set**. That is consistent with Samsung's note that DTS was removed from 2018 models, so the P3 "DTS fails cleanly" check must be run on the 2019+ sets. Second, the audio track is chosen after playback starts, not between prepare and play. The backward seek misses P2's 2 s window. A client should treat seek as keyframe-accurate and show the landed position, not the requested one.

### P2 and P4 results on #3 (2026-10-09)

Three 4K items from the owner's library, each direct-played from its HTTPS part URL, as in P1. Case B was run twice and C three times; the timings agreed.

| Case | Content | Prepared | First frame | Stalls | Notes |
|---|---|---|---|---|---|
| A | HEVC Main 10 SDR 3840x1600, about 7 Mbps, AAC 5.1 | 1.2 s | 1.7 s | 0 in 75 s | AAC reported as `mpeg` by AVPlay |
| B | HEVC Main 10 HDR10 3840x2160, about 57 Mbps, AC-3 5.1 and stereo | 1.2-1.3 s | 1.8 s | 0 in 90 s | Owner saw HDR; switched to the AC-3 stereo track at 20 s with no error |
| C | HEVC 8-bit 3840x1600, about 15 Mbps, E-AC-3 5.1, embedded SRT | 0.65-0.76 s | 1.8-2.3 s | 1, at the subtitle switch and seek | Subtitles via `onsubtitlechange`; owner saw them |

| Observed | Value |
|---|---|
| UHD playback mode | Plain `open` / `prepareAsync` worked for every case; the `SET_MODE_4K` fallback was never needed |
| HDR10 | Owner saw HDR on case B (Owner-observed) |
| E-AC-3 5.1 | Default track on case C; plays |
| Embedded text subtitles | `setSelectTrack('TEXT', n)` during playback, then `seekTo` 10:00, then select the track again; `onsubtitlechange` delivered 35 events (17 with text, e.g. "Hey.", "Game over, man."), and the page drew them (Observed and Owner-observed) |
| External SRT | `GET /library/streams/<id>` with the token: 200, 99 KB, 1618 cues, 146-603 ms. The probe fetched and parsed it but did not render it |
| Aspect ratio | With only `setDisplayRect(0,0,1920,1080)`, 2.40:1 content was stretched to fill 16:9 (Owner-observed). Calling `setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')` gave correct bars and proportions (Owner-observed) |

The 2017 set's hardware decoder played all three UHD HEVC variants, including 57 Mbps HDR10. This is the capability that MSE lacks on 2018 sets (FHD-only), so it confirms AVPlay as the playback path. The client must set a display method explicitly; the default stretches. The runs were 75-90 s, so the 10-minute UHD stability criterion is still open.

### P6 results on #3 (2026-10-09, automatic part only)

A plain DOM page (no framework), with 7 columns of 240x360 posters. Each poster is a server-resized image from `/photo/:/transcode`, the focused one gets an outline and scale, and the grid scrolls with a CSS `transform`. Latency is measured from a focus change until two animation frames later.

| Observed | Value |
|---|---|
| Engine | Tizen 3.0, AppleWebKit/538.1, 1920x1080 at DPR 1; JS heap 10 MB used of a 756 MB limit |
| Films section list (JSON, first 200 items) | 170 items, 405 KB, fetched in 455 ms, parsed in 36 ms |
| DOM build for 170 tiles | 189 ms |
| Posters loaded | 169 of 170 in 1.24 s (1 failed) |
| Automatic focus moves (62, including 25 row scrolls each way) | median 49 ms, p95 108 ms, max 132 ms |

The automatic run meets the 150 ms median criterion. The manual test, a person pressing and holding arrow keys and judging the feel, was not run: TV work stopped here.

## Test register

Each run of each test is recorded here, so later sets (2019, 2023, 2025, a The Frame) are measured the same
way. Evidence types: **Observed** means measured by the probe and logged; **Owner-observed** means a person
watching the set reported it. The probes are throwaway `.wgt` apps kept outside the repo, because they embed
a Plex token. Their behaviour is described here precisely enough to rebuild them.

| ID | Test | Steps | Pass criteria | #3 2017 UE55MU6172 (T-KTMDEUC-1410.1) |
|---|---|---|---|---|
| T0.1 | Install and launch | Package with the Samsung certificate (TV's DUID); `install-permit`; install; run | Installs and launches | Pass, 1 run (Observed) |
| T0.2 | Engine capabilities | Report the user agent, screen size, `webapis`, `MediaSource`, `fetch`, `Promise`, `WebAssembly`, and ES2015 syntax | Recorded | Recorded: no Wasm, no `async`, ES5 target (Observed) |
| T5.1 | PMS over HTTPS (plex.direct) | `GET /identity` with `X-Plex-Token` | 200 with the engine's normal certificate checks | Pass, 538 ms (Observed) |
| T5.2 | PMS over LAN HTTP | `GET http://<pms>:32400/identity` | 200 | Pass, 15 ms (Observed) |
| T5.3 | plex.tv over HTTPS | `GET https://plex.tv/api/v2/user` | 200 | Pass, 558 ms (Observed) |
| T1.1 | AVPlay direct play, 1080p H.264 MKV, HTTPS | `open` the part URL with the token; `prepareAsync`; `play`; full-screen display rect | First frame within 5 s | Pass, 2.4 s; prepared in 1.4 s (Observed) |
| T1.2 | 10-minute stability | Keep playing, logging buffering events every 15 s | 0 unrecovered stalls, 0 errors | Pass, 626 s, 0 stalls, 0 errors (Observed) |
| T1.3 | Picture and sound quality | A person watches T1.2 | No visible or audible defects | Pass: "image is perfect", sound normal (Owner-observed) |
| T3.1 | Default audio track | `getCurrentStreamInfo` after `play` | A supported track is chosen | AC-3 chosen (Observed) |
| T3.2 | Select a track before `play` | `setSelectTrack('AUDIO', n)` between prepare and play | Works, or the API constraint is documented | Throws `INVALID_OPERATION` (Observed); documented as a constraint |
| T3.3 | Switch to DTS during playback | `setSelectTrack` to the DTS track 5 s in; hold for 35 s | 2017: plays. 2018+: fails cleanly, with an error and no hang | 2017: plays, `dts` active, sound heard (Observed and Owner-observed) |
| T3.4 | Switch back to AC-3 | `setSelectTrack` to the AC-3 track | Plays | Pass (Observed) |
| T3.5 | AAC, E-AC-3 | Play items whose default track is AAC or E-AC-3 | Plays | Pass: AAC 5.1 and E-AC-3 5.1 (Observed) |
| T2.1 | Forward seek | `seekTo` 5:00 from about 0:38 | Lands within 2 s; playing within 2 s | Pass: 0.9 s off, after 0.35 s (Observed) |
| T2.2 | Backward seek | `seekTo` 30 s back | Lands within 2 s | **Miss**: 2.8 s early after 1.8 s (Observed); probably a keyframe snap |
| T2.3 | Pause and resume | `pause` for 4 s, then `play` | No drift while paused; playback resumes | Pass: drift 0, 3.8 s in 4 s (Observed) |
| T2.4 | HEVC Main 10 UHD | As T1.1 with a 4K HEVC 10-bit item | First frame within 5 s; 10 min with no stall | First frame 1.7 s, 0 stalls in 75 s (Observed); 10-minute run still open |
| T2.5 | HDR10 UHD at high bitrate | As T2.4 with a 57 Mbps HDR10 item | First frame within 5 s; no stall; HDR shown | First frame 1.8 s, 0 stalls in 90 s, two runs (Observed); HDR seen (Owner-observed) |
| T2.6 | Aspect ratio | Play 2.40:1 content full screen with `setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')` | Letterboxed with correct proportions | Pass (Owner-observed). Without it, the picture is stretched |
| T4.1 | Embedded text subtitles | `setSelectTrack('TEXT', n)` during playback; draw the `onsubtitlechange` text in a page overlay | Cues arrive and are visible | Pass: 17 text cues in about 60 s (Observed); visible (Owner-observed). One stall at the switch and seek |
| T4.2 | External SRT | Fetch `/library/streams/<id>`, parse it, and draw it against `getCurrentTime` | Renders in sync | Fetch and parse pass: 200, 1618 cues (Observed); rendering not built |
| T4.3 | Image subtitles (PGS/VobSub) | Select an image subtitle track | Renders, or fails cleanly so the server can burn it in | Not run |
| T6.1 | Library grid load | Fetch the section list (JSON); build a DOM grid; load server-resized posters | List and grid within 2 s | Pass: list 0.46 s, DOM 0.19 s, 169/170 posters in 1.24 s (Observed) |
| T6.2 | Focus latency, scripted | 62 scripted moves; time from focus change to the second animation frame | Median 150 ms or less | Pass: median 49 ms, p95 108 ms, max 132 ms (Observed) |
| T6.3 | Focus latency and feel, by hand | Press and hold the arrow keys for 30 s, then OK | Median 150 ms or less; feels smooth | Not run |
| T7.x | Progress report and read-back | | Server shows the new `viewOffset` | Not run: waiting for the owner to pick an item it may write to |
| T8.x | The Frame lifecycle | | App resumes after Art Mode | Not run: no The Frame set |

Owner-reported (2026-10-09, not independently observed): the official Plex app works on all five sets, so each
has a working network path to the owner's PMS. Use it as the comparison baseline for P2-P7 (same titles, same
server). It does not show what a third-party web client can do, since Plex's app may use platform APIs and
engine paths a `.wgt` cannot.
