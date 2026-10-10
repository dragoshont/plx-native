# Samsung Tizen Plex client: product specification

**Status:** implementation in progress; Samsung runtime acceptance outstanding
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

**Implementation status:** `samsung/PlexTv/` remains a separate Tizen 3.0 Web app. It now contains
short-code/QR authorization, Home profiles/PIN entry, owned/shared server discovery, Home shelves,
paged libraries, sort/filter/alphabet menus, collections, multi-server search, metadata/person
details, an isolated AVPlay adapter, PMS playback negotiation/progress, player controls, chapters,
markers, track/quality/version menus, text captions, Up Next and settings. These are source
implementations, not a Samsung support declaration. Tests exercise synthetic account/server
contracts and the real app DOM with fake networking/AVPlay, including a 250-item library with a
200-card retained window, explicit watch-state confirmations and cancellation. Playback requests
server-side audio/subtitle selection before negotiation and asks PMS to join multipart titles.
ES5 parsing and an unsigned Samsung source build are separate gates.
The sign-in PIN and its QR renew automatically on local or Plex-reported expiry, including
when a poll stalls. Failed PIN acquisition retries after five seconds with a visible error;
denial still requires an explicit retry. Renewal retains remember-me consent, and stale polls
and timers cannot complete an older pairing. Backgrounding or leaving pairing cancels renewal.
Samsung menu styling follows the LG implementation's capsule navigation and icon-bearing form
rows (`rust-modules/ui/src/widgets.rs`'s `TabStrip` and `rust-modules/ui/src/theme.rs`'s control
roles), rather than reusing its renderer. Home destinations appear above the shelves; settings
show selected values independently of focus and retain the focused row after preference changes.
These behaviors have synthetic UI coverage; browser previews are not Samsung-panel evidence.
The installed emulator has not launched on this Apple-Silicon host; earlier retail probes did not
run this application. No current-product emulator, decoder, performance or retail-model pass is
claimed.

## 1. Product outcome

Deliver a couch-usable Samsung Tizen TV app that signs into Plex, connects to the user's own or
shared Plex Media Servers, browses and searches their libraries, and plays media while keeping Plex
as the authority for libraries, watch state, and playback progress. The app must neither replace
PMS nor silently write viewing state outside normal, user-initiated playback and explicitly
approved tests.

The original baseline was PlxNative's movie/television feature set. The owner's subsequent
instruction requests **all features of the actual Plex app**; the original exclusions cannot be
used to call this work complete. Music/photos and portions of DVR/Watchlist now have host
implementations, but full parity and native acceptance remain outstanding. Official-client features that depend on Plex
entitlements, licensed services or private distribution contracts also need source-backed
availability evidence; do not invent an API or silently substitute a different media server.
The requirements below describe the movie/TV implementation contract, not an assertion of complete
official-Plex parity.

### Current acceptance gaps

| Surface | Existing implementation/evidence | Required before completion |
|---|---|---|
| Account/profiles/servers | Synthetic short-code, PIN, scoped grants and recovery tests | Actual Plex and Samsung TLS/CORS, profile PIN acceptance, QR and relaunch checks |
| Browse/search/details | Mock PMS and host DOM journeys; collections and local/catalogue people paths | Full remote navigation, search cancellation, large-library/image memory and text-fit evidence; catalogue filmography currently displays at most 200 credits and checks at most 500 local titles for availability |
| Playback/progress | Fake AVPlay state/seek and PMS decision/timeline/read-back tests | Named-model native playback, direct/transcode, HDR/audio, native/external/burned subtitle matrix |
| Direct play | Adapter accepts an evidenced capability profile; UI uses conservative transcode | Real model-profile hookup and measured capabilities; no guessed direct/UHD/HDR support |
| Up Next/quality/versions | Source implementation with opt-in auto-next; multipart titles request a joined PMS transcode (`partIndex=-1`), never direct-play just the first file | Long sessions, interrupted transitions and actual server/native multipart joins, resume and completion |
| Settings/languages | Non-secret preferences, English/Spanish/Belarusian catalogs, static app-copy coverage and named placeholders | Dynamic errors/copy coverage and physical-TV text fit |
| Credential persistence | Default memory-only; explicit unchecked remember-me consent stores plaintext account token | TV storage/relaunch/deletion behavior and final threat-model signoff |
| Lifecycle/input | Background stop, explicit foreground resume, cancelled view reads and coalesced progress queue; synthetic journeys | Physical remote repeats/holds, process-exit reconciliation, suspend/wake and The Frame Art Mode |
| Official Plex ecosystem | Music/photos, guide discovery, DVR scheduling/management and Watchlist read/mutations have host implementations | Live tuning/consumer lifecycle, licensed catalogue playback, server acceptance and remaining parity |
| Distribution/support | Unsigned source build; earlier independent probe packages | Authorized signing/install, current-app model register and separate Store/legal decision |
| Bounded HTTP bodies | Incremental 4 MiB byte ceiling and full-request deadline; stalled/oversized synthetic streams tested | Real browser streaming/UTF-8/blob APIs; older engines without bounded streaming currently fail explicitly rather than buffering an unbounded body |

