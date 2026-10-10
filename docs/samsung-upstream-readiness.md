# Samsung upstream-readiness backlog

**Decision: not ready to announce completed Samsung support or native LG parity.**
The separate Samsung client has a broad source/host baseline; developer installation is observed.
Neither implies that its playback, account lifecycle and runtime constraints match the LG app.
LG remains unchanged. Plex Media Server remains the library/watch-state authority.

## Current deployment receipt

On 2026-10-11, source `7c6f7158cb95ecffad955fc7ccac477d444c9bcf` was packaged with the existing Samsung developer certificate,
installed over `PlxTizenDv.PlexTv` and launched on the owner's previously identified 2017
UE55MU6172 (recorded firmware `T-KTMDEUC-1410.1`; not re-read during this deployment).
Samsung's install command exited successfully and the debug relaunch returned an Inspector port.
Signed package SHA-256: `69b0f2cfd39471168f1efd1847d504328cf65eea58dc314a756f6eff989d0428`.
The package's application assets were compared byte-for-byte with the committed source;
only the staged manifest received the explicit application/package IDs.
No remote navigation, playback or household Plex mutation was performed by the agent.
Fresh native renderer-layer captures were inspected: the installed sign-in screen has no
remember-me checkbox. A bounded live viewer completed 89 cycles without capture failures,
approximately 0.86 seconds per capture, on this static screen. These are separate paint
layers, not full panel/compositor screenshots, and exclude AVPlay's hardware video plane.
See [Inspector capture evidence and limits](samsung-web-inspector.md).
The owner subsequently signed in manually. The native navigation lane observed the profile/server
pickers, Home and shelves; its full LG-reference loop and after-fix comparison are still in progress.
Current-app native playback acceptance remains pending.
This is an install/launch and sign-in-rendering receipt, not panel or
native-playback acceptance. Host suites, strict ES5 parsing and unsigned source build passed
on the committed source before packaging.

## Latest upstream check

