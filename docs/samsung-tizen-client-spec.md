# Samsung Tizen Plex client: product specification

**Status:** implementation spec draft, 2026-10-09
**Product target:** a full Samsung Smart TV Plex client with feature parity to the supported
PlxNative feature set, not a proof-of-concept app. Implementation may land in vertical slices; the
completed product is not reduced to the first slice.
**Platform direction:** a separate Samsung Tizen TV Web application (`.wgt`), JavaScript delivered
as an ES5-compatible bundle for the oldest intended engine, and AVPlay for the hardware playback
path. Keep the existing LG webOS application and build unchanged.

This document is the product and acceptance contract for implementation. Samsung evidence and
model-specific results live in the [feasibility study](samsung-tizen-feasibility.md) and
[test register](samsung-tizen-poc.md). The cross-app tooling and repeatable development workflow
are specified separately in the [Samsung Tizen development process](samsung-tizen-development-process.md).
A requirement marked **TBD** is not a permission to invent a platform capability; resolve it with
Samsung documentation, an emulator probe, or a test on the named retail model before depending on
it.

**Implementation status:** `samsung/PlexTv/` is a separate Tizen 3.0 Web app generated from
Samsung's `BasicEmptyProject`. Its initial development slice accepts a PMS origin and an optional
server token in memory, then reads Home hubs, library sections and paged section items. It does
not yet implement Plex QR sign-in, persistent credentials, media details or playback. The
JavaScript/API tests and Samsung package build pass locally; the installed Samsung emulator has not
launched on this Apple-Silicon host, so no emulator UI/runtime claim is made.

## 1. Product outcome

Deliver a couch-usable Samsung Tizen TV app that signs into Plex, connects to the user's own or
shared Plex Media Servers, browses and searches their libraries, and plays media while keeping Plex
as the authority for libraries, watch state, and playback progress. The app must neither replace
PMS nor silently write viewing state outside normal, user-initiated playback and explicitly
approved tests.

The baseline is the feature set PlxNative actually ships, not all products in Plex's ecosystem.
Its current scope is movies and television shows, including their seasons and episodes. Music,
photo libraries, live TV/DVR, Plex's catalogue and Watchlist are explicitly out of scope for this
initial product. Any proposed change to that boundary requires a product decision, not an
implementation convenience.

## 2. Intended compatibility and evidence policy

- Intended target floor: Samsung Tizen TVs from model year 2017 onward, initially covering the
  owner's 2017, 2019, 2023 and 2025 sets. 2017 Tizen 3 / Chromium M47 is the oldest observed
  development target, not a compatibility guarantee for every 2017 model.
- The first implementation bundle must run without WebAssembly and without relying on JavaScript
  syntax newer than the 2017 target supports. Transpile and test the shipped bundle as ES5; use
  capability detection for optional APIs.
- Maintain a support row per tested model code, firmware, engine and meaningful model group.
  Emulator results are reported separately from retail-device results. Do not claim a year or
  product line supported from a single model's result.
- Use Samsung's TV emulator for package, runtime, navigation and lifecycle development where its
  model image exposes the behavior. Use named retail TVs for codec/HDR/audio/subtitle output,
  device memory and performance, suspend/resume, and any emulator gap.
- The initial target is all Samsung TVs on which the app passes its declared baseline matrix; it is
  not permission to promise universal 2017+ support. Pre-2017 Tizen TVs are out of scope.
- The Frame is not currently in the available hardware set. Treat Art Mode, standby, wake and
  restore as a separate lifecycle tier; do not infer them from other TVs of the same year.

## 3. Users and primary journeys

1. **First use:** launch the app, sign into Plex with an on-screen QR flow, select a Plex Home
   profile where applicable, choose an available server, and land on Home. Account linking and
   installation guidance are shipped near release, after product development and testing.
2. **Find something to watch:** browse Home shelves or a server library; sort, filter, navigate the
   alphabet rail, search across reachable servers, and open details for a film, show, season,
   episode, collection or person.
