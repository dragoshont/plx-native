# Samsung 0.2.7 publication and bounded rollout

Published 2026-10-13 as a [Samsung prerelease](https://github.com/dragoshont/plx-native/releases/tag/samsung-v0.2.7), from source `6527197599d042bd52990222aa02cbbfc110ce05`. No LG release or main-branch merge was performed.

The official [Samsung CI run](https://github.com/dragoshont/plx-native/actions/runs/38432469118) passed its host and WGT jobs on that source. Its generic CI artifact is not the released package. This repository's canonical `samsung/release.py` published the package locally with the existing release author because CI release-signing secrets were absent, as supported by `samsung.yml`.

The real public download, checksum, package version/application ID and source payload were checked independently. Both signature-reference digest sets and continuity with the 0.2.6 public author chain passed; this is not independent certificate-chain attestation. Executing the actual packaged preferences confirmed `enhancedGraphics=false`, including migration from older preferences.

| Artifact | SHA256 |
| --- | --- |
| Public `Plx-0.2.7.wgt` | `98de8a0990a443aa0912b00596686d84fe4297ba7dcee5bc4d8f2d9ad76c5944` |
| Device-specific re-signed package | `56edd73993a4c0b87c9ce7b02adc93c4ec33185dcc43cbca310a3ecade69ccc8` |

Normal toolkit installation re-signs with the user's existing personal author/distributor profile. That author intentionally differs from the public release author. Continuity with the preserved profile backup and prior installation record was checked before updates. Every non-signature payload file matches the public package byte-for-byte; harmless ZIP directory-entry differences were excluded from that file comparison.

## Verified installation outcomes

| Approved target | Result |
| --- | --- |
| Living-room QE65Q80CATXXH / Q80C | **Installed 0.2.7**, independently confirmed through public app metadata; previous version 0.2.6 |
| QE55QN70FAUXXH / QN70F | **Installed 0.2.7**, independently confirmed through public app metadata; previous version 0.2.6 |
| Sebi UE43RU7092UXXH | SDK update acknowledged and production registration confirmed; **installed version unknown**, because no additional potentially unremovable Tizen 5 metadata probe was created |
| UE55MU6172 | **Not updated in this rollout:** developer connection became unavailable before any production mutation |
| Bedroom UE43RU7092UXXH | Excluded from production updates: not part of the recorded 0.2.6 prior-install set and installed-author provenance not established |

The user requested attempts while the TVs remained awake. No wake/reboot, certificate/permission change or production uninstall/recreate workaround was used. Production Plx was not launched and its persistent settings were not read or changed. Existing acceleration remains unchanged; new enhancements default off.

Owned version-inspection helpers were removed on Q80C/QN70F and raw final registration lists retained. Both installed-version RPCs and the canonical/device file-payload binding were independently checked by the parent. All operator-held leases and forwards were released.

## Remaining operator actions

The stopped **PlxGraphicsMatrix** developer test app (`PlxGpuM001.Probe`) remains registered on the Bedroom 2019 TV after bounded SDK removal attempts failed. Delete only that test app through the TV's Apps UI; do not delete production Plx. Its successful GPU rendering cases are not a clean overall acceptance pass.

The 2017 update needs a reachable developer connection. The Sebi installed version needs confirmation before it is reported as verified. Neither limitation is a claim of GPU incompatibility.

On a confirmed updated TV, open Plx and use **Settings → Graphics → New graphics enhancements** to opt in. No extra GPU path is enabled automatically by this release.

See [the shared backend contract](samsung-optional-graphics.md), [named-device rendering evidence](samsung-graphics-device-matrix.md) and [release notes](release-notes/samsung-v0.2.7.md). Original signed artifacts, profile evidence, command output and device metadata remain private.