No row becomes complete solely because the source builds or a fake adapter returns success.

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

The initial runtime uses plain ES5 modules under `js/` (Plex transport, AVPlay, playback protocol,
subtitles, preferences, sessions and generated translations), composed by `main.js`. This is
not a Rust/Wasm port. Acorn parses every shipped JavaScript file with `ecmaVersion: 5`; this proves
syntax only, not availability of fetch/Promise/URL or other APIs on an old TV. Host-only npm
dependencies live under `tests/tizen/` and are not packaged in the application.
The HTTP path also requires response streaming (`body.getReader()`), UTF-8 decoding and blobs.
That is a separate runtime gate, especially for the intended 2017 engine; the ES5 check alone
does not establish this target. A bounded legacy-engine transport remains an implementation gap.

Music libraries now navigate artists/albums/tracks and use the universal music transcoder with
an HTTP MP3 request. Album queues are local, capped at 200 tracks, with shuffle and repeat
off/one/all; they are not PMS PlayQueues. Photo libraries open a page-local viewer/slideshow,
fetch server-resized images, enforce the response ceiling and a 15-second decode deadline, and
release object URLs on replacement/back. Synthetic real-app journeys cover both features;
MP3 delivery, photo formats and native output remain unobserved on Samsung hardware.
Read requests owned by the current client can be cancelled on navigation; explicit mutations and
playback cleanup are not cancelled by view replacement. Discovery/search clients are registered
with the view owner, including identity probes, so obsolete reads are cancelled and retries do not
probe more connections after cancellation. Legacy-engine transport still needs completion.

The guide/DVR feature is separated into `television.js` and `television-ui.js`. It reads existing
EPG providers, guide shelves/channel lineups, subscriptions and scheduled recording statuses.
Recording templates come from PMS; their encoded hint/parameter values are decoded once and
re-encoded once, preserving nested percent encoding. Scheduling and subscription cancellation
require explicit confirmation and suppress duplicate clicks. Scheduling is offered only for
providers advertising `subscribe` with flavor `record`; tuner setup and automatic conflict
resolution are not performed. Recording preference controls follow server-supplied settings;
the bracketed preference wire shape follows the vendored OpenAPI's `style: deepObject` contract.
Actual PMS acceptance and conflict/status behavior still require an authorized test server.

Sources: vendored `docs/plex-openapi.json`, `/media/providers`, `/livetv/epg/channels`,
`/media/subscriptions`, `/media/subscriptions/template`, and `/media/subscriptions/scheduled`.
Live tune returns a media UUID without a normal PMS rating key. The documented HLS path has
a separate `consumerId`, but consumer allocation, keepalive and release are not established;
there is intentionally no speculative Tune/Play action allocating a tuner without reliable cleanup.