3. **Watch:** start or resume playback, see the actual selected version/source, control transport,
   seek and scrub, choose audio/subtitle tracks, use chapter and marker actions, and return to a
   useful screen. PMS receives normal playback timeline/progress updates.
4. **Continue later:** Home and library views reflect PMS watch state and continue-watching
   position. Progress is not synthesized locally as the source of truth.
5. **Recover:** handle unavailable servers, auth expiry, unsupported tracks, playback failures,
   loading and empty results with actionable couch-readable states and retry/back behavior.
6. **Configure:** manage account/server selection, playback preferences, language, privacy/telemetry
   consent, diagnostics and app information through TV-remote navigation.

## 4. Functional requirements

### 4.1 Account, session and servers

- **AUTH-1:** Support Plex account sign-in using a QR/device authorization flow; never require
  typing a Plex password into the TV app.
- **AUTH-2:** Support Plex Home profile selection, sign-out, account/session expiry, and returning
  to sign-in with a clear explanation when reauthentication is needed.
- **AUTH-3:** Discover the user's owned and shared servers, select among them, and handle servers
  that are unavailable, indirect/relayed, or require TLS according to tested Plex behavior.
- **AUTH-4:** Keep the account token out of URLs where headers are supported, UI, logs, screenshots,
  crash reports and analytics. Redact credential-bearing request targets. On sign-out remove
  account credentials from app storage.
- **AUTH-5:** Investigate Samsung's supported private/secure storage options and threat model before
  deciding whether localStorage, another web storage API or a platform service is acceptable for
  credentials. Do not claim encryption at rest without verified platform evidence.
- **AUTH-6:** If telemetry/crash reporting is included for parity, each category is off until
  separately consented to, revocable in settings, and constrained to the current PlxNative privacy
  schema. It must never include titles, search terms, subtitle text, server names or addresses.

### 4.2 Browse, search and metadata

- **BROWSE-1:** Home presents useful Plex-backed hubs/shelves, including continue-watching and
  recently added content when the server supplies them.
- **BROWSE-2:** Support movie and TV libraries, shows, seasons and episodes; paginated loading;
  recently added/unwatched shelves; sort, server-provided filters, unwatched-only views and
  alphabet/first-character navigation.
- **BROWSE-3:** Search reachable servers and group results by supported media kind. Search state,
  query and focus must be controllable using the supported Samsung remote/input model.
- **BROWSE-4:** Item details show available metadata, artwork, synopsis and available actions.
  Support show/season/episode navigation, collections, related items, extras/trailers, cast/crew,
  person information and filmography when supplied by Plex endpoints.
- **BROWSE-5:** Preserve server-provided ordering, identifiers and access-denied distinctions.
  Missing optional metadata is not an error; authorization failure is not an empty library.
- **BROWSE-6:** Avoid fetching or retaining unbounded image/catalog data. Paginate, cancel stale
  requests, and bound image and metadata caches for low-memory TVs.

### 4.3 Playback and progress

- **PLAY-1:** Use Samsung AVPlay as the default hardware playback adapter; encapsulate AVPlay behind
  a typed playback interface so UI/state orchestration does not call `webapis.avplay` directly.
- **PLAY-2:** Negotiate direct play versus PMS transcode from the selected media, the exact TV's
  measured/documented capabilities, subtitle choice, server response and user quality preference.
  Do not infer support from filename, year alone, `MediaSource.isTypeSupported`, or another model.
- **PLAY-3:** Support play/resume, pause, stop, backward/forward seek, continuous seek/scrub, landed
  playhead display, buffering/waiting/error states, and return/navigation behavior. Show the
  actual landed position when AVPlay keyframe-snaps a seek.
- **PLAY-4:** Report start, periodic timeline, pause/stop and completion to PMS using the relevant
  Plex protocol. Reconcile read-back from PMS and handle interruption/relaunch without inventing
  progress. Only explicit playback actions may make these state changes.
- **PLAY-5:** Support audio stream enumeration/selection, default-track behavior, and safe switching
  during playback where the target API requires it. Unsupported tracks must fail clearly without a
  hang or silent loss of the working track.
