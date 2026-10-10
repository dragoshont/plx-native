# Samsung Plex client

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

A Samsung TV owner browsing and playing personal and shared Plex Media Server libraries from
the couch with a TV remote. Plex remains the authority for media identity, permissions, watch
state and progress. This is a full client in development, not a replacement media server.

## Operating context

The current owner test device is a 2017 Samsung UE55MU6172. The wider investigation includes
2018+ televisions and The Frame; those models are not certified by this device's results.
The app is an ES5 Tizen Web application with AVPlay, separate from the existing LG Rust app.
Host DOM tests use synthetic accounts, servers and AVPlay. Browser renders prove layout, not
Samsung decoding, HDR, performance or panel output.

## Capabilities and constraints

Keep sign-in/QR renewal, profiles, server discovery, Home, libraries, search, details, people,
music/photos, Watchlist/catalogue, DVR, playback, settings and explicit confirmations available.
Preserve remote focus and Back behavior, bounded image/metadata retention and lifecycle cleanup.
Do not initiate playback or account writes merely to display or inspect a screen.
Do not add private APIs or unsupported playback claims to make the interface seem complete.
Licensed catalogue streaming and verified live tuning remain acceptance gaps.

## Brand commitments

The owner prefers Apple-like UI, with the upstream LG PlxNative implementation as the closest
reference, while retaining Samsung-compatible behavior. Revamp every Samsung screen as one
coherent experience. Keep the LG application and its design guidance unchanged.

## Evidence

The LG reference images are under `docs/screenshots/ux-*.jpg`; its component and theme sources
are `rust-modules/ui/src/widgets.rs` and `theme.rs`. Samsung implementation and acceptance truth
live in `docs/samsung-tizen-client-spec.md` and the Samsung feasibility/test register.

## Accessibility

Remote-first operation, visible focus, couch-legible text, labels alongside meaningful icons,
English/Spanish/Belarusian copy and scrollable long content. Focus must not imply selection or
permission, and unavailable actions must remain explicitly disabled or explained.
