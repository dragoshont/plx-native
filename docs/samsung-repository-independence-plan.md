# Samsung repository independence plan

Approved scope, 2026-10-14: plan, implement and squash-merge the Samsung-only
active tree into this repository's remote `main`. This replaces the earlier
instruction to keep an unused LG implementation in the active tree.

The later Vemm working-brand transition supersedes this plan's temporary
`Media for Tizen` display-label decision. Its package/signing/storage,
provenance and historical-release constraints remain in force.

## Inventory and dependency decisions

The implementation base is `f74610c8e8fda765245f548adcc6565becdca31b`.
The initial worktree contained equivalent pre-0.2.6 commits rather than that
complete snapshot; integration commit `03027feb` has exactly the parent's tree.
Remote `main` was `203dd0cf` and is an ancestor of that parent. Refresh it again
before integration; preserve every later change, not just the branch's index.

`git ls-files`, the Samsung scripts' file reads/imports and retained Markdown
links establish this closure:

| Paths | Decision | Reason / required action |
| --- | --- | --- |
| `samsung/PlexTv/`, `samsung/{build,install,release}.py`, Samsung product/design/privacy docs and `strings.json` | KEEP, update | Product and existing update path; neutral display identity, original icon, notices in staged WGT |
| `tests/tizen/`, `tools/tizen/` | KEEP, update | App contracts, ES5 gate, unsigned/signing wrappers and isolated Samsung probes; no new toolkit copy |
| `locales/{en,es,be}/*.json` | EXTRACT to `samsung/locales/` | `build-locales.js` reads all twelve catalogs; preserve content/attribution and regenerate byte-equivalent translations |
| `rust-modules/plex/src/plex/languages.rs` | EXTRACT test data | Freeze its language pairs in `tests/tizen/fixtures/account-languages.json`; compare the Samsung picker to this independent fixture, not deleted Rust |
| `docs/plex-openapi.json`, `docs/pms-api.md` | KEEP | Television contract tests and subtitle/PMS source references; mark the inherited protocol reference's historical native examples |
| `docs/samsung*.md`, `docs/install-samsung.md`, `docs/release-notes/samsung-v0.2.7.md` | KEEP, correct links | Samsung specifications, dated source/device evidence, release/rollout history |
| `LICENSE`, `licenses/`, historical MIT grant | KEEP | No relicensing; preserve inherited rights, notices and historical source offers |
| `THIRD-PARTY-NOTICES.md` | EXTRACT old inventory to `licenses/native-history-NOTICES.md`, replace root | Clearly separate historical native dependencies from actual Samsung package contents |
| Root README, AGENTS, CLAUDE, CONTRIBUTING, PRIVACY, SECURITY, LICENSING, TRADEMARKS | KEEP, rewrite relevant claims | Samsung-first ownership, tests, privacy, support and copyright; no upstream endorsement |
| `.github/workflows/samsung.yml`, issue templates | KEEP, update | Own support and unconditional Samsung host CI; signed publication only on existing `samsung-v*` tag contract |
| `.github/FUNDING.yml`, other workflows and native composite actions | REMOVE | Upstream sponsorship, LG native builds/releases/nightlies/Pages/site/video/cache automation are not Samsung services |
| `rust-modules/`, `src/`, `include/`, `assets/`, `pkg/`, `ipkroot/`, `vendor/`, `ci/`, root `Makefile` | REMOVE tracked paths only | No Samsung runtime/build imports after extraction; native build/link/packaging/artwork closure |
| `tests/` except `tests/tizen/`; `tools/` except `tools/tizen/` | REMOVE tracked paths only | LG device suite, native/media/build/site helpers are not part of Samsung host acceptance |
| `site/` including CNAME; remaining non-Samsung docs | REMOVE tracked paths only | No upstream custom domain, LG website, screenshots, native instructions or development backlog as current product |
| `.agents/`, `.claude/`, `.codex/` native roles, skills, hooks and Rust plugin settings | REMOVE tracked paths only | Obsolete ARM checks, TV locks, native GC and release instructions must not remain executable policy |
| `.gitignore`, nested Samsung/test ignores | KEEP, clarify | Preserve legacy privacy/generated exclusions even after tracked native paths disappear; never unignore private artifacts |

No Samsung source relocation is necessary. Keep parked Samsung-only Rust/.NET/
Wasm/graphics experiments under `tools/tizen/` and their dated limitations; they
are not the shipped renderer. Keep historical source references as immutable
links to the base revision, not broken active local paths. The separate MIT
Tizen TV Builder repository is outside this change's mutable scope.

