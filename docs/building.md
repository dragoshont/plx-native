# Building and distributing Vemm for Samsung

The maintained source is `samsung/PlexTv/`, a public-API Tizen Web app with
Samsung AVPlay. No ARM cross-toolchain, native Makefile or LG SDK is required.
Node and Python 3.10+ run the host checks; an **already-installed** Tizen Studio
Web CLI is needed only for the unsigned SDK build or separately authorized
signing. Do not install SDKs or access certificates as an implicit test step.

## Host loop

```sh
npm ci --prefix tests/tizen --ignore-scripts --no-audit --no-fund
tools/tizen/test.sh
tools/tizen/build-source.sh samsung/PlexTv
```

`test.sh` runs synthetic DOM/API contracts, independent repository inventory,
locale/icon freshness, Python staging/source tests, benchmark/probe host tests
and the ES5/Chromium M47 compatibility gate. No device or account is contacted.
`build-source.sh` uses `TIZEN_CLI`, PATH or `TIZEN_HOME`, builds unsigned into a
unique temporary directory and removes only its owned output.

Catalogs are under `samsung/locales/`; additions/overrides are
`samsung/strings.json`. After edits run
`node tools/tizen/build-locales.js --write`.
The original icon is reproducible with `python3 tools/tizen/build-icon.py --write`.
Both generated outputs have freshness checks.

Commit and confirm a clean tree before the final gates. Afterward confirm the
tree remains clean; bind evidence to that exact SHA. An unsigned source build
does not prove signing, install/update, remote input, AVPlay decoding, HDR,
panel output or performance. Those require separately authorized named-model
acceptance, not an LG native benchmark.

## Compatible distribution

Existing installations use `PlxNative0` / `PlxNative0.Plx`. Keep that identity,
the `plx-tizen-*` saved-setting keys and existing author certificate. **Vemm**
is the display/product identity, not a new app/package ID. Published `Plx-*.wgt`
assets, display names and `samsung-v*` tags remain immutable.

For a separately authorized future release:

```sh
python3 samsung/source_bundle.py --output /absolute/private/release-directory
python3 samsung/release.py X.Y.Z --notes-file docs/release-notes/samsung-vX.Y.Z.md
```

The source builder refuses a dirty or untracked source tree and existing output
files. It archives **all tracked source at HEAD**, including tests, build recipes,
catalogs, notices and license texts; its filename includes the exact SHA and it
writes a checksum. The local publisher includes that archive and checksum next
to the WGT. `--no-publish` builds without publishing, but still requires signing
authorization. Do not execute the publisher merely to validate source cleanup.

`samsung/build.py` stages the product plus `LICENSE`, `LICENSING.md`,
`THIRD-PARTY-NOTICES.md`, `TRADEMARKS.md` and the explicit `LICENSE_FILES`
inventory from `licenses/` (not arbitrary local directory contents). These are legal payload,
not executable dependencies. Review actual archive entries and preserve matching
complete-source availability under GPL section 6(d).

`.github/workflows/samsung.yml` runs host/source checks for all PR/main changes.
Its SDK/signing job is restricted to an explicit `samsung-v*` tag. It preserves
the existing local-author publication handoff when a release already exists;
ordinary CI artifacts are not signed production updates. Release identity and
post-publication checks are in [the transition contract](samsung-project-transition.md).