Watchlist uses the account token at `discover.provider.plex.tv`, not a PMS grant.
Read: `/library/sections/watchlist/{all|available|released}`. Explicit add/remove use PUT
`/actions/addToWatchlist` and `/actions/removeFromWatchlist`; `ratingKey` is the final segment
of a validated `plex://movie|show/{24hex}` GUID, never a numeric PMS item ID.
Source: [python-plexapi MyPlexAccount](https://github.com/pushingkarmaorg/python-plexapi/blob/8a9ade7f364582cabb6d5bc200994fddb2113d48/plexapi/myplex.py),
`watchlist`, `addToWatchlist`, `removeFromWatchlist`. These are maintained-client implementation
evidence, not official Plex cloud API documentation or independently observed account behavior.
Cloud search uses Discover `/library/search` with `searchProviders=discover`, and consumes the
external `SearchResults[].SearchResult[].Metadata` group. Details use the returned validated
metadata key at `metadata.provider.plex.tv` with `includeUserState=1`.
Local availability is resolved by exact GUID per movie/show library:
`/library/sections/{id}/all?includeGuids=1&guid=...`, with each server's own token, and matching
GUIDs are checked again in the response. It is not a title-only guess.
Source: the pinned client's `searchDiscover`, `_toOnlineMetadata`, and
[LibrarySection.getGuid](https://github.com/pushingkarmaorg/python-plexapi/blob/8a9ade7f364582cabb6d5bc200994fddb2113d48/plexapi/library.py).
Catalogue search displays at most 30 returned results, local matching at most 200 cards.
Licensed/ad-supported playback remains disabled: personal-library decision schemas do not
establish cloud streaming authorization, ad obligations or DRM. The absence of a DRM flag in
that schema is not evidence that catalogue content is unprotected.

Backgrounding cancels auto-next, stops native playback and attempts final timeline/cleanup.
Foregrounding reloads details but never restarts playback without a user action. Photo resources
and pairing polls are stopped while hidden; non-player views restore with focus/scroll state.
Process termination can interrupt final network writes, so pagehide cleanup is best effort,
not a guarantee of server reconciliation after a killed process.
Periodic progress keeps one in-flight request and one coalesced pending sample; terminal stopped
state takes priority, avoiding an unbounded queue during a slow/offline session.

Samsung documents [Web Storage](https://developer.samsung.com/smarttv/develop/guides/data-handling/using-web-storage.html),
not encryption at rest. Remember-me is disabled by default and explicitly explains unencrypted
token storage and shared-TV risk. Only the original account credential is saved; protected Home
profiles must still be selected and PIN-authorized. Sign-out and expiry recovery attempt deletion,
and a deletion failure requires the user to clear app data rather than claiming a secure sign-out.
No telemetry/crash upload transport is installed.

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
| What does “full Plex app” mean for this product? | Owner expanded scope to official-Plex features; §10 tracks music/photos/live TV/Watchlist/catalogue gaps explicitly. Movie/TV implementation alone is not completion. |
| Intended Samsung floor? | 2017 Tizen 3 as the target floor, with per-model evidence; do not imply that one 2017 model certifies the tier. |
| First local development server? | Existing mock PMS and fixtures; owner token only for later real-server tests that need it. |
| Which PMS records may tests change? | None without explicit authorization for a named test profile/item/action. |
| When does user onboarding happen? | Near release, after app behavior, support range, install/signing and distribution are established. |
| Initial distribution promise? | Developer-mode sideload for engineering only; public store path unresolved. |
| Plex branding/name? | Independent, unofficial Plex client; conduct trademark/licensing review before public distribution or naming. |

## 9A. LG comparison and remaining-work dashboard

Source audit of this fork at `b6aa83a8`, not a claim about every upstream release or the official
Plex client. Samsung results below are host/synthetic implementation evidence only. The historical
[LG parity audit](parity-gaps.md) scopes itself to movies/shows and contains older paths and
superseded assertions; current source takes precedence.

| Feature | Actual LG source boundary | Samsung baseline and remaining work |
|---|---|---|
| Music and photos | `rust-modules/data/src/browse/mod.rs`, `SecKind::from_wire`, accepts only movie/show. Tests in `browse_fetch_state_tests.rs` explicitly reject artist/photo. Generic metadata/hub names are not playable screens. | Music queues/shuffle/repeat and photo slideshow exist on host. Server music PlayQueues, larger queues, native audio/image formats, interruption recovery and memory limits remain. These are new product features, not copied LG screens. |
| Live TV/DVR | No `/livetv` or `/media/subscriptions` bindings found in Rust source; the LG parity audit excludes this domain. | Guide/grid and confirmed DVR operations exist on host. Tuner consumer allocation/keepalive/release, storage-location selection, conflict workflows and actual server/native acceptance remain. LG provides no tuner lifecycle to reuse. |
| Watchlist | No Watchlist read/add/remove bindings found in Rust source. | Paged reads, confirmed mutations and exact-GUID local matches exist on host. Cloud/profile acceptance, packaged remote paging and recovery remain. |
| Cloud catalogue | `rust-modules/plex/src/plex/discover.rs` implements person biographies and `CreditGroup` filmography, not general catalogue search or licensed playback. `rust-modules/data/src/person.rs` joins credits to local availability; unowned credits are not local playback targets. | Metadata search/details and local matching exist on host. Career paging remains capped; licensed/ad-supported streaming is blocked on authorization, DRM and ad contracts. A Discover module name does not prove AVOD support. |
| Server queues and Up Next | `rust-modules/plex/src/plex/timeline.rs`, `create_play_queue`, POSTs `/playQueues` with `type=video`, continuous episodes, queue/item IDs and server identity. `rust-modules/media/src/route/plan.rs` retains queue projections. | Local music queue is not equivalent to a server PlayQueue. Reuse the identity/projection rules, but establish music-specific creation, mutation, paging and cleanup contracts rather than copying the video-only call. |
| Localization | LG has English/Spanish/Belarusian catalogs under `locales/`; translated movie/show surfaces do not supply translations for the new media/service domains. | Static/conditional copy and named placeholders covered on host. Dynamic errors/composite copy, old-engine formatting and actual display text fit remain. |
| Playback and lifecycle | `rust-modules/media/src/player/CLAUDE.md` documents bundled FFmpeg demux, access-unit queues, Starfish feed and ACB hardware-plane binding. Those are LG-specific native interfaces. | AVPlay is a separate adapter. Hidden-state stop and foreground no-auto-play are host exercised; codecs, HDR/audio/subtitles, seeks, process kill, standby and The Frame Art Mode need Samsung acceptance. LG device results cannot certify these. |

**Reusable:** PMS/account identity separation, GUID versus local ratingKey boundaries, stream
selection, timeline/queue identity and movie/show domain rules. The ES5 app currently reimplements
these contracts; it does not execute the Rust core. LG GPU widgets, raw-socket/libcurl runtime and
Starfish/ACB decoder integration are not drop-in Tizen Web code.

### LG capability parity (owner re-scope)

The owner asked to target LG capability parity first, taking low-risk gaps before new domains.
Each row compares source behaviour; Samsung evidence is host-only.

| LG capability (source) | Samsung status |
|---|---|
| Person biography and catalogue credits (`discover.rs`) | Present: `personProfile`, `personCredits` |
| Credit-to-local availability join (`person.rs` `guid_index`/`match_local` over `/library/people/{id}/media`, keyed by the GUID tail) | **Added:** `localCatalogueIndex`/`matchCredit`/`personLibraryIndex`. Held credits open the local item ("In this library"); others keep "Search libraries"; an unreadable or truncated index is reported, never shown as availability. `people.test.js` and `filmography-ui.test.js` (fails against the previous commit) |
| Extras/trailers shelf, Play from beginning, Remove from Continue Watching, related items | Present |
| Up Next via `/allLeaves` | Present (`nextEpisode`) |
| Item context menu on cards (`item_menu.rs`: go to item/show, mark watched, play, play from start, trailer, remove from deck) | **Added:** `js/item-menu.js`. Holding OK (600 ms), Tools or Info opens it; Play/Resume is always the first row and never a write; Cancel returns focus to the card. A short OK opens the card on key-up. `lg-parity.test.js`, `lg-parity-ui.test.js`. Physical Enter key-up delivery is unverified on a TV |
| Continue Watching OK = Play vs Open details preference | **Added:** `continueAction` preference, default Open details, as on LG |
| Video server PlayQueue (`timeline.rs` `create_play_queue`) | **Added:** `createVideoPlayQueue` POSTs `/playQueues` (`type=video`, continuous for episodes); timelines carry `playQueueID`/`playQueueItemID`. A queue failure falls back to plain playback. Creating a queue is a server write: fakes only until an authorized test profile exists |
| Alternate sources across servers (`/library/all?guid=…`) | **Added:** "Other servers" on movie/show detail, which excludes the current server and labels each copy with server, library and resolution. OK opens that server's detail page; the playing copy is never swapped |
| Favorite libraries onboarding (`screens/src/onboard.rs` first-run step, then Settings) | **Added:** `js/favorites.js`. First visit to each server offers the step; Skip writes nothing and at least one library stays selected; hidden libraries also drop their Home shelves. Sign-in is the existing plex.tv PIN link and profile picker |

### Remaining work by dependency

These rows summarize the detailed unchecked tasks in section 10; they are not additional scope.
No row is complete merely because its host fixtures pass.

| Priority | Work | Completion evidence | Dependency/hold |
|---|---|---|---|
| 1 | Legacy bounded transport and old-engine compatibility | Timeout/body-size/token/redirect regressions plus oldest-target runtime exercise | Ordinary coding; runtime result needs supported emulator or named TV |
| 2 | Server music PlayQueues and larger queues | Queue identity, paging/order/shuffle/repeat, transition and failure tests; native playback acceptance | Music-specific PMS contracts and authorized test records |
| 3 | Dynamic localization, paging, focus/HUD and resource ceilings | Every screen's error/empty/retry/remote journeys; text-fit and measured memory | Host work first, then packaged runtime |
| 4 | DVR destinations/conflict workflows | Server-provided settings/storage choices, explicit confirmation and ambiguous-failure handling; actual scheduling acceptance | Authorized named test profile/recording |
| 5 | Live channel playback | Proven consumer allocation, keepalive and release on success/error/exit; no leaked tuner | Unresolved service lifecycle; no speculative tune action |
| 6 | Licensed catalogue streaming | Authorized playable source, DRM/ad requirements and compliant native playback | Service/legal contract blocker, not solved by LG reuse |
| 7 | CI/package checks and Windows/Ryzen emulator workflow | Host/ES5/source gates, manifest/credential checks; observed emulator launch/readiness/input/capture | Windows x64 tooling readiness unobserved; no installation here |
| 8 | Model acceptance and release | Named firmware codec/lifecycle/performance register; signing/update/uninstall and release checks | Explicit signing/deploy/account-write/publish grants still required |

**Not ready for a full-support claim:** the expanded host baseline is implemented, but live tuning,
licensed catalogue streaming, legacy runtime compatibility and current-app Samsung acceptance
remain open. Earlier feasibility probes are not acceptance of this application.

## 10. Unfinished product backlog

This is the editable task list requested by the owner. Checked entries mean the named **host
implementation** is committed and exercised, never that a Samsung model passed. All unchecked
entries remain outstanding. Repository edits, builds and synthetic tests are approved; external
device, signing, publishing and household-account operations retain their specific safety gates.
Work directly through the dependency-ready items rather than waiting for a native worker.

### Player and protocol

- [x] Implement joined multipart server transcodes with whole-title resume/progress; host contract tested. Source: `docs/plex-openapi.json`, decision `partIndex=-1`.
- [x] Reject concurrent playback starts and seeks; cancel closed seeks promptly and ignore late/timed-out callbacks. Host race regressions exercised.
- [x] Select server audio/subtitle streams before playback negotiation, preserve default audio when not overridden, and stop on refused selection. Source: `rust-modules/plex/src/plex/library.rs`, `select_streams`.
- [x] Retrieve external captions from `/library/streams/{id}` with UTF-8 encoding and source-backed SRT conversion, rather than inventing filename extensions. Host transport/parser integration tested.
- [ ] Exercise multipart joins, seeks across file boundaries and final watch state against a test PMS and native AVPlay.
- [ ] Install evidence-bound model capability profiles in the UI; reject model/firmware mismatches and expose unknown capabilities.
- [ ] Exercise direct-play, fallback and quality changes for H.264/HEVC/UHD/HDR per named model; preserve aspect ratio and verify panel/audio output.
- [ ] Complete queue/PlayQueue handling, shuffle, repeat and playback ordering where applicable.
- [ ] Test progress retries, final stop/read-back, server restart, network loss and long sessions.
- [ ] Verify audio track defaults, selection and failures on device, including model-specific DTS limitations.
- [ ] Verify embedded/external SRT/WebVTT and server-rendered ASS/SSA/PGS/VobSub individually.
- [ ] Test subtitle/audio/version changes while preparing, paused, seeking and completing; prevent stale callbacks.
- [ ] Complete held-key scrub/repeat handling and player HUD hide/show/focus restoration.
- [ ] Exercise Up Next/auto-next cancellation and completion across episode/season boundaries.

### Account, browsing and app UX

- [ ] Confirm Home PIN request shape against primary Plex evidence and actual test-account behavior.
- [ ] Verify pairing QR, shared grants, TLS/CORS and unavailable/denied-server recovery in the packaged TV app.
- [x] Cancel view-owned reads and active response readers, including search/discovery clients; cancellation/deadline and signed-account journeys exercised on host.
- [ ] Exercise repeated Back/search/sign-out under packaged-runtime network loss and retry.
- [ ] Test and fix every screen's remote focus, scroll restoration, loading/empty/error and retry paths.
- [x] Join catalogue credits to this server's titles by GUID tail, as LG `person.rs` does; held credits open the local item. Host helper and DOM journey tested (500-title index cap reported).
- [ ] Complete person/crew career paging beyond the 200-credit display cap and the 500-title local index cap.
- [ ] Finish collection/library paging and search type/group completeness, including older PMS response variants.
- [x] Add explicitly user-initiated watched/unwatched and remove-from-Continue-Watching actions with confirmation, duplicate-click prevention and synthetic writes only. Sources: `docs/pms-api.md` §timeline and `rust-modules/plex/src/plex/hubs.rs`.
- [ ] Verify explicit watch actions against a named authorized test profile/item, including show/season leaf behavior and metadata refresh failures.
- [ ] Finish artwork cache/resource eviction and establish measured low-memory ceilings.
- [x] Add missing-key coverage for static/conditional control and status copy in English/Spanish/Belarusian; localize static elements and named resume/duration/record/auto-next placeholders.
- [ ] Finish dynamic error/composite-copy localization and verify locale-sensitive formatting on the target engine.
- [ ] Verify English/Spanish/Belarusian text fit, accessibility and couch legibility on actual display sizes.
- [x] Stop playback while hidden, cancel auto-next, reload details on foreground without auto-play, and coalesce slow progress writes; synthetic lifecycle/queue regressions exercised.
- [ ] Verify graceful exit/process-kill and interrupted-session reconciliation on Samsung.
- [ ] Verify remember-me relaunch/deletion on TV, protected-profile PIN gates and storage-error recovery.
- [ ] Test The Frame Art Mode, wake/standby and restore separately before claiming support.

### Expanded official-Plex features

Each item starts with endpoint/schema/entitlement evidence and mock contracts, then full UI and
runtime integration. A feature requiring an unavailable private service remains blocked with its
evidence; it is not replaced by another media server.

- [x] Music host baseline: artists/albums/tracks, metadata/artwork, bounded local album queue, shuffle/repeat and audio player; synthetic UI/session contracts exercised.
- [ ] Music completion: server PlayQueues, larger album queues, native MP3/transcode verification and interruption recovery.
- [x] Photos host baseline: album navigation, page-local viewer/slideshow, decode timeout and object-URL cleanup; synthetic UI/resource contracts exercised without progress writes.
- [ ] Photos completion: verify native supported formats, display/remote behavior and measured memory ceilings.
- [x] Live TV host discovery: advertised EPG providers, guide shelves, date/channel grid and existing channel lineups; recording capability is checked before offering scheduling.
- [ ] Live tuning: establish consumer allocation/keepalive/release and native codec/transcode behavior before allocating a real tuner.
- [x] DVR host operations: template-driven scheduling, subscription cancellation/preferences and scheduled/conflict status display, with confirmation and synthetic-only writes.
- [ ] DVR server acceptance, target storage/location selection and comprehensive conflict-management workflows.
- [x] Watchlist host operations: account-backed paged reads, confirmed add/remove, and exact-GUID local availability across scoped server grants.
- [ ] Watchlist cloud/profile acceptance and remote paging/recovery on the packaged app.
- [x] Plex catalogue metadata search/details and local matching; source-backed and synthetic signed-account journey exercised.
- [ ] Licensed/ad-supported catalogue playback: establish Plex service authorization, DRM and ad obligations; do not substitute personal-PMS playback contracts.
- [ ] Inventory remaining official-client features/entitlements and map each to implemented, unsupported or blocked evidence.

### Baseline runtime and reusable development process

- [ ] Provide a bounded legacy-engine HTTP transport without weakening token/redirect/TLS policy; current stream requirement can block the intended oldest engine.
- [ ] Verify fetch/Promise/URL/UTF-8/blob and CSS API support on the oldest supported engine; add required compatibility implementation.
- [ ] Add automatic manifest/package privilege/identifier and credential-leak checks.
- [ ] Wire Samsung host/mock/ES5/source gates into CI, keeping LG recipes unchanged.
- [ ] Automate emulator install/launch/readiness/keys/logs/capture/teardown on a supported host.
- [ ] Automate authorized lock-aware retail install/test/capture/teardown with explicit target identity.
- [ ] Prove the reusable workflow on a generated second app, not just Plex.
- [ ] Establish cold-start/first-Home/first-frame/memory/latency/long-session numeric budgets per tier.
- [ ] Run current-app acceptance and populate the model/firmware support register; earlier probes do not count.
- [ ] Validate signing/update/uninstall, separate Store/branding/legal feasibility, and release packaging.
- [ ] Finish developer/user onboarding and publish only after runtime acceptance and explicit release authorization.

**Immediate order:** multipart source contract (host done) -> playback transition regressions ->
request cancellation/legacy-engine transport -> browsing/localization -> expanded media/service
contracts -> packaged-runtime/device acceptance. Hardware-dependent tasks can be prepared but not
marked done from mocked results.
