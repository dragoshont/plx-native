# Samsung screen system

This describes the built Samsung Web UI, not the LG renderer or a Samsung support declaration.
The owner-pinned direction is Apple-like simplicity, with PlxNative's LG screens as the visual
reference. The viewing scene is a dark living room, several metres from the panel, using a remote.

## Visual language

Near-black `#101012` ground, neutral `#222224` surfaces, white `#f2f2f7` foreground/focus,
`#b8bfcc` secondary copy and pale-red explicit errors. Use the installed system sans-serif stack;
do not download fonts. Ordinary screen copy is 24px or larger, page headings 48px, identity
headings 56px and the Home feature title 64px at the 1920px reference viewport.
Focus is a white outline or a white control with dark text; selected settings also carry their
own indicator. Icons accompany labels, never replace them.

## Screen families

| Family | Composition |
|---|---|
| Sign-in and account recovery | Existing paired short code/QR and explicit consent/retry controls; automatic expiry renewal |
| Profiles and PIN | Centred identities with circular initials; protected-profile marker; separate numeric PIN entry |
| Servers and favourites | Structured selection rows, then grouped account/navigation actions |
| Home | Compact destination navigation, one featured title with Open details, library choices, horizontal shelves |
| Libraries and collections | Browse toolbar and six-column portrait grid; three-column landscape or square music artwork |
| Search and people | Large search field, server-labelled shelves; biography/portrait and image/title credit rows |
| Details | Cinematic art and scrim with one primary action; square cover for music/collection variants; extras and cast below |
| Watchlist and catalogue | Poster grid and selected filters; cover, metadata and explicit local-availability actions |
| Guide and DVR | Provider selection, program rows, channel/date views, recording status and server-supplied preference fields |
| Photos | Contained image above one grouped navigation/slideshow row |
| Playback | Four-control transport/progress overlay; secondary controls in More; five-second auto-hide independent of captions |
| Settings and diagnostics | Named settings groups, persistent selection indicators; separate diagnostic/recovery view |
| Confirmations and states | Explicit operation/item copy, confirmation and cancel; readable loading, empty and error/retry copy |

## Layout and input

Use Flexbox, margins and ordinary ES5 DOM helpers, not CSS Grid, flex-gap, CSS custom properties
or modern browser-only framework dependencies. Portrait grids reduce to four columns below
1400px; settings become one column. Long screens and shelves scroll, and focused controls are
revealed using rectangle-based nearest-edge scrolling, without depending on modern
`scrollIntoView` options. Card focus is restored by media identity after a library page append.

Do not initiate playback from a Home feature, biography or availability lookup. Resume uses the
PMS-selected on-deck **episode**, not its show ID. A missing on-deck episode leaves season browsing
available. All watched-state, Watchlist and DVR changes retain explicit confirmation.

## Evidence and boundaries

The product and media DOM journeys cover the screen routes, selection, paging, episode identity,
photo controls and confirmed mutations using synthetic accounts, servers and AVPlay.
Browser captures at 1920x1080 and 1280x720 were inspected across these families, including
populated profiles/PIN, filters, person credits and DVR forms. Artwork and media in those captures
are synthetic; browser captures do not prove Samsung-panel rendering, codec support or performance.
Native acceptance and the remaining LG/official-client capability differences are recorded in
`../docs/samsung-tizen-client-spec.md`.
