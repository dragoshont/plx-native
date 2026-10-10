# Samsung screen system

This describes the built Samsung Web UI, not the LG renderer or a Samsung support declaration.
The owner-pinned direction is Apple-like simplicity, with PlxNative's LG screens as the visual
reference. The viewing scene is a dark living room, several metres from the panel, using a remote.

## Owner-selected reference

The LG/webOS **application screens in the looping demo on [plxnative.com](https://plxnative.com/#feel)**
are the primary visual reference, not the website's landing-page styling or the LG launcher.
The owner explicitly selected this loop after reviewing the Samsung redesign.
It shows artwork spanning the screen, compact centred Home/Movies/TV Shows/Search navigation,
a separate profile control, title artwork with restrained metadata, a clear Continue/Resume action
and quieter secondary actions. The poster shelf meets the hero rather than starting below an
isolated feature panel. In the shelf view, focused artwork grows and its title/remaining time
become prominent without a heavy rectangular border around the whole card.

Samsung now reproduces those compositions instead of the boxed Home hero and bottom-of-page
utilities. The [loop analysis](../docs/samsung-lg-loop-analysis.md) records captured states,
implementation mapping and deliberate deviations. The source describes the loop as frame-by-frame
webOS simulator output from an openly licensed library. It is visual evidence, not independently
observed LG hardware behavior or proof that Samsung rendering/playback matches it.
The loop covers Home, a movie detail page and library navigation; it does not establish the
appearance or behavior of every settings, episode or playback menu.

## Visual language

Near-black `#101012` ground, neutral `#222224` surfaces, white `#f2f2f7` foreground/focus,
`#b8bfcc` secondary copy and pale-red explicit errors. Use the installed system sans-serif stack;
do not download fonts. Ordinary screen copy is 24px or larger, page headings 48px, identity
headings 56px; cinematic Home/detail type scales with viewport height (Home title `7vh`).
Button focus fills only the control with white and dark text, without an outer border or halo.
Media focus uses a small lift and brighter artwork; Home reveals only the focused caption. It never frames the
whole poster and caption. Selected settings have a separate indicator. Transport controls use
icons with retained accessible names; other controls keep visible labels.

## Screen families

| Family | Composition |
|---|---|
| Sign-in and account recovery | Paired short code/QR with retry and automatic expiry renewal; optional saved sign-in is managed in Settings |
| Profiles and PIN | Centred identities with circular initials; protected-profile marker; separate numeric PIN entry |
| Servers and favourites | Structured selection rows, then grouped account/navigation actions |
| Home | Full-bleed feature, persistent Home/favourite-library/Search capsule, separate Account menu, explicit play/info/cycle controls and poster shelves |
| Libraries and collections | Browse toolbar and six-column portrait grid; three-column landscape or square music artwork |
| Search and people | Large search field, server-labelled shelves; biography/portrait and image/title credit rows |
| Details | Cinematic art and scrim, expandable two-line synopsis, primary action and round restart/More controls; secondary actions hidden until requested; extras and cast below |
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

Displaying, focusing or cycling a Home feature never initiates playback. Its explicit Play/Continue
button does; info opens details. Biography and availability lookups never play. Resume uses the
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
