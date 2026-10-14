# Vemm legacy identity audit

**Audit scope:** case-insensitive `plx|plex` over every tracked path and readable
tracked file on 2026-10-14, before this remediation was applied.

The audit found 34 matching tracked paths and 175 matching text files. After the
app-owned path/runtime rename, only four tracked path names intentionally retain
the terms:

| Path | Classification | Decision |
|---|---|---|
| `docs/plex-openapi.json` | `RETAIN_PROTOCOL_SERVICE` | Plex protocol evidence |
| `samsung/Vemm/js/plex-api.js` | `RETAIN_PROTOCOL_SERVICE` | Plex HTTP/auth/server client |
| `tests/tizen/plex-api.test.js` | `RETAIN_PROTOCOL_SERVICE` | Contract tests for that client |
| `licenses/PlxNative-historical-MIT.txt` | `RETAIN_HISTORY_PROVENANCE` | Immutable historical grant |

Every content hit is classified by the rules below. The most specific rule wins;
the audit deliberately does not impose a global ban on the words Plex or Plx.

## RETAIN_PROTOCOL_SERVICE

Keep terms that identify the external service or its wire/domain contract:

- Plex, Plex Media Server and PMS in user-facing or technical explanations.
- `plex.tv`, `*.plex.direct`, Plex-owned metadata/discover hosts and Plex
  privacy/link URLs.
- `X-Plex-*` headers, `plex://` GUIDs, Plex provider/agent identifiers and
  `com.plexapp.plugins.library`.
- Protocol/reference paths such as `docs/plex-openapi.json`, `docs/pms-api.md`,
  `js/plex-api.js` and `plex-api.test.js`.
- `PlexApi` and `PlexAccountPreferences`, because those module names describe
  Plex service clients rather than Vemm-owned presentation/runtime identity.
- Accurate UI copy such as "Plex account", "Plex server" and "Plex-compatible".

These names are not Vemm branding and must not be mechanically replaced.

## RETAIN_HISTORY_PROVENANCE

Keep terms required to tell the truth about inherited source and prior releases:

- PlxNative attribution, historical MIT grant and immutable source references.
- Published `samsung-v*` tags, `Plx-*.wgt` assets, old release URLs/checksums
  and the historical `PlxNative0.Plx` installation identity.
- Dated device/probe/benchmark evidence that names the tested Plx release,
  application registration or old source revision.
- Historical support, rollout and repository-independence records.
- Inherited source catalogs under `samsung/locales/`, including old product
  copy required for provenance. The generated Vemm runtime bundle includes only
  strings statically required by current Vemm UI sources plus the reviewed
  `samsung/strings.json` additions; it does not rewrite or package unused
  LG/native/telemetry/root-repair copy.

These references describe old facts. They do not define Vemm's active technical
identity.

## MIGRATE_APP_OWNED

The active Vemm product now owns these identities:

| Surface | Vemm identity |
|---|---|
| Source path | `samsung/Vemm/` |
| Package / application | `VemmTvApp0` / `VemmTvApp0.Vemm` |
| Widget origin | `https://vemm.invalid/tizen` |
| Local storage/device keys | `vemm-tizen-*` |
| Runtime/UI module globals | `Vemm*` except Plex service clients |
| DOM card marker / CSS animation | `vemmCard` / `vemm-spin` |
| Binary artifact | `Vemm-X.Y.Z.wgt` |
| Complete source | `Vemm-source-<sha>.zip` |
| Release tag | `vX.Y.Z` |
| Signing environment | `VEMM_*` |
| Local configuration | `~/.config/vemm/` |
| Temporary build/profile | `vemm-tizen-build.*` / `vemm-build` |
| Canonical future repository | `dragoshont/vemm` |

App-owned `Plex*` globals were migrated to `Vemm*` where they represented
presentation, preferences, playback policy, Samsung capability/backend,
graphics, queues, localization or other Vemm behavior. Plex service clients
remain explicitly named for the protocol they implement.

## Separate-install decision

Vemm is a **separate install**, not an update or data migration for the
historical Plx app:

- Vemm does not use `PlxNative0` / `PlxNative0.Plx`.
- Vemm does not read `plx-tizen-*` keys or the old session-record format.
- Vemm does not share the old author/config/profile/artifact/tag conventions.
- Installing Vemm does not uninstall or modify the old app.
- A user links Plex and chooses Vemm preferences again.

No signed package, device install, release, repository creation/rename or public
setting mutation was performed by this source remediation.

## Narrow regression policy

`tests/tizen/vemm-technical-identity.test.js` rejects legacy identity only on
active technical surfaces and Vemm runtime code. It separately asserts that
Plex protocol/service names and PlxNative historical provenance remain present.
This prevents both accidental legacy branding and destructive protocol/history
rewrites.
