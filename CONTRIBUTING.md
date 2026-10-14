# Contributing

This repository maintains **Vemm for Samsung Tizen** independently. Vemm is a
working brand; changing display identity does not authorize changing installed
Samsung IDs, saved settings, signing identity or historical release names. Open
Samsung issues and pull requests in
[dragoshont/plx-native](https://github.com/dragoshont/plx-native), not against
the LG author's project. The native LG tree is retired from the active source;
its history, copyright and source obligations remain. Samsung changes belong
in `samsung/`, `tests/tizen/` and the Samsung-specific tools/docs.

Read `docs/vemm/03-architecture.md`, then run
`npm ci --prefix tests/tizen --ignore-scripts` and `tools/tizen/test.sh`
for Samsung changes. Keep ES5/runtime compatibility, existing app/signing
identity, default-off experimental features and original fallback behavior.
Record exact model/current runtime for device claims; GPU/API access is not a
performance result. No household account writes in automated tests.

Reusable toolkit improvements go to
[Tizen TV Builder](https://github.com/dragoshont/tizen-tv-builder). Its MIT
licence does not permit copying GPL app code into MIT-only modules; retain
application adapters here or preserve an explicitly compatible licence boundary.

New contributions to this application's own code are offered under GPL-3.0-or-later, without copyright
assignment. Retain existing third-party notices and identify external code, its source revision,
license and modifications. Do not submit code whose redistribution rights you cannot establish.

Please include a `Signed-off-by: Your Name <email>` trailer certifying the
[Developer Certificate of Origin 1.1](https://developercertificate.org/). This records your right
to contribute; it is not a transfer of copyright or a requirement to re-sign historical MIT work.
Use the project verification workflow in `AGENTS.md`, and preserve unrelated changes.

See [building and distribution](docs/building.md) for unsigned host checks and
matching complete-source archives. Do not publish an SDK-signed throwaway-author
build as an update to an installed release. Main uses one squash commit per PR.
