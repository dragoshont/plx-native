# Vemm repository and release migration plan

This source transition does not rename `dragoshont/plx-native`, detach its fork,
change ownership, modify public repository settings, sign a package or publish
a release.

## Source transition

The reviewable PR may:

- establish Vemm in current source, docs and future release presentation;
- preserve installed identity and saved settings;
- keep historical Plx release names and links accurate;
- add original brand assets and tests;
- improve existing architecture seams.

## Separately approved remote migration

Before any repository rename or fork-network change:

1. Re-audit live fork status, redirects, release/download URLs, Actions,
   issues/PRs, security reporting, source offers and external links.
2. Decide whether a rename alone is sufficient. Do not delete/recreate the
   repository to simulate detachment.
3. Preserve all tags, releases, assets, checksums, issues, PR metadata and Git
   history.
4. Update source/documentation links only after the provider operation and
   verify redirects plus release downloads.
5. Announce the migration separately from an application release.

Domain registration, trademark filing, repository ownership transfer and fork
detachment require explicit human decisions outside this source change.

## Separately approved application release

A future Vemm-branded Samsung update must:

1. use a new immutable `samsung-vX.Y.Z` tag;
2. keep `PlxNative0` / `PlxNative0.Plx` and the existing author certificate;
3. keep compatible historical artifact naming unless a migration assessment
   proves a safe alternative;
4. include matching complete source, checksums, GPL/notices and build guidance;
5. pass exact-candidate host CI and named-model update/launch/playback checks;
6. verify author continuity and installed version without uninstalling the
   working app;
7. distinguish source readiness, signed package verification, developer
   installation and Samsung Store approval.

This plan recommends no release until human review accepts the Vemm candidate
and separate device/release authorization is granted.
