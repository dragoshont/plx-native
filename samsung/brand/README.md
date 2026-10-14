# Vemm brand sources

`vemm-mark.svg` and `vemm-wordmark.svg` are original GPL-3.0-or-later artwork
for the Vemm working brand. The mark uses two forward surfaces to form a
restrained `V`: Azure blue for the active edge, a lighter blue for depth, and
the product's dark television palette.

`tools/tizen/build-icon.py --write` copies the vector mark into the packaged
application and deterministically rasterizes `samsung/PlexTv/icon.png`. The
wordmark remains a source/repository/release-presentation asset; the app header
uses live text plus the mark so localization and accessibility do not depend on
text embedded in an image.

Vemm is a working brand, not a claim of trademark clearance or exclusivity.
