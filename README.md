# Vemm for Samsung Tizen

**Vemm** (`/vem/`, one syllable) is an independently maintained, unofficial
Plex-compatible media player for Samsung TVs. **No root required.** Plex Media
Server remains responsible for libraries, metadata, authentication and
permissions; Vemm owns the television browsing, playback policy and remote-first
client experience.

Vemm is a working brand, not a claim of completed trademark clearance. The
canonical repository target is `dragoshont/vemm`; this branch remains in
`dragoshont/plx-native` only for review provenance.

**I've tested the client on Tizen 4.0 and newer.** The recorded device checks below distinguish individual runtimes and features; they are not blanket certification of every model or codec.

The UI is inspired by [Gleb Linnik's LG client](https://github.com/GLinnik21/plx-native).
Current source uses original Vemm vector artwork and a restrained dark,
Azure-accented identity while preserving the existing cinematic screen
composition and old-TV performance constraints.

The implementation uses **Tizen Web APIs, HTML/CSS/JavaScript and Samsung AVPlay**.

**[Historical Plx install guide](docs/install-samsung.md)** · **[Vemm architecture](docs/vemm/03-architecture.md)** · **[Identity audit](docs/vemm/08-legacy-identity-audit.md)** · **[Report an issue](https://github.com/dragoshont/vemm/issues)** · **[Tizen TV Builder toolkit](https://github.com/dragoshont/tizen-tv-builder)**

## Release status and installation identity

**No Vemm package has been released.** Vemm uses the separate package/application
identity `VemmTvApp0` / `VemmTvApp0.Vemm`, its own `vemm-tizen-*` local data and
a future Vemm signing author. It will not update, uninstall or import
credentials/preferences from the historical Plx app.

The latest package currently published in this old repository is the historical
[Samsung 0.2.7](https://github.com/dragoshont/plx-native/releases/tag/samsung-v0.2.7),
a **prerelease** that appears as **Plx**. Its install command remains available
for historical users:

```sh
python3 tools/tizen.py install https://github.com/dragoshont/plx-native/releases/download/samsung-v0.2.7/Plx-0.2.7.wgt TV_IP
```

That package is not Vemm. Keep its author certificate only for historical Plx
updates and do not uninstall it to simulate a Vemm migration.

## What Vemm does

- Plex linking, profile and server selection, including a manual server connection.
- Home banners and shelves, libraries, search and detail pages.
- Playback through Samsung AVPlay, with Direct Play/Direct Stream or server-transcode negotiation, resume, seek, tracks, subtitles, chapters and episode controls.
- Local playback, language, library and graphics preferences.

These are implemented features, not a promise that every codec or workflow
works on every TV. See [feature/readiness detail](docs/samsung-upstream-readiness.md)
and [known release and deployment limits](docs/samsung-0.2.7-rollout.md).
Published 0.2.7 has a reported Account D-pad access issue; current main contains
the source fix, but no Vemm release or new named-device acceptance is implied.

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
| `samsung/Vemm/` | Vemm Tizen Web app |
| `tests/tizen/` | Host contracts and DOM journeys |
| `tools/tizen/` | App-specific build checks, synthetic workloads and recorded feasibility probes |
| `samsung/build.py`, `samsung/release.py` | Future versioned Vemm WGT/source build and publication |
| `.github/workflows/samsung.yml` | Samsung host checks, packaging and release workflow |

```sh
npm ci --prefix tests/tizen --ignore-scripts
tools/tizen/test.sh
tools/tizen/build-source.sh samsung/Vemm
```

The build example is unsigned and uses an already-installed Tizen SDK; it does
not sign, publish or establish device acceptance. Use
[building and distribution](docs/building.md),
[the Samsung development process](docs/samsung-tizen-development-process.md)
and [release/transition contract](docs/samsung-project-transition.md) for
signing, matching source archives and immutable versions.

## Independent direction, retained history

This repository is still technically a GitHub fork. The active tree now contains
the Samsung product, tests, app-specific tools and evidence, not the unused LG
Rust/C implementation, native builds or upstream website. **History, release
assets and licensing obligations are preserved**, with immutable native source
references in [the independence plan](docs/samsung-repository-independence-plan.md).
The Samsung Rust/.NET/NaCl experiments remain parked, with
[their actual results retained](docs/samsung-rust-runtime-results.md).

Send Vemm issues to the [canonical repository](https://github.com/dragoshont/vemm/issues)
after it is populated.

Historical repository URLs, package IDs, author continuity, tags and release
filenames are preserved as history. Vemm deliberately uses a new package,
storage, artifact, tag and signing identity. This source work does not deploy
either app. Repository population at `dragoshont/vemm`, fork handling and final
legal clearance remain separate operations.

## Privacy, licensing and attribution

Vemm talks to Plex services and the selected media servers; playback can update
resume/watched state. Saved sign-in credentials use **unencrypted local Web
storage**. No analytics or crash-upload feature is enabled. See
[data handling](PRIVACY.md).

Source remains **[GPL-3.0-or-later](LICENSE)** with inherited copyright and third-party notices intact. The Samsung implementation and toolkit are maintained separately in this repository and [Tizen TV Builder](https://github.com/dragoshont/tizen-tv-builder).

The toolkit's MIT licence does not relicense this app or its adapters. Inherited identity and artwork restrictions remain separate from the source licence: read [TRADEMARKS.md](TRADEMARKS.md), [LICENSING.md](LICENSING.md) and [third-party notices](THIRD-PARTY-NOTICES.md).

This unofficial project is not affiliated with, endorsed by or sponsored by Plex, Samsung, LG or the original UI project's maintainer. Product and service names identify their respective owners.
