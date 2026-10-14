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
| Repository | canonical target `dragoshont/vemm`; current PR remains in the old repository for review provenance |
| Installed Samsung application/package | `VemmTvApp0.Vemm` / `VemmTvApp0` |
| Saved settings/session keys | `vemm-tizen-*`; no old setting/token import |
| Signing identity | a future Vemm author, separate from the historical Plx app |
| Historical releases/assets | Existing Plx names, tags, filenames and links remain immutable |

Vemm and the historical Plx application are separate installs. Installing Vemm
does not update, uninstall or read data from the old app.

## Visual system

The Vemm mark is an original rounded folded `V`, recreated from the
user-authorized visual references for legibility at launcher size and from
normal living-room distance. It avoids Plex, Samsung, Microsoft and upstream
PlxNative logos and avoids literal film/media objects.

Source-maintained assets:

- `samsung/brand/vemm-mark.svg`
- `samsung/brand/vemm-app-icon.svg`
- `samsung/brand/vemm-wordmark.svg`
- generated packaged copy: `samsung/Vemm/brand/vemm-mark.svg`
- deterministic launcher raster: `samsung/Vemm/icon.png`

`tools/tizen/build-icon.py` parses the simple vector geometry and generates the
PNG with Python's standard library. No font download, image library or build
dependency is introduced.

The restrained palette extends the existing dark television UI:

| Role | Value |
|---|---|
| Primary / front fold | `#3B82F6` |
| Light / rear fold | `#B7D0FF` |
| Charcoal | `#1F1F1F` |
| Soft gray | `#E5E7EB` |
| White | `#FFFFFF` |

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
