# Samsung screen system

This describes the built Samsung Web UI, not the LG renderer or a Samsung support declaration.
The owner-pinned direction is Apple-like simplicity, with PlxNative's LG screens as the visual
reference. The viewing scene is a dark living room, several metres from the panel, using a remote.

## Visual language

Near-black `#101012` ground, neutral `#222224` surfaces, white `#f2f2f7` foreground/focus,
`#b8bfcc` secondary copy and pale-red explicit errors. Use the installed system sans-serif stack;
do not download fonts. Ordinary screen copy is 24px or larger, page headings 48px, identity
headings 56px and the Home feature title 64px at the 1920px reference viewport.
Button focus fills only the control with white and dark text, without an outer border or halo.
Media focus uses a small lift, brighter artwork and an underlined title; it never frames the
whole poster and caption. Selected settings have a separate indicator. Transport controls use
icons with retained accessible names; other controls keep visible labels.

## Screen families

| Family | Composition |
|---|---|
| Sign-in and account recovery | Existing paired short code/QR and explicit consent/retry controls; automatic expiry renewal |
| Profiles and PIN | Centred identities with circular initials; protected-profile marker; separate numeric PIN entry |
| Servers and favourites | Structured selection rows, then grouped account/navigation actions |
| Home | Selected Home destination alongside favourite libraries and Search; short featured title, poster shelves, service/account utilities below |
| Libraries and collections | Browse toolbar and six-column portrait grid; three-column landscape or square music artwork |
| Search and people | Large search field, server-labelled shelves; biography/portrait and image/title credit rows |
| Details | Cinematic art and scrim, two-line synopsis and primary action; square music/collection cover; extras and cast below |
| Watchlist and catalogue | Poster grid and selected filters; cover, metadata and explicit local-availability actions |
| Guide and DVR | Provider selection, program rows, channel/date views, recording status and server-supplied preference fields |
| Photos | Contained image above one grouped navigation/slideshow row |
| Playback | Icon transport/progress overlay; grouped audio/subtitle choices and native tracks behind Device tracks; More and submenu return paths; five-second auto-hide |
| Settings and diagnostics | Single-column value rows; quality/language alternatives on separate choice pages; privacy explanation in Diagnostics |
| Confirmations and states | Explicit operation/item copy, confirmation and cancel; readable loading, empty and error/retry copy |

## Layout and input

Use Flexbox, margins and ordinary ES5 DOM helpers, not CSS Grid, flex-gap, CSS custom properties
or modern browser-only framework dependencies. Portrait grids reduce to four columns below
1400px; settings remain one column. Long screens and shelves scroll, and focused controls are
revealed using rectangle-based nearest-edge scrolling, without depending on modern
`scrollIntoView` options. Card focus is restored by media identity after a library page append.

Do not initiate playback from a Home feature, biography or availability lookup. Resume uses the
PMS-selected on-deck **episode**, not its show ID. A missing on-deck episode leaves season browsing
available. All watched-state, Watchlist and DVR changes retain explicit confirmation.
Home episode shelves use the series poster when supplied, retaining episode number/title and
progress. Episode lists retain their stills rather than making every episode indistinguishable.
Original-file metadata, the PMS-reported stream and the requested transcode limit are distinct.
Missing stream metadata is labelled unreported, never substituted with the chosen limit.
This does not enable or advertise unevidenced original/direct playback.

## Evidence and boundaries

The product and media DOM journeys cover the screen routes, selection, paging, episode identity,
photo controls and confirmed mutations using synthetic accounts, servers and AVPlay.
Browser captures at 1920x1080 and 1280x720 were inspected across these families, including
populated profiles/PIN, filters, person credits and DVR forms. Artwork and media in those captures
are synthetic; browser captures do not prove Samsung-panel rendering, codec support or performance.
Native acceptance and the remaining LG/official-client capability differences are recorded in
`../docs/samsung-tizen-client-spec.md`.
