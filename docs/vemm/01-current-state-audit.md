# Vemm current-state audit

**Audit baseline:** `7b82c0fe` (`origin/main` on 2026-10-14)
**Evidence rule:** statements marked **Observed** come from the current tree,
tests, Git metadata, or published release metadata. **Proposed** statements are
transition decisions, not claims about already-completed behavior.

## Current product

**Observed:** the active product is one Samsung Tizen Web application under
`samsung/PlexTv/`. It is plain ES5 HTML/CSS/JavaScript, uses public Tizen APIs
and Samsung AVPlay, and is composed by `main.js` from focused modules under
`js/`. The LG Rust/C implementation and its build/site/release closure are not
in the active tree; immutable history and licensing references remain.

**Observed:** the source display label was `Media for Tizen`. Published Samsung
0.2.7 still appears as **Plx**. Existing installations use application
`PlxNative0.Plx`, package `PlxNative0`, historical `Plx-*.wgt` filenames, saved
`plx-tizen-*` storage keys, and the existing author certificate. These are
compatibility identities, not current brand choices.

## Architecture and dependencies

| Area | Current code | Dependencies and coupling |
|---|---|---|
| Product composition | `samsung/PlexTv/main.js` | Owns routing, presentation state, focus, lifecycle and feature orchestration; large but already delegates protocol and playback contracts |
| Plex integration | `js/plex-api.js`, `js/session.js`, `js/account-preferences.js` | Transport, auth, discovery, metadata, playback requests and bounded response handling; presentation calls these APIs directly through feature flows |
| Playback policy | `js/playback.js` | Chooses Direct Play, Direct Stream or transcode from media, preferences and capability profile; manages PMS negotiation/progress around a backend |
| Capability evidence | `js/capabilities.js`, `js/model-register.js` | Distinguishes published Samsung specifications from one exact observed model/firmware tuple |
| Playback backend | `js/avplay.js` | Encapsulates `webapis.avplay` lifecycle, callbacks, seek/state/error normalization and resource cleanup |
| Presentation | `main.js`, `css/style.css`, feature helpers | Remote-first DOM UI, explicit focus/Back behavior, bounded image ownership and generated localization |
| Optional graphics | `js/graphics.js` | Small default-off WebGL backdrop seam with DOM/CSS fallback; measured slower than the existing path in matched device runs |
| Distribution | `samsung/build.py`, `release.py`, `source_bundle.py` | Stages current app plus notices/licenses; signing and publication require separate authorization |

Reusable abstractions already exist around AVPlay, playback negotiation,
capability evidence, preferences, sessions, graphics fallback, queues,
television/DVR behavior, subtitles and account preferences. The repository does
not need a speculative universal platform framework to become maintainable.

## Test and device coverage

**Observed:** `tools/tizen/test.sh` runs generated-locale and icon freshness,
59 JavaScript contract/DOM suites, Python staging/source tests, graphics probe
self-tests, benchmark adapter tests, syntax checks and the strict ES5/Chromium
M47 gate. Tests use synthetic accounts, servers, media and AVPlay.

**Observed:** exact device evidence is retained in the Samsung device and
performance documents. It covers named 2017, 2019, 2023 and 2025 televisions
with different scopes. It does not certify all TVs, media tuples, HDR/audio,
panel output, physical remote behavior or the current candidate.

**Observed at this audit checkpoint:**

- Installed Tizen TV Builder: `0.1.0`.
- `tizen.py doctor`: Tizen CLI `2.5.25`, SDB `4.2.36`, device not contacted.
- A new Vemm transition regression failed against the baseline because
  `js/product.js` did not exist. This reproduced the missing product-identity
  seam before implementation.

## Technical debt and refactoring opportunities

1. `main.js` still owns broad presentation orchestration. Extract only proven,
   stable contracts; broad file moves would add risk without reducing current
   coupling.
2. Product identity was repeated across manifest, HTML, Plex headers, docs and
   scripts. A small read-only identity module can make the runtime brand
   coherent without touching installed identity.
3. Playback policy already returns a machine reason code, but the reason,
   capability evidence and fallback are not a first-class decision record.
   Strengthening that output improves diagnostics and tests without rewriting
   AVPlay or PMS negotiation.
4. Capability evidence is conservative but concentrated in mutable plain
   objects. Continue exact-tuple registration and source-backed documented
   profiles; do not infer acceptance from year alone.
5. The prior icon was deterministic but not vector-first. Original SVG sources
   plus dependency-free deterministic raster generation improve provenance and
   release reproducibility.
6. Several documents still describe the temporary label and must distinguish
   current Vemm source, published historical Plx releases and preserved
   compatibility IDs.

## Release, licensing and provenance constraints

- Source remains GPL-3.0-or-later with inherited copyright, historical grants,
  complete-source obligations and third-party notices intact.
- The separate MIT Tizen TV Builder toolkit is not an application dependency
  and must not absorb GPL product implementation.
- Published tags, releases, assets, checksums, source links and display names
  are immutable historical records.
- A future update must keep package/application IDs, author continuity and
  saved settings unless a separately approved migration proves otherwise.
- Ordinary PR CI performs host/source checks only. Signing, device operations
  and publication remain tag-gated or local-author operations with explicit
  authorization.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Brand rename accidentally creates a separate installed app | Pin `PlxNative0` / `PlxNative0.Plx`, storage keys and signing paths in regression tests |
| New visual language harms old TVs | Keep system fonts, existing layout/focus model and dependency-free CSS; use accent color selectively |
| Architecture work becomes a rewrite | Strengthen existing product identity and playback/capability seams only |
| Direct Play claims exceed evidence | Preserve documented/observed/unknown states and expose the evidence source in diagnostics |
| New assets copy protected identity | Use original geometry, retain GPL provenance, and document Vemm as a working brand without clearance claims |
| Host success is mislabeled device acceptance | Keep host, SDK, emulator and retail evidence separate; device acceptance remains skipped without authorization |
