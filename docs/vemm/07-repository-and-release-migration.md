# Vemm repository and release migration plan

The source candidate is reviewed in `dragoshont/plx-native`, but the canonical
target is the currently available `dragoshont/vemm`. This transition does not
create/rename that repository, detach the old fork, change ownership, modify
public settings, sign a package or publish a release.

## Source transition

The reviewable PR may:

- establish Vemm in current source, docs and future release presentation;
- use a clean Vemm package, storage and build identity;
- keep historical Plx release names and links accurate;
- add original brand assets and tests;
- improve existing architecture seams.

## Approved technical identity

Vemm is a separate application:

- package `VemmTvApp0`;
- application `VemmTvApp0.Vemm`;
- source path `samsung/Vemm/`;
- storage/device keys `vemm-tizen-*`;
- artifacts `Vemm-X.Y.Z.wgt`;
- complete source `Vemm-source-<sha>.zip`;
- tags `vX.Y.Z`;
- environment/config/profile names `VEMM_*`, `~/.config/vemm/` and
  `vemm-build`.

There is no automatic import of old credentials or preferences. The historical
Plx application remains a separate install.

## Separately executed remote migration

Before any repository rename or fork-network change:

1. Re-audit live fork status, redirects, release/download URLs, Actions,
   issues/PRs, security reporting, source offers and external links.
2. Create/populate `dragoshont/vemm` through a fresh reviewed PR. Do not
   delete/recreate `dragoshont/plx-native` to simulate detachment.
3. Preserve all tags, releases, assets, checksums, issues, PR metadata and Git
   history.
4. Update source/documentation links only after the provider operation and
   verify redirects plus release downloads.
5. Announce the migration separately from an application release.

Domain registration, trademark filing, repository ownership transfer and fork
detachment require explicit human decisions outside this source change.

## Separately approved application release

A future first Vemm Samsung release must:

1. use a new immutable `vX.Y.Z` tag;
2. use `VemmTvApp0` / `VemmTvApp0.Vemm` and establish a Vemm author certificate
   that is retained for later Vemm updates;
3. publish `Vemm-X.Y.Z.wgt` and `Vemm-source-<sha>.zip`;
4. include matching complete source, checksums, GPL/notices and build guidance;
5. pass exact-candidate host CI and named-model update/launch/playback checks;
6. verify the new Vemm install and preserve any historical Plx installation;
7. distinguish source readiness, signed package verification, developer
   installation and Samsung Store approval.

This plan recommends no release until human review accepts the Vemm candidate
and separate device/release authorization is granted.