Fetched `GLinnik21/plx-native` on 2026-10-11 without merging it into this branch.
The latest observed upstream commit is
[`4e454ea037e355898d22f7f78198c64227748032`](https://github.com/GLinnik21/plx-native/commit/4e454ea037e355898d22f7f78198c64227748032).
It is 14 commits ahead of the original inspected/common-base revision
`38c07fc3e513066c70a90584ef6760672d6c6e5f`. This is a dated snapshot, not a live feed.

| New upstream work | Relevance to Samsung |
|---|---|
| [AV1](https://github.com/GLinnik21/plx-native/commit/17290659fae6ee1bdc2c6445b13ee2474d6984e1) and [VP9](https://github.com/GLinnik21/plx-native/commit/4e454ea037e355898d22f7f78198c64227748032) direct play gated by the set's codec table | LG-specific native playback/FFmpeg/platform changes. Do not transfer the supported-codec claim to AVPlay or newer Samsung models |
| [Reload details after player return](https://github.com/GLinnik21/plx-native/commit/1e07e0bc2e7a657939ad3522ac2fa65a5d30957f) | Product invariant worth checking: resume must reflect the PMS stop position; Samsung's current-app write/read-back acceptance is still pending |
| Undecodable-audio rejection and reopening interrupted direct-play transfers | Useful negotiation/recovery cases, not evidence Samsung already handles native decoder/transport failures |
| Bounded Recently Added paging and ahead-of-scroll posters | Recheck Samsung's 12-item Home shelf limit, decode concurrency and scrolling rather than copying LG's scheduler |
| Multiline subtitle cues, sign-out forgetting plaintext-connection answers, preference defaults staying reset | Include equivalent state/privacy tests where Samsung has that feature; not every LG preference exists in Samsung |
| ELF/storage-helper checks, agent/build docs and website press updates | Mostly LG packaging/tooling/documentation. They do not justify changing the preserved LG app in this Samsung slice |

The local LG description below the README's Samsung section still describes the checked-out LG
revision, not these unmerged AV1/VP9 additions. Keep upstream integration separate from the
Samsung fixes so a port update cannot silently replace working LG code.

This is the release gate for **LG movie/show capability parity**, not a promise to finish the
official Plex service ecosystem by copying LG. Music, photos, DVR, live tuning and licensed
catalogue streaming are tracked separately in the [product backlog](samsung-tizen-client-spec.md#10-unfinished-product-backlog).
The [LG comparison](samsung-tizen-client-spec.md#lg-capability-parity-owner-re-scope) maps the
implemented movie/show behaviors to their actual source.

## Closed source gaps in the current follow-up

| Gap | Resolution | Evidence boundary |
|---|---|---|
| Collection navigation lost Load more on returning from details and could repeat page one | Preserve cached page, loader and cursor; pass collection offsets to PMS | Synthetic 51-item collection journey |
| Careers stopped at 200 credits and local matching at 500 titles | 50-credit Previous/Next pages; compact incremental GUID index with reported 10,000-title safety ceiling | Synthetic 251-credit career and 900-title index; incomplete page rejection |
| Artwork concurrency ended at download, and the 61st URL could revoke an undecoded visible image | Include decode in the three-job limit, revoke after decode, timeout failed decodes and cancel on view exit | Synthetic 73-image lifetime/cancellation journey |
| Account icons overlapped labels; generic choices looked like More actions | Separate static leading icon slots; semantic refresh/clock/sort icons, no generic ellipsis fallback, localized sort directions | Failing-then-passing DOM/CSS regressions; inspected 1280x720 and 1920x1080 host captures; included in the installed package, Account-screen native acceptance pending |

The LG-inspired Home/detail changes are documented in the [loop analysis](samsung-lg-loop-analysis.md).
They are not a substitute for closing the following runtime gates.

## Follow-up feature parity review

Compared the current checked-out LG sources, not the historical official-Plex gap inventory
in `parity-gaps.md`. The website loop establishes composition, not coverage of these features.
**Full source parity is still incomplete**, separately from native acceptance.

| Area | LG evidence | Samsung evidence and verdict |
|---|---|---|
| Home, libraries and search | `screens/src/home/`, `library/`, `search/`, `onboard.rs` | Home feature/shelves, favorite libraries, server search, A-Z, server sort/filter choices and paged browse are present in `main.js`. Remote/Back coverage is host exercised, not complete panel acceptance |
| Movie/show navigation | `screens/src/detail/hero.rs`, `item_menu.rs` | **Host-implemented in this follow-up:** show and season card-menu Play resolve to a server-selected OnDeck episode, otherwise the first valid episode; the leaf's own ratingKey is fetched before playback. A direct Play trailer action appears only for a typed, identified trailer clip with a safe part key. `lg-parity.test.js` covers resolver, endpoint, trailer metadata and invalid/empty response contracts. This does not establish native playback |
| People, collections and alternate sources | `screens/src/person.rs`, `filmography.rs`, `collection.rs`, `alt_sources.rs` | Paged careers/collections, local GUID availability and Other servers are implemented. Local lookup has an explicit 10,000-title safety ceiling; this is not unlimited-library parity |
| Playback progress and continuation | `plex/src/plex/timeline.rs`, `media/src/route/`, `screens/src/player/` | Timeline, episode queue identity, Up Next, auto-next, markers/chapters, track/version changes and stop paths are implemented in `plex-api.js`, `player.js` and `main.js`. Actual AVPlay/PMS acceptance is pending |
| Audio/subtitle selection | `appkit/src/track_menu.rs` | **Host-implemented in this follow-up:** size, vertical position, color and timing controls apply only to the app-rendered SRT/WebVTT overlay; device-native and burned subtitles are explicitly excluded. Synthetic preference tests cover the allowlist, defaults and migration. Still missing: server subtitle search/download, account-level track policy and LG's audio boost/loudness controls. Native subtitle styling and audio processing need capability evidence before promising equivalence |
| Playback/account preferences | `screens/src/preferences.rs` (`page_fields`, `field_options`) | Samsung persists quality limit, locale, auto-next and Continue Watching action. **Host-implemented in this follow-up:** the configurable 5/10/15/30/60-second interval drives both on-screen seek controls and media-key seeks. Still missing: user-selectable Auto/Forced/Disabled direct-play policy and account audio/subtitle language/mode/forced preferences. Current safe negotiation is not the full LG quality/policy ladder |
| File information | `screens/src/tracks_panel.rs` | **Host-implemented in this follow-up:** a read-only detail inspector renders PMS-reported version/part container, size and bitrate, video resolution/profile/aspect and per-stream technical fields including reported Dolby Vision descriptors. Missing fields are omitted rather than interpreted as negative facts. `file-info.test.js` covers representative multi-track metadata. This is not a named-model file/playback certification |
| Platform and additional domains | LG Starfish/ACB/FFmpeg and platform lifecycle; Samsung AVPlay | LG-specific native mechanisms cannot be copied or certified by a browser. Music/photos/DVR/catalogue source paths do not close movie/show gaps; live tuning/licensed playback and Store distribution remain separate blockers |

Close the named source gaps with failing-then-passing synthetic journeys first; retain bounded
navigation and explicit failures. Then run the named-model native matrix below. Do not mark
this table complete merely by adding unavailable controls or copying LG's private interfaces.

## Required before a parity announcement

| Order | Remaining work | Done means | Constraint |
|---|---|---|---|
| 1 | Oldest-target network/runtime compatibility | Actual packaged app completes account/PMS metadata and artwork requests, cancellation, deadline and byte-limit checks with normal TLS and no token-bearing redirect follow | Strict ES5 parsing does not establish fetch/streaming support. Do not substitute unrestricted XHR, which automatically follows redirects, for `redirect: error` |
| 2 | Named-model direct/transcode policy | Model/firmware-bound capability profile is detected and tested; original/direct play, conservative fallback and quality changes preserve identity, aspect and actual stream reporting | Earlier AVPlay probe clips do not certify all media tuples or the current PMS negotiation path |
| 3 | Native playback parity matrix | H.264/HEVC, applicable UHD/HDR/audio, embedded/external/burned subtitles, versions, chapters/markers, multipart joins and seeks pass on each claimed support row | Requires actual AVPlay and panel/audio evidence, not fake adapter success |
| 4 | Plex progress and queue acceptance | Resume, final stop/read-back, video PlayQueue identity, Up Next/auto-next cancellation and watch confirmations match expected server state | Needs a specifically authorized test profile/item and write operations; Guest alone does not make household writes disposable |
| 5 | Remote/navigation acceptance | Every LG-parity route has focus/Back/retry behavior; held OK/context menu, scrub/repeats, long titles, all three locales, player More/submenus and five-second auto-hide work on the remote | Owner's brief manual testing is useful feedback, not a complete matrix |
| 6 | Lifecycle and memory | Long browsing/playback, network/server interruption, sign-out, remembered-session deletion, process exit and standby/restore have measured outcomes without unintended playback or writes | Measure decoded image and retained metadata memory; a Blob URL count is not a decoded-memory measurement |
| 7 | Reproducible distribution | Manifest/privilege/credential checks, CI, deterministic package receipt, signing/update/uninstall and developer instructions are repeatable | Developer signing is not Store approval; public name/branding/distribution need their own decision |
| 8 | Freeze and review the claim | Exact release source/artifact, model/firmware support rows, passed/failed/skipped cases and known limitations receive review | Publish only with explicit authorization; do not call unknown models or The Frame supported |

No honest implementation can mark rows 2–6 complete from host mocks. Art Mode remains a separate
acceptance gate only if The Frame is claimed. An unavailable private service or entitlement is a
documented blocker, not permission to fabricate a working feature or replace PMS.

## Short owner test of the installed redesign

Without asking the agent to change household watch state: check Home's feature/info/cycling,
Down to the first shelf and Up to the feature, poster focus, Account/Settings, detail synopsis
expansion, More/Back, season-to-episode browsing and return from collection/person details.
Playback and watched-state actions should only be exercised by the owner on content they intend
to watch/change, or by an authorized test procedure naming disposable records.

## Allowed upstream wording before these gates close

“A separate experimental Samsung Tizen Web client is implemented, with host-tested Plex contracts
and developer install/launch observed on one 2017 model. Native acceptance and support coverage
are still in progress.”

Do **not** replace that with “Samsung ready,” “full LG parity,” “all 2017+ TVs supported,” or
“The Frame supported.” A progress report can be accurate without being a support announcement.
