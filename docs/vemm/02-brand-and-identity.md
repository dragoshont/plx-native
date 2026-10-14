# Vemm brand and identity

## Working identity

**Name:** Vemm
**Pronunciation:** `/vem/`, one syllable
**Working tagline:** **Your media. At its best.**

Vemm is the working product identity for this independently maintained,
unofficial Plex-compatible Samsung Tizen media player. It is not a claim of
trademark registration, exclusivity or completed legal clearance. Existing
businesses use VEMM in unrelated fields; final naming clearance remains an
external decision.

## Identity layers

| Layer | Current decision |
|---|---|
| User-facing source display name | **Vemm** |
| Product/protocol name sent to Plex | **Vemm** |
| Repository | `dragoshont/plx-native`, unchanged pending migration approval |
| Installed Samsung application/package | `PlxNative0.Plx` / `PlxNative0`, unchanged |
| Saved settings/session keys | Existing `plx-tizen-*` keys, unchanged |
| Signing identity | Existing author continuity, unchanged and not accessed by this transition |
| Historical releases/assets | Existing Plx names, tags, filenames and links remain immutable |

Display branding must never be used as a shortcut for changing compatibility,
signing or source-provenance identity.

## Visual system

The Vemm mark is an original two-surface `V`, designed for legibility at
launcher size and from normal living-room distance. It avoids Plex, Samsung,
Microsoft and upstream PlxNative logos and avoids literal film/media objects.

Source-maintained assets:

- `samsung/brand/vemm-mark.svg`
- `samsung/brand/vemm-wordmark.svg`
- generated packaged copy: `samsung/PlexTv/brand/vemm-mark.svg`
- deterministic launcher raster: `samsung/PlexTv/icon.png`

`tools/tizen/build-icon.py` parses the simple vector geometry and generates the
PNG with Python's standard library. No font download, image library or build
dependency is introduced.

The restrained palette extends the existing dark television UI:

| Role | Value |
|---|---|
| Primary background | `#101820` |
| Secondary surface | `#1B2838` |
| Accent | `#0078D4` |
| Accent depth | `#58A6E7` |
| Primary foreground | `#F4F7FB` |
| Secondary foreground | `#A8B7C8` |

Existing white focus fills, system typography, cinematic artwork composition
and remote-first spacing remain. Azure blue is reserved for identity and
primary actions rather than decorating every surface.

## Usage and non-affiliation

Use **Vemm** for current source, application screens, contributor documentation
and future release presentation. Describe published 0.2.7 and older packages
with their historical display name when accuracy requires it.

Vemm is unofficial and is not affiliated with, endorsed by or sponsored by
Plex, Samsung, LG, Microsoft or the upstream UI project's maintainer. Product
and service names identify their respective owners.
