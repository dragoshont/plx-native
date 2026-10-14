# Third-party notices: Vemm Samsung client

The active product is the Samsung Tizen Web application in `samsung/PlexTv/`.
This application's source is **GPL-3.0-or-later**, Copyright (c) 2026 Gleb Linnik
and contributors; see [LICENSE](LICENSE) and [LICENSING.md](LICENSING.md).
Independent maintenance/removal of the native tree is not relicensing.

## Inherited source and catalogs

The UI was inspired by Gleb Linnik's PlxNative. The language-picker catalog,
localization catalogs and source-derived protocol/interaction contracts retain
their inherited provenance and GPL terms. The twelve catalogs now live in
`samsung/locales/`; the 190-entry language test fixture records its original
source URL. The original implementation, notices and build recipes remain at
[f74610c8e8fda765245f548adcc6565becdca31b](https://github.com/dragoshont/plx-native/tree/f74610c8e8fda765245f548adcc6565becdca31b)
and historical release tags. Earlier MIT grants remain in
[licenses/PlxNative-historical-MIT.txt](licenses/PlxNative-historical-MIT.txt).

The original Vemm vector mark and wordmark live under `samsung/brand/`.
`tools/tizen/build-icon.py` deterministically rasterizes the launcher icon and
copies the packaged mark; source and generated outputs use GPL-3.0-or-later.
No upstream PLX logo, splash, fonts, movie art or website assets are shipped by
the current source.

## Runtime APIs and host dependencies

Tizen's Web runtime and Samsung AVPlay/webapis are provided by the television,
not copied into this WGT. The `$WEBAPIS` script reference resolves on the TV.
No LG native libraries, bundled FFmpeg, libass, Rust binary or Tizen toolkit
implementation is included in the Samsung application payload.

Node/jsdom/acorn and their transitive dependencies are host-only test tools,
locked in `tests/tizen/package-lock.json`; their own notices remain in their
installed distributions. They are not staged into the WGT.
`docs/plex-openapi.json` is a retained Plex API reference (its `info` identifies
its source), used by host contracts, not an application dependency.
Plex metadata, artwork and media fetched at runtime remain their owners' content;
do not include household media or personal data in public fixtures/packages.

## Preserved historical notices

[licenses/native-history-NOTICES.md](licenses/native-history-NOTICES.md) preserves
the former native package's complete dependency inventory, including its
copyright/attribution notices. The other license texts in `licenses/` remain
available for historical source obligations. They are not claims that this WGT
ships those native components. Historical binary/source offers and published
assets are not cancelled by retiring active native code.

Future Samsung distributions include this notice, the GPL and related license
texts, plus a matching complete source archive next to the WGT. See
[building and distribution](docs/building.md). Trademark/identity reservations
remain separate in [TRADEMARKS.md](TRADEMARKS.md).
