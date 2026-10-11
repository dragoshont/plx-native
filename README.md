# PlxNative

This fork contains the **LG webOS native client** and a separate, **experimental Samsung Tizen
TV client**. Both keep Plex Media Server as the library and watch-progress authority; neither
requires a replacement server.

| Your TV | Application | Installation and status |
|---|---|---|
| LG webOS | Native Rust application, GPU-rendered UI and LG decoder, packaged as `.ipk` | [LG installation](docs/install-and-verify.md); existing LG app is unchanged |
| Samsung Tizen | Separate ES5 Web application using AVPlay, packaged as `.wgt` | [Samsung installation](docs/samsung-getting-started.md#install-the-current-samsung-client); developer install/launch and native sign-in capture observed on one 2017 UE55MU6172; full acceptance still in progress |

<a href="https://trendshift.io/repositories/244171?utm_source=repository-badge&utm_medium=badge&utm_campaign=badge-repository-244171" target="_blank" rel="noopener noreferrer"><img src="https://trendshift.io/api/badge/repositories/244171" alt="GLinnik21/plx-native | Trendshift" width="250" height="55"/></a>

**LG upstream:** [GLinnik21/plx-native](https://github.com/GLinnik21/plx-native) ·
[plxnative.com](https://plxnative.com/) · [LG troubleshooting](docs/troubleshooting.md).
The website, screenshots below, native/60-fps claims, `.ipk` releases and Homebrew Channel
instructions describe **LG**, not Samsung. Samsung has no Store listing or general-purpose
signed download: developer signing must include your TV's DUID. The LG demo loop is a visual
reference, not proof of Samsung performance or pixel parity.

PlxNative is independent and is not affiliated with Plex, LG or Samsung.

## Samsung: what is actually ready?

| Capability | Honest inventory |
|---|---|
| Sign-in and browsing | QR/code sign-in, profiles/PIN, owned/shared servers, Home, libraries, search and details are implemented and host-tested. Owner sign-in and developer install/launch are observed on the named 2017 set; the full remote loop is being recorded and audited |
| Navigation and artwork | LG-inspired feature/shelves/navigation, profiles, collections, people and return paths; profile-photo and extra-step fixes are tracked in the [issue ledger](docs/samsung-tizen-client-spec.md#real-tv-navigation-issue-ledger). Not every screen has native acceptance |
| Playback | AVPlay/PMS negotiation, resume/progress, tracks, captions, chapters/markers, versions and Up Next have source and synthetic tests. Earlier selected 2017 AVPlay clip probes do **not** certify current-app playback, HDR/audio, watch progress or every codec |
| Additional Plex features | Music, photos, Watchlist/catalogue browsing and parts of guide/DVR have host implementations. Live tuning and licensed catalogue playback remain unresolved |
| Sign-in storage | Saved automatically on this TV in unencrypted Web Storage; Settings opt-out and sign-out deletion. No remember-me step on the sign-in screen |
| Capture and performance | Fresh native renderer layers can be captured at about one frame per second. They are not the panel, do not include the hardware video plane, and do not prove 60-fps UI performance |
| Models | One 2017 development target is observed. Newer TVs, including The Frame, need their own model/firmware, codec, remote and lifecycle checks; a newer year is not a support guarantee |

Read the [capability and acceptance inventory](docs/samsung-upstream-readiness.md),
[beginner setup/install guide](docs/samsung-getting-started.md), and
[model/probe register](docs/samsung-tizen-poc.md) before installing.

## LG native client

The following is the upstream LG description, including its author's daily-use and hardware
claims. The app is reported to be in daily use on a 2019 LG set; this Samsung branch has not
independently reproduced those LG claims.

## Why this exists

The official Plex app on my old LG is slow. Scrolling a shelf stutters, opening a poster takes a
beat too long. It behaves like a web page because it is one: a web app running in the television's
Chromium. Patching it doesn't help — the ceiling isn't the code, it's the browser.

So I threw the browser away.

PlxNative draws straight on the GPU and hands video to the same silicon the built-in apps use. No
Chromium, no JavaScript, no web view. It just draws. Almost all of it is Rust, and I use it every
day to watch things off my server in the next room.

## What it looks like

Real captures of the app, not mockups: the same code that runs on the television, on the desktop
simulator, browsing a demo library of openly licensed films
([credits](docs/screenshots/CREDITS.md)). `make screenshots` regenerates them.

![Home](docs/screenshots/home.jpg)

**Home** — a rotating hero from what you're partway through and what's just landed, shelves under it.

![Library](docs/screenshots/library.jpg)

**Library** — a library opens on its own shelves: what you're partway through, with the time
left under the focused card, and what just landed. Further down is the full grid, with sort,
filter (including unwatched-only) and an A–Z rail down the side
([pictured here](docs/screenshots/ux-library-grid.jpg)).

![Search](docs/screenshots/search.jpg)

**Search** — one query across every server you can reach, results grouped by kind.

![Player](docs/screenshots/player.jpg)

**Player** — the transport with chapters and track menus, drawn over video the television decodes
itself. (In this capture the frame under it was decoded by the simulator.)

## What it does

- **An interface that keeps up with the remote.** 60 fps on the 2019 set I develop on, with
  frame-rate regression scenes that measure it on the television rather than trusting it.
- **Sign in on the TV** with an on-screen QR code and pick a Plex Home profile.
- **Browse and search your libraries** — on your own servers and on ones shared with you. Your
  servers' libraries, that is, not Plex's catalogue or Watchlist.
- **Direct play** H.264 and HEVC — 4K, 10-bit, Dolby Vision profiles 5 and 8, E-AC-3 Atmos, and AV1 or VP9 (10-bit VP9 only on webOS 4 sets)
  on televisions whose codec table lists that decoder — decided against your television's own
  codec table where it publishes one. Anything else the server transcodes, and you can switch a
  playback to Auto to follow a link whose speed changes.
- **Everything you expect while watching**: resume, seek and scrub, chapters, audio and subtitle
  tracks (including image subtitles), Skip Intro, Skip Credits, Up Next with auto-advance, and
  progress reported back to your server.

## Will it work on my television?

**It needs webOS 4.0 or newer**, with one tested exception: a 2016 set on **webOS 3.4.3** signs
in, browses, searches and plays (direct play, transcodes, subtitles and seeking) through Developer
Mode. Other 3.x releases are untested, and anything older than 3.4 is unknown. Past that, it most
likely will. I develop and test on a 2019 set, and opt-in usage reports show
video playing on sets from 2018 through the newest, on webOS 11 — both direct play and server
transcodes, Developer Mode installs included.

### Known issues

| Where | What happens |
|---|---|
| **Some 2019 sets on LG's k5lp or k3lp chip**, installed through Developer Mode | Video won't play. On these sets LG's Developer Mode sandbox can withhold a device the video path needs — Kodi and Moonlight hit the same wall. The app checks for it and says so instead of crashing; other sets on the same chip play normally. On a rooted TV with Homebrew Channel, the failure screen offers **Repair**, which applies the Homebrew Channel fix to the sandbox (one owner fixed it this way from a root shell; the button itself hasn't been run on an affected set yet). Without root there is no fix. |
| **2018 sets on firmware that reports platform release 3.9.3** | Sign-in and browsing work, but video has never been seen to start on one, and no error is reported either: [#249](https://github.com/GLinnik21/plx-native/issues/249). |
| **webOS 3.x** | Seeking restarts the stream at the new position instead of jumping in place, so each seek takes a moment longer. In-place seek depends on the internal layout of LG's 4.x media player, and on 3.4 that layout differs. |
| **Sets on LG's k6hp chip** | A crash seen in opt-in crash reports and not reproduced here, because I have no such set: [#174](https://github.com/GLinnik21/plx-native/issues/174). |

### Rooted or not

**No root is needed.** A regular TV in Developer Mode runs everything except the k5lp/k3lp Repair
above. What Developer Mode costs you is renewal: if the session lapses, LG removes the apps
installed through it ([how to keep them](docs/install-and-verify.md#important-developer-mode-expires)).
A rooted TV with Homebrew Channel has no expiry.

If something goes wrong, check [Troubleshooting](docs/troubleshooting.md) first, then
[tell me what happened](https://github.com/GLinnik21/plx-native/issues/new/choose) — and if you own one of the
sets above, it working is as useful a report as it failing.

## Installing

**First time installing an app outside the LG Content Store?** Follow the
[**step-by-step installation guide**](docs/install-and-verify.md). It starts with a regular LG
webOS TV, a computer on the same network, and a Plex account with access to your own or a shared
server. **No root is required.**

Set up LG Developer Mode and connect with webOS Dev Manager, then choose:

- **Install PlxNative directly:** add only PlxNative to the TV; install future `.ipk` updates from
  your computer.
- **Install Homebrew Channel first:** get an app catalogue on the TV, then install PlxNative and
  its updates with the remote.

**Already have Homebrew Channel?** Find [PlxNative in its catalogue](https://repo.webosbrew.org/apps/com.beb.plxnative/)
and select **Install**. Skip the computer setup.

**Developer Mode needs periodic renewal.** If it expires and LG disables Developer Mode, apps
installed through it are removed. Installing Homebrew Channel through Developer Mode does not
remove that requirement. The guide explains [how to renew the session](docs/install-and-verify.md#important-developer-mode-expires).

For manual `.ipk` downloads, [verify the release checksum](docs/install-and-verify.md#verifying-the-package)
before installing. Homebrew Channel verifies catalogue downloads for you.

## Nightly builds

Every day `main` moves, CI cuts a nightly `.ipk` from wherever it stands. It installs beside the
regular app as **"PlxNative Nightly"** — its own tile, its own sign-in — so trying it never touches
the release you already trust.

**With Homebrew Channel:** under Settings choose **Add repository**, enter
`https://plxnative.com/nightly/repo.json`, then install PlxNative Nightly. Every later nightly
appears there as an update. The [nightly builds guide](docs/nightly-builds.md) has the steps, how
the versions work and what to do if something goes wrong.

**Without it:** each build is a
[prerelease](https://github.com/GLinnik21/plx-native/releases?q=nightly), and the newest is always
linked from [plxnative.com/nightly/latest.json](https://plxnative.com/nightly/latest.json). Install
it with Dev Manager; a package installed that way does not update itself.

**It is not tested on a television.** It passes the same automated build and packaging checks a
release does, but nobody has watched it play. Each nightly is deleted 30 days after it is
published, so link to a specific `.ipk` at your own risk.

## Release candidates

Before a release, CI may publish a release candidate as a
[prerelease](https://github.com/GLinnik21/plx-native/releases?q=rc) named like `PlxNative 0.8.0-rc.1`.
It is the release build itself, so it **installs as the regular PlxNative app**, replacing the one
you have the way an update would. It is not in the Homebrew Channel, and the Channel will not offer
the final release over it either: reinstall the final by hand once it is out.

## Privacy

**Your library data never reaches me.** The app talks to your Plex server, to `plex.tv` to sign in,
and to `discover.provider.plex.tv` for cast biographies.

**Crash reports and usage analytics are off until you turn them on** — two separate first-run
questions, each answerable with Don't Share, both reversible later under Account → Settings →
Privacy & data. No title, search term, subtitle line, server name or address can appear in any
report. [`PRIVACY.md`](PRIVACY.md) is the whole statement, including the schemas.

ASS/SSA subtitles render natively during direct play, including styles, positioning, overlapping
signs and dialogue, karaoke, and embedded fonts. External ASS files retain their original scripts.
A re-encode still burns the selected subtitle on the server; over a remux the app draws a sidecar, and an embedded track when the link is local and the Part is 1..=30000 kbps, and otherwise the server burns it.

## The honest scope

I built this for how *I* watch, so it's narrower than Plex's:

- **Movies and TV shows.** No music, no photos, no live TV or DVR.
- **No typing in server addresses.** Servers come from your Plex account; set them up on a phone or
  PC and choose from what's there. Servers reached through Plex's relay, or that require an
  encrypted connection, are supported but haven't been watched end to end.
- **One person's spare time.** There will be bugs I haven't hit, because I don't watch the way you do.

If that fits, it's genuinely nice to use. If it doesn't, the official app will serve you better.

## Contributing

Issues and pull requests are welcome, especially from anyone whose television or library differs
from mine — [**docs/building.md**](docs/building.md) is the build and the test loop, and says what
hardware I most need help with. Feature ideas go to [Discussions >
Ideas](https://github.com/GLinnik21/plx-native/discussions/categories/ideas). Security issues go
through [`SECURITY.md`](SECURITY.md) rather than a public issue.

## Acknowledgements

Error monitoring for PlxNative is sponsored by [Sentry](https://sentry.io/for/good/).

<a href="https://sentry.io/for/good/">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/sentry-wordmark-light.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/sentry-wordmark-dark.svg">
    <img alt="Sentry" src="docs/assets/sentry-wordmark-dark.svg" width="160">
  </picture>
</a>

## Licence

[GPL-3.0-or-later](LICENSE), © 2026 Gleb Linnik. The PlxNative name and its brand artwork are excluded — see
[`TRADEMARKS.md`](TRADEMARKS.md), which also carries the Plex and LG non-affiliation statements.
Third-party components and their licences are in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) and `licenses/` — notably the app ships its own
LGPL build of FFmpeg. Those notices and licence texts ship inside the `.ipk` too, so they travel
with the binary and not only with this repository.

This is an unofficial client, not affiliated with, endorsed by, or sponsored by Plex GmbH or LG
Electronics. "Plex", "Rotten Tomatoes", "IMDb", "TMDB", "LG" and "webOS" are trademarks of their
respective owners; where they appear in the app, they identify whose service or score is being shown.

## Star history

<a href="https://www.star-history.com/?repos=glinnik21%2Fplx-native&type=date&legend=bottom-right">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=glinnik21/plx-native&type=date&theme=dark&legend=bottom-right">
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=glinnik21/plx-native&type=date&legend=bottom-right">
    <img alt="Star history chart" src="https://api.star-history.com/chart?repos=glinnik21/plx-native&type=date&legend=bottom-right">
  </picture>
</a>