## Active-tree target and identity

The maintained product is a Samsung Tizen Web app using public APIs and AVPlay.
Use **Media for Tizen** as a descriptive temporary display label, not a chosen
permanent commercial brand. Replace the active PLX artwork with an original
geometric screen icon; retain historical trademark reservations as provenance.
Keep UI-inspiration credit brief and separate from GPL/copyright obligations.
No Apple, Plex, Samsung or upstream-maintainer endorsement or clean-room claim.

Preserve `PlxNative0` / `PlxNative0.Plx`, author-certificate continuity, existing
saved-setting keys, historical tags, versions, release assets, filenames and
URLs. Do not read certificates, deploy, sign or publish a release for this task.
An updated display name is not proof that a signed update was accepted by a TV.

## Baseline and final acceptance

Before removal, `tools/tizen/test.sh` passes all 58 test files and the strict
ES5/Chromium M47 gate (25 shipped files), elapsed 10.14 s on this host.
The first attempt identified missing jsdom; pinned dependencies were then
restored with `npm ci --prefix tests/tizen --ignore-scripts --no-audit --no-fund`.
Installed Tizen TV Builder 0.1.0 reports CLI 2.5.25 / SDB 4.2.36, no device
contact. Its validator accepts a staged 0.2.7 manifest and its unsigned SDK
build succeeds (2.90 s including wrapper startup). These are host baselines,
not hardware acceptance.

1. Add a regression inventory check that fails against the retained native
   tree/branding, then passes only with the Samsung-only closure, own routing,
   preserved package IDs, license texts and staged distribution notices.
2. Verify catalog equivalence and the extracted language fixture before
   deleting their native homes. Add no production dependency.
3. Run the full Samsung host suite, account-free acceleration/benchmark adapter host tests and Python
   packaging/source tests. Check generated locales/icon freshness, local
   documentation links and tracked-path inventory. Manually audit prose for
   contradictions caused by this change.
   Parked Rust/.NET/Wasm probes keep their separate binary/toolchain-dependent
   procedures; they are not silently counted as executed by the Web host gate.
4. On a clean committed candidate, run the full host suite, staged manifest
   validation, an unsigned source build with the already-installed SDK, and
   source archive/notice smoke checks. Record exact source SHA and before/after
   durations in the PR; no native `make build-bench` applies after its entire
   LG build and Makefile are retired.
5. Push the branch, create a PR with the host PR tool, require Samsung host CI
   on the exact candidate. Do not invoke SDK installation, certificate access
   or signing jobs on ordinary branch/PR checks. Retain the explicit tag-only
   release route and installed-app identity.
6. Refresh remote `main`, inspect merge-base and exact changed paths, and
   squash-merge through GitHub without force/history rewrite. Verify resulting
   `main` SHA, source tree and final Samsung CI.

## Public routing and repository settings

Enable this repository's Issues after confirming admin permission. Keep
Discussions off unless needed. Set truthful Samsung-specific description and
topics. Remove upstream funding/support links and Pages/CNAME source; disable
retired workflows and confirm Pages is not configured (initial API: 404).
Do not modify upstream, send outreach, rename the repository or publish posts.

GitHub still reports a fork. The parent has separately exported metadata,
PR #1/comments/reviews, all six Samsung releases and fifteen assets plus a
verified Git bundle. That is a content backup, not proof of restorable provider
metadata identities or URLs. Do not delete/recreate or use a metadata-destructive
leave-network action. Source cleanup and landing do not depend on detachment.

## Rollout and rollback

This is a source/support migration, not an app rollout. Existing installations
and published releases remain unchanged. Future releases use the existing
author and package identities, include license/provenance notices and matching
complete source, and still require separately authorized named-TV acceptance.

Review deletion against the tracked inventory, never recursively clean a
checkout or touch gitignored/private/generated paths. If acceptance fails, fix
the Samsung closure or revert this migration with a new commit; do not reset
shared branches or rewrite tags. Native sources, their build recipes and
historical policies remain recoverable at the immutable base and release tags.
Existing GPL source offers and release assets are not cancelled by removing
active native code.

External holds: final trademark clearance/repository name, preservation-safe
GitHub network detachment, and any later signed/device rollout. None authorizes deleting
metadata, installing SDKs, accessing secrets or using real Plex accounts here.