- **PLAY-6:** Support embedded text subtitles, external text subtitle retrieval/rendering, and
  server-side subtitle transcode/burn-in where local rendering is unsupported. Investigate ASS/SSA,
  PGS and VobSub individually; never claim subtitle parity from an embedded-SRT result.
- **PLAY-7:** Support chapters, Skip Intro, Skip Credits, Up Next/auto-advance, track menus, playback
  information and quality/source selection where Plex exposes the required data and action.
- **PLAY-8:** Preserve source aspect ratio. Select and verify AVPlay display modes explicitly;
  non-16:9 material must not be stretched. Define HDR signaling and picture-quality expectations
  per tested model and media format.
- **PLAY-9:** Playback loss, server refusal, DRM/codec/API failure and timeout have distinct
  observable, recoverable states. The app can return to detail/Home and retry; no unbounded spinner
  or black-screen success state is acceptable.
- **PLAY-10:** Test direct-play and transcode paths separately, across the declared model matrix.
  A 1080p H.264 pass is not a 4K, HDR, audio or subtitle pass.

### 4.4 TV UI, settings and lifecycle

- **UI-1:** Provide a TV-first 10-foot interface with complete remote-control operation, visible
  focus, consistent back behavior, safe-area layout, couch-readable typography and no required
  mouse, touch or keyboard.
- **UI-2:** Implement Home, library shelves/grid, search, detail, collection/person, profiles/login,
  player/HUD/menus, settings, diagnostics, privacy and failure/empty/loading states.
- **UI-3:** Support press, release, repeat/long-press and directional navigation according to the
  physical/emulated remote. Prevent duplicate actions from key repeat, focus loss and lifecycle
  restoration.
- **UI-4:** Maintain per-screen focus and scroll state across supported navigation and transient
  app suspension. Cleanly restore or restart after foregrounding, app exit/relaunch and network
  loss.
- **UI-5:** Include language selection/translations for the supported PlxNative languages, and test
  text fit at actual TV sizes. Server-owned/user-owned strings may need elision; app-owned text
  should remain complete and couch-readable.
- **UI-6:** The Frame Art Mode, standby/wake and background playback policy require a separate
  tested contract before that model family is marked supported.

## 5. Non-functional acceptance

- The UI and all core navigation are operable by remote only; every screen has explicit focus,
  loading, empty, failure and back behavior.
- On the oldest supported model, library navigation remains responsive under a representative
  200-item result and posters load progressively. The 2017 probe's scripted median focus latency
  was 49 ms in a deliberately simple page; target the same 150 ms median maximum for product
  navigation, and separately measure p95/max on device.
- Cold launch, first useful Home content, detail open, first frame, image memory, peak memory, long
  session stability and recovery have numeric budgets set per model tier before performance signoff.
  The existing POC's first-frame-under-5-seconds and zero unrecovered stalls over ten minutes are
  initial playback gates, not already-proven full-app budgets.
- Do not block the UI thread on network, image decode, AVPlay waits, parsing or file/storage
  operations. Bound concurrency, response sizes, queues and caches.
- Log typed state transitions and redacted diagnostics sufficient to explain failures without
  collecting private library data.
- Every shipped runtime bundle must pass static checks for accidental token/URL inclusion, JavaScript
  engine compatibility, package privileges and app identifiers.
- CI/host tests are necessary but insufficient: release signoff includes the Samsung emulator and
  at least one retail set for each declared supported model group, with playback-specific checks on
  the physical device.

## 6. Architecture contract

### 6.1 Product separation

- Put the Samsung client in a new, independently buildable Tizen Web application directory. Keep
  existing LG Rust/C sources, package identities, build recipes and release behavior unchanged.
- Do not attempt to ship PlxNative's webOS-native executable, GLES/SDL renderer, `libcurl` seam,
  FFmpeg ABI bindings, Starfish/ACB interfaces or LG storage services on Tizen.
- Initially reuse PlxNative as the behavioral/API/test oracle: API notes, fixtures, mock PMS,
  feature definitions and protocol decisions. Its current Rust layers are not assumed reusable in
  a 2017 browser runtime.
