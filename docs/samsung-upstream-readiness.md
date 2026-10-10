# Samsung upstream-readiness backlog

**Decision: not ready to announce completed Samsung support or native LG parity.**
The separate Samsung client has a broad source/host baseline; developer installation is observed.
Neither implies that its playback, account lifecycle and runtime constraints match the LG app.
LG remains unchanged. Plex Media Server remains the library/watch-state authority.

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

The LG-inspired Home/detail changes are documented in the [loop analysis](samsung-lg-loop-analysis.md).
They are not a substitute for closing the following runtime gates.

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
