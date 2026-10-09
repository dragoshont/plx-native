# Samsung Tizen proof of concept: bounded plan and go/no-go criteria

Part of the [Samsung feasibility study](samsung-tizen-feasibility.md). **Not started. It needs the
owner's explicit authorisation, a physical TV, and its model code and firmware.** Prerequisites are
in [samsung-getting-started.md](samsung-getting-started.md).

## Purpose

Decide with measurements whether a JavaScript/AVPlay Plex client is viable on a 2017+ Samsung set (2017, Tizen 3.0 / M47, is the floor),
before any product code exists. It tests Samsung's platform, not PlxNative code, and it must not change
the LG app.

## Inputs to collect first (ask the owner)

Exact model code, year, region, firmware, whether it is The Frame, whether 4K is supported
(`isUdPanelSupported()`), and a Plex Media Server (test library only) reachable on the LAN over HTTP and HTTPS.

## Scope and limits

- Time box: about 3 working days after the TV is in Developer Mode. Hard stop at 5.
- Code limit: one throwaway `.wgt`, about 500 lines, in a directory outside the LG app's source. No Plex sign-in beyond a test account or token.
- No rooting, firmware changes, store submission, or TLS bypasses.
- No claims of Samsung support in any README or site until a matrix cell is raised by observation.

## Probes and criteria

Each probe is run 3 times on the same TV, cold start each time. Record the model, firmware and date.

| # | Probe | Measure | Go | Stop |
| --- | --- | --- | --- | --- |
| P0 | Hello app installs and launches | Install succeeds; `userAgent` and screen size recorded | Works | Cannot install after fixing certificate/DUID issues |
| P1 | AVPlay H.264 1080p direct stream from the test PMS (HTTP) | Time to first frame; plays 10 minutes without stall | First frame within 5 s, 0 unrecovered stalls | Does not start, or more than 1 stall per 10 min |
| P2 | AVPlay HEVC Main 10 4K (UHD sets only) | Plays; seek lands within 2 s of target; pause/resume works | Plays and seeks | Fails to decode a stream Samsung lists as supported |
| P3 | Audio: AAC, AC-3/E-AC-3; DTS control | Which tracks play; what the error is for unsupported ones | AAC and AC-3 work; DTS fails cleanly | Silence or a hang with no error |
| P4 | Subtitles: embedded text, external SRT, image-based | Which render, with what delay | At least one text format works | None render |
| P5 | HTTPS to the PMS (plex.direct certificate) and to plex.tv | Request succeeds without disabling verification | Succeeds | Certificate failure with no documented workaround |
| P6 | DOM UI: 200-poster grid scrolled with the remote | Frames per second by script timing; key-to-motion latency; memory after 5 minutes | Median latency 150 ms or less; no crash | Latency over 400 ms, or the app is killed |
| P7 | Resume and progress | Position reported to the PMS timeline endpoint on a test item and read back | Server shows updated viewOffset | Cannot report progress |
| P8 | Lifecycle (The Frame only) | App state after standby, Art Mode, wake, and a TV restart | App resumes or restarts cleanly | Black screen or stuck app after wake |

## Decision

- **Go (2017+ tier; evaluate on the 2017 set, and per tier on 2019/2023/2025):** P0, P1, P5, P6 and P7 pass, and at least one of P2/P3 passes on a UHD model.
  Proceed to a written product design, not to an implementation of the full app.
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
| 3 | UE55MU6172 | 2017 | 3.0 / M47 | **The support floor**; no Wasm (observed), oldest JS engine; P0 passed |
| 4 | QE65Q80C | 2023 | 7.0 / M94 | Wasm-capable |
| 5 | QE55QN70F | 2025 | 9.0 / M120 | Wasm-capable; label partly blurred, confirm model |

None is a The Frame, so Art Mode/lifecycle (P8) stays untested. No 2018, 2020-22 or 2024 set is owned.
First PoC target: #1 (2019, pipeline proof), then #3 (2017, the floor), then #4. The 2017 set decides the floor: if P0/P1/P5/P6 fail there, raise the floor to 2019 and say so.

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

Owner-reported (2026-10-09, not independently observed): the official Plex app works on all five sets, so each
has a working network path to the owner's PMS. Use it as the comparison baseline for P2-P7 (same titles, same
server). It does not show what a third-party web client can do, since Plex's app may use platform APIs and
engine paths a `.wgt` cannot.