- Do not make WebAssembly a requirement. A later 2020+ optimization may be considered only if
  profiling proves a benefit and the baseline JavaScript implementation remains the reference.

### 6.2 Proposed Tizen client boundaries

1. `platform/`: AVPlay adapter, key/remote input, app lifecycle, capability discovery, private
   storage and image/media presentation.
2. `plex-api/`: typed Plex HTTP/XHR transport, auth/device-link flow, server discovery, request
   cancellation and redaction.
3. `domain/`: server-independent media/session models, browse queries, navigation/playback state,
   marker/progress policy and error taxonomy.
4. `features/`: account/profiles, Home, library, search, detail, collection/person and player
   orchestration; state changes occur through owned transitions/events rather than screen-to-screen
   mutation.
5. `ui/`: shared tokens, remote focus/navigation, cards/shelves/grids, dialogs/menus, text fitting,
   overlays and localization.
6. `tests/`: domain unit/contract tests, mocked PMS integration tests, deterministic UI navigation,
   bundle compatibility checks, emulator scenarios and the retail-device test register.

The primary runtime is browser JavaScript packaged in `.wgt`. Use TypeScript or another typed source
language only if the build demonstrably emits an ES5-compatible artifact. Decide the bundler,
transpiler/polyfills, component model, secure-storage implementation, image cache and AVPlay event
adapter through short, measured architecture spikes before locking the production stack.

### 6.3 Architectural decisions to resolve before depending on them

| Decision | Required evidence | Safe default until resolved |
|---|---|---|
| Source language and ES5 toolchain | Bundle syntax scan + Samsung emulator + 2017 browser probe | Emit plain ES5 JavaScript; no Wasm |
| UI composition/rendering | Emulator input/focus probe and 200-item retail grid memory/latency run | DOM/CSS, virtualized lists, one focus owner; avoid large unbounded trees |
| Credential storage | Samsung TV API documentation and model probes; sign-out/deletion tests | Keep credentials out of logs/URLs; do not claim encrypted storage |
| Direct play/transcode decision | PMS decision/API contract plus per-model codec and AVPlay tests | Ask PMS to transcode whenever target support is unknown |
| Subtitle rendering | AVPlay capability docs and independent embedded/external/ASS/PGS/VobSub tests | Prefer text overlays only for verified formats; request server-rendered fallback |
| Image strategy | PMS transcoder behavior, cache ceilings, low-memory testing | Server-resized images, progressive loading, bounded cache |
| User telemetry | Privacy/legal review and Tizen-compatible transport | Off, absent unless explicit separate consent and verified implementation |
| Store distribution | Samsung Seller Office and Plex policy review | Treat as unresolved; local developer sideloading is not Store approval |

## 7. Verification contract and test register

Retain and extend `docs/samsung-tizen-poc.md`'s test register. Give every test an ID and record app
revision, target model/firmware, source/media class, clean/cold or warm state, procedure, numeric
criterion, result and evidence category.

Required evidence categories: source-backed/vendor-documented, host unit/integration, mock PMS,
Samsung-emulator-observed, owner-observed, and retail-device-observed. A claim must name which one
supports it. The emulator cannot prove actual decoder, HDR, audio, subtitle, panel, memory-pressure
or physical remote behavior.

Product acceptance suites:

- **AUTH:** QR pairing, profile selection, multi-server discovery, unavailable server, expiry,
  reauth, sign-out and credential/log redaction.
- **BROWSE:** Home hubs, paging, large library grid, image failure/retry, all supported filters and
  sort metadata, letter navigation, global search, metadata details, seasons/episodes, collections,
  cast/person, related items and extras.
- **PLAY:** HTTPS/direct-play H.264, HEVC and applicable UHD/HDR classes; server transcode; supported
  and unsupported audio; each subtitle mode; track selection; pause/resume; forward/backward seek;
  chapter and marker actions; Up Next; progress report/read-back; long playback; app/server
  interruption and retry.
