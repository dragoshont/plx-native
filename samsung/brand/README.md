# Vemm brand sources

`vemm-mark.svg`, `vemm-app-icon.svg` and `vemm-wordmark.svg` are original
GPL-3.0-or-later artwork recreated from the user-supplied rounded folded-V
references. The mark is two overlapping rounded capsule strokes: Vemm blue
`#3B82F6` in front and light blue `#B7D0FF` behind. The dark app-icon surface is
charcoal `#1F1F1F`; soft gray `#E5E7EB` and white `#FFFFFF` remain supporting
palette colors.

`tools/tizen/build-icon.py --write` copies the transparent vector mark into the
packaged application and deterministically rasterizes `vemm-app-icon.svg` to
`samsung/Vemm/icon.png`. The wordmark uses a native system-font stack and is a
source/repository asset; the app itself uses live text plus the mark so it has
no Inter or downloaded-font dependency.

Vemm is a working brand, not a claim of trademark clearance or exclusivity.
The supplied presentation sheets are visual references only and are not shipped.
