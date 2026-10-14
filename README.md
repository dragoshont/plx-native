# Plex client for Samsung Tizen

An independently maintained, unofficial Plex client for Samsung TVs. **No root required.** It uses Samsung's platform-native acceleration through the supported Tizen Web stack: GPU-composited UI layers for movement and fades, WebGL for optional graphics, and AVPlay for platform video playback rather than a JavaScript video decoder.

**I've tested the client on Tizen 4.0 and newer.** The recorded device checks below distinguish individual runtimes and features; they are not blanket certification of every model or codec.

The UI is inspired by [Gleb Linnik's LG client](https://github.com/GLinnik21/plx-native).

The implementation uses **Tizen Web APIs, HTML/CSS/JavaScript and Samsung AVPlay**.

**[Install on Samsung](docs/install-samsung.md)** · **[Samsung releases](https://github.com/dragoshont/plx-native/releases?q=samsung-v)** · **[Report a Samsung issue](https://github.com/dragoshont/plx-native/issues)** · **[Tizen TV Builder toolkit](https://github.com/dragoshont/tizen-tv-builder)**

## Install and update

Use the [step-by-step guide](docs/install-samsung.md). You need a computer on the same network, Samsung Developer Mode and a signing profile that covers your TV. **No root or Homebrew Channel is required.** Developer installation is not Samsung Store approval.

The current release is [Samsung 0.2.7](https://github.com/dragoshont/plx-native/releases/tag/samsung-v0.2.7), a **prerelease**. From the Tizen TV Builder checkout, after setup and certificate configuration:

```sh
python3 tools/tizen.py install https://github.com/dragoshont/plx-native/releases/download/samsung-v0.2.7/Plx-0.2.7.wgt TV_IP
```

Keep your existing author certificate for updates. Do not uninstall a working app to work around a signing mismatch. The existing `PlxNative0.Plx` application ID, release filenames and repository URL are retained for update/link compatibility, not used as the independent project's branding.

## What the Samsung client does

- Plex linking, profile and server selection, including a manual server connection.
- Home banners and shelves, libraries, search and detail pages.
- Playback through Samsung AVPlay, with Direct Play/Direct Stream or server-transcode negotiation, resume, seek, tracks, subtitles, chapters and episode controls.
- Local playback, language, library and graphics preferences.

These are implemented features, not a promise that every codec or workflow works on every TV. See [feature/readiness detail](docs/samsung-upstream-readiness.md) and [known release and deployment limits](docs/samsung-0.2.7-rollout.md). The Account icon's D-pad access is a reported unresolved issue in 0.2.7; the performance fixture accessed Settings programmatically, so it did not validate that remote-navigation path.

## Hardware acceleration: what works, and what did not help

**The existing interface already uses accelerated browser compositing.** Home movement uses `translate3d`; our device probes observed compositor promotion and accelerated scrolling on the Q80C. GPU compositing moves and combines UI layers; it does not mean all JavaScript, layout, image decoding or painting runs on the GPU.

Samsung's Web runtime also provides **WebGL**, the browser's OpenGL ES-based drawing API. We verified real shader/texture draws and pixel readback on the Q80C, QN70F, MU6172 and one RU7092, with driver-reported Mali backends. This is browser graphics access, not unrestricted native EGL/GLES access; GPU counters and execution time were not measured.

0.2.7 adds **Settings → Graphics → New graphics enhancements**, **OFF by default**. It selects an optional WebGL renderer for Home/Detail background artwork, with a shared backend, resource limits and automatic fallback. It does not turn the whole TV's GPU on or off; existing Home compositing and AVPlay remain unchanged.

**The new artwork path was slower in our matched OFF/ON tests. Keep it OFF for performance.**

| Measured median artwork-ready time | New option OFF | New option ON |
| --- | ---: | ---: |
| Living-room Q80C: Home banner | 332 ms | 359 ms |
| Living-room Q80C: Detail background | 398 ms | 442 ms |
| 2017 MU6172: Home banner | 23 ms | 344 ms |
| 2017 MU6172: Detail background | 55 ms | 203 ms |

These are within-TV comparisons using the exact published app with synthetic artwork, not a ranking of TVs or a 0.2.6-versus-0.2.7 comparison. The new path creates a context and uploads a texture for each replacement; that extra synchronous work was measured. There was no consistent navigation gain. Ready-state/callback timings are **not panel FPS or GPU execution time**.

AVPlay is the existing platform playback path. These graphics experiments did not measure codec/VPU counters, HDR, audio, video-plane composition or server-side hardware transcoding. Those require separate evidence.

Read the [full OFF/ON results](docs/samsung-027-graphics-performance.md), [acceleration assessment](docs/samsung-acceleration-assessment.md) and [optional backend contract](docs/samsung-optional-graphics.md).

## TVs and compatibility

The maintainer reports testing on **Tizen 4.0 and newer**. The retained automated/device evidence below covers Tizen 5.0 and 9.0, plus additional legacy checks on **2017 / Tizen 3.0**. The Tizen 4.0 statement is owner-reported rather than a newly collected benchmark result. Shipped JavaScript remains conservative ES5-compatible. Model year is not a capability test; newer sets can receive OS upgrades.

| Observed model | Current runtime in the recorded run | Scope of evidence |
| --- | --- | --- |
| UE55MU6172, 2017 | Tizen 3.0 | Optional graphics/lifecycle checks and OFF/ON benchmark; 0.2.7 installed version verified |
| UE43RU7092UXXH, 2019 | Tizen 5.0 | One set passed graphics/lifecycle checks, but its stopped test-app registration could not be removed through the SDK; another set's update was acknowledged without installed-version proof |
| QE65Q80CATXXH, Q80C | Tizen 9.0 | Graphics/lifecycle checks, OFF/ON benchmark and installed 0.2.7 version verified |
| QE55QN70FAUXXH, QN70F | Tizen 9.0 | Graphics/lifecycle checks and installed 0.2.7 version verified |

Two distinct RU7092 devices were observed: four model generations, **five device identities**, with different acceptance states. This is not blanket support for every TV from 2017 onward. [The named-device register](docs/samsung-graphics-device-matrix.md) records firmware, actual checks, failed attempts and cleanup exceptions.

## Built and measured with our Tizen toolkit

[Tizen TV Builder](https://github.com/dragoshont/tizen-tv-builder) is the separate toolkit we built for discovery, developer connection/setup, signing, installation, inspection and safe serial device sessions. Its Python CLI and local portal were used to develop and deploy this client. AI assistance is optional; the CLI does not require an AI subscription.

Our [reproducible app benchmark](tools/tizen/graphics-benchmark/README.md) uses the exact released app code with inert Plex adapters, synthetic images and in-memory settings. It repeats Home, Detail and navigation work in **OFF / ON / ON / OFF** order, retains warmups and original samples, and separates main-thread/API timing from graphics correctness.

**The reusable benchmark is now implemented in the toolkit:** [`benchmark run`, `validate` and `summarize`](https://github.com/dragoshont/tizen-tv-builder/blob/e09c9f345170c7ada8309fc9be95ae8ae38e85e8/docs/benchmark.md). It is available at that pinned commit on `dragoshont-reusable-tv-benchmark-toolkit`, not yet in the toolkit's default branch or a newly released plugin. The GPL-licensed application workload stays here and connects through a tested adapter. This keeps the MIT toolkit useful for other TV apps without copying this app's screens, credentials or business logic into it. See [the transition record](docs/samsung-project-transition.md) for delivery and licensing boundaries.

## Development and deployment

The maintained Samsung surfaces are:

| Path | Responsibility |
| --- | --- |
| `samsung/PlexTv/` | Shipped Tizen Web app |
| `tests/tizen/` | Host contracts and DOM journeys |
| `tools/tizen/` | App-specific build checks, synthetic workloads and recorded feasibility probes |
| `samsung/build.py`, `samsung/release.py` | Versioned WGT build and existing-author publication |
| `.github/workflows/samsung.yml` | Samsung host checks, packaging and release workflow |

```sh
npm ci --prefix tests/tizen --ignore-scripts
tools/tizen/test.sh
python3 samsung/build.py 0.2.7
```

The build example makes a local package; it does not publish or establish device acceptance. Use [the Samsung development process](docs/samsung-tizen-development-process.md) and [release/transition contract](docs/samsung-project-transition.md) for signing, immutable versions and verification. Do not use the retained LG `.ipk` release instructions to publish a Samsung `.wgt`.

## Independent direction, retained history

This repository is still technically a GitHub fork. Independent maintenance does not require rewriting its history. LG Rust/C sources, documentation and licence notices remain as inherited/reference material; **this project's product direction and deployment target are Samsung**. The experimental Rust/.NET/NaCl work is parked, with [its actual results retained](docs/samsung-rust-runtime-results.md).

Send Samsung-specific issues to [this repository](https://github.com/dragoshont/plx-native/issues). Retained LG material is reference/history, not the product maintained here.

The URL and installed display/package names are preserved during transition. A distinct long-term name/artwork and any GitHub fork detachment are separate migration steps; no new branding rights or completed detachment are implied.

## Privacy, licensing and attribution

The Samsung app talks to Plex services and the selected media servers; sample playback can still update resume/watched state. Saved sign-in credentials use **unencrypted local Web storage**. No analytics or crash-upload feature is enabled in the Samsung client. See [Samsung data handling](samsung/PRIVACY.md); the retained root privacy document describes the LG implementation, not this package.

Source remains **[GPL-3.0-or-later](LICENSE)** with inherited copyright and third-party notices intact. The Samsung implementation and toolkit are maintained separately in this repository and [Tizen TV Builder](https://github.com/dragoshont/tizen-tv-builder).

The toolkit's MIT licence does not relicense this app or its adapters. Inherited identity and artwork restrictions remain separate from the source licence: read [TRADEMARKS.md](TRADEMARKS.md), [LICENSING.md](LICENSING.md) and [third-party notices](THIRD-PARTY-NOTICES.md).

This unofficial project is not affiliated with, endorsed by or sponsored by Plex, Samsung, LG or the original UI project's maintainer. Product and service names identify their respective owners.