- **UI/LIFECYCLE:** TV remote navigation, repeat/hold behavior, every screen's focus/back path,
  large text and localization, orientation/safe area, memory/long-session stability, suspend/resume,
  relaunch, and The Frame Art Mode if claimed.
- **PRIVACY/SAFETY:** no background playback-start or account mutation; timeline writes only during
  user-initiated playback; consent defaults off; no secret leakage in source, package metadata or
  logs; a test profile/server for all write-path testing.

Exit gate for each support row: emulator smoke and navigation pass; host/mock suites pass; on a
named retail model, launch/auth, browse/search, the applicable codec/audio/subtitle cases,
progress read-back, recovery and performance pass. Every codec and lifecycle feature not exercised
is marked unsupported or unknown for that row, never implied by a neighboring model.

## 8. Sequenced implementation plan

Phases are implementation slices of this complete product, not a reduced product scope. Keep the
LG app buildable at every phase.

0. **Reusable Tizen process foundation:** environment inventory, clean app template, validated
   packaging, emulator harness, diagnostics, key/lifecycle conformance, mock fixtures and CI
   contract. Prove the workflow on both a generated unrelated sample and the Plex app; see
   [development process](samsung-tizen-development-process.md). Do not let cross-app tooling
   replace app-specific product work.
1. **Plex Tizen app foundation:** separate Web app skeleton, reproducible package/build command,
   ES5-output gate, Samsung emulator boot, remote-key/focus loop, diagnostics, local mock-PMS
   fixtures and CI smoke. No Plex secret or Samsung retail certificate needed.
2. **Plex account and session:** QR auth, Plex Home profiles, server discovery/selection, safe
   storage investigation, account lifecycle and multi-server API tests.
3. **Shared UI and discovery:** theme/layout/navigation primitives, Home hubs, library browsing,
   paging, sort/filter/A–Z, images and caching, search, detail/collection/person/extras.
4. **Playback foundation:** AVPlay adapter lifecycle/state machine, direct play, PMS transcode
   fallback, player HUD, input, pause/resume/seek, actual playhead and recoverable errors.
5. **Plex playback parity:** timeline/progress protocol, quality/source changes, audio/subtitle
   selection, subtitle fallback, chapters, Skip Intro/Credits and Up Next/auto-advance.
6. **Product completion:** preferences/settings, localization/text fit, privacy consent, optional
   diagnostics/telemetry, memory/performance hardening, accessibility, lifecycle/resume and failure
   audit.
7. **Compatibility and release:** run the support matrix on Samsung emulator and available retail
   TVs, determine supported model groups, Store/distribution feasibility, signing/package pipeline,
   install/update/uninstall and recovery docs, then write developer and user-facing onboarding
   instructions. No broad support claim before this gate.

At each slice, run its smallest host/mock tests, build and launch the app in Samsung's emulator, and
preserve the LG `make check`/simulator path. Use a retail set only when its evidence is required;
the TV lock governs every physical-device operation. Keep certificate credentials and tokens
outside the repo. Ask for explicit consent before any test that writes to the household's Plex
viewing history.

## 9. Product decisions and questions

The implementation can begin with safe defaults below; revisit before the corresponding feature
depends on them.

| Question | Initial default |
|---|---|
| What does “full Plex app” mean for this product? | Full feature parity with the supported PlxNative scope in §1, not music/photos/live TV/Watchlist/Plex catalogue. |
| Intended Samsung floor? | 2017 Tizen 3 as the target floor, with per-model evidence; do not imply that one 2017 model certifies the tier. |
| First local development server? | Existing mock PMS and fixtures; owner token only for later real-server tests that need it. |
| Which PMS records may tests change? | None without explicit authorization for a named test profile/item/action. |
| When does user onboarding happen? | Near release, after app behavior, support range, install/signing and distribution are established. |
| Initial distribution promise? | Developer-mode sideload for engineering only; public store path unresolved. |
| Plex branding/name? | Independent, unofficial Plex client; conduct trademark/licensing review before public distribution or naming. |
