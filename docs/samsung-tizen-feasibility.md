# Samsung Tizen (2018+) feasibility study

Status: desk study, 2026-10-09, against `38c07fc3` (`main`). Nothing here was run on a Samsung
television. No code was changed, and the LG app is untouched. Claims are tagged **[repo]** (read in
this tree), **[samsung]** (Samsung developer documentation) or **[unverified]**.

## Verdict

**Conditional no-go for porting this application as it stands; conditional go for a small,
hardware-backed spike that reuses the Plex *knowledge* rather than the Plex *code*.**

PlxNative's value on LG is a Rust renderer drawing on the GPU and a media pipeline that feeds the
TV's own decoder through Starfish/ACB. Both are LG-specific by construction. Samsung publicly
documents web apps (`.wgt`) and, separately, Tizen .NET and Flutter for TV [samsung]; it documents
no route for loading a native ARM `.so`/staticlib with its own EGL and decoder access. The Rust
protocol layer is portable in design but not in its transport, so what survives is a specification,
not a drop-in library.

The spike is justified only if the owner has (a) a 2018 Samsung set, (b) the appetite to write a
JavaScript/TypeScript client, and (c) accepts that "2018+" means three different engines.

## Claims checked

| Claim (README / site) | Result |
| --- | --- |
| Native Rust, no Chromium/JS/web view, GPU-drawn UI | **[repo] holds.** `ui`, `gfx` (GLES2/EGL/SDL2_ttf), `screens` are Rust; C is `main.c`, `starfish.c`, `svg.c`, `ass.c`, crash helpers (about 2.0k lines). |
| Video on the TV's own decoder | **[repo] holds**, via `tv::sink::VideoSink` implemented by `player::ffi` (Starfish/ACB). |
| webOS 4.0+ (site) | **Partly.** README adds one tested 3.4.3 exception, and lists 2018 sets reporting platform 3.9.3 on which "video has never been seen to start" (issue #249). The site's "4.0+" and "sets from 2018" are less hedged than the README. |
| 60 fps, daily use on a 2019 set | **[unverified].** The repo has on-device frame-rate scenes, but no result was reproduced here. |
| Plex Media Server retained, no replacement server | **[repo] holds.** Data layers are `plex`, `session`, `data`; no server code. |
| GPL-3.0-or-later | **[repo] holds** (`LICENSING.md`, `LICENSE`). Copyleft applies to any derivative; the app also ships an LGPL FFmpeg build. |

## What is reusable

Layer sizes (Rust lines, `src/` only) and Samsung portability. The layer graph is enforced by
`ci/module-layers.ini` and `ci/check-module-layers.py` **[repo]**.

| Layer | Lines | Reuse on Samsung |
| --- | --- | --- |
| `base`, `machine` | 10k, 5k | Pure logic, but Rust. Reusable only if compiled to Wasm. |
| `plex`, `session`, `data` | 34k, 19k, 40k | The **contract** is reusable: endpoints, auth/PIN flow, hub/library/search behaviour, resume and progress rules (`docs/pms-api.md`, `plex-api*.md`). The **code** depends on `plx_net`, which is libcurl via `dlopen` plus raw sockets, and on threads. A browser needs `fetch`/`XMLHttpRequest` instead. |
| `net` | 12k | Not reusable. libcurl/socket transport and key pinning have no browser equivalent. |
| `gfx`, `ui`, `appkit`, `screens` | 15k, 70k, 14k, 84k | Rendering code is not reusable (GLES2/EGL/SDL). Layout, focus and navigation **design** (`docs/ui-restructure-spec-v4.md`, `ux-scenario.md`) is. |
| `media` | 97k | Not reusable. Own FFmpeg demux (`ff`, n3.3 ABI offsets), buffer-feed pump and ACB bind stages target Starfish. Samsung exposes AVPlay or HTML `<video>`/MSE instead. |
| `platform`, `port` | 17k | webOS-only identity, key stores, LS2 services. |

`docs/module-layers.md` records that the OS-neutral port (L15b) is **open**: `VideoSink` is still a
Starfish-shaped verb trait and the ACB sequence is not behind it. A second port would need that
work first. No Samsung-specific reference exists in the tree (searched `.rs`, `.md`, `.toml`,
`Makefile`).

## What Samsung allows

All from Samsung's developer documentation **[samsung]** unless noted.

| Year | Tizen | Chromium | WebAssembly |
| --- | --- | --- | --- |
| 2018 | 4.0 | 56 | **No** official support |
| 2019 | 5.0 | 63 | **No** official support |
| 2020 | 5.5 | 69 | Yes (documented "from Tizen 5.5 (2020 models)") |
| 2021 and later | 6.0+ | 76+ | Yes |

- The Wasm page states support starts at 2020 models, so **2018/2019 sets cannot be assumed to
  run a Rust-to-Wasm build** at all; that excludes the very sets the study targets.
- 2018 video limits: MSE supports FHD but not UHD; DTS audio unsupported. A 2018 UHD path needs
  AVPlay (hardware plane, closest analogue to the LG design).
- `.wgt` is the documented distribution format; .NET and Flutter exist but are separate stacks and
  their per-model-year support was **not verified** here.
- Developer-mode install needs a signing certificate including the TV's DUID
  (see `samsung-getting-started.md`). Store distribution is a separate review process.

## Options

| Option | Reuse | 2018 viable | Cost / risk |
| --- | --- | --- | --- |
| **A. Port the Rust app natively** | Maximum | Unknown; no documented native loading route | Needs undocumented access; Samsung's decoder is reached through AVPlay, not an ABI we can bind. Treat as blocked until Samsung documents it. |
| **B. Rust core to Wasm + JS shell** | Medium (data layers) | **No** for 2018/2019 | Rewrite transport, drop threads, still need a JS UI and AVPlay adapter. |
| **C. New web client from the Plex spec, AVPlay adapter** | Docs and UX design only | Yes (Chromium 56, transpile, no Wasm) | A new product with its own bundle tiers; the real work is playback adaptation and low-end performance. |
| **D. Do nothing; recommend streaming boxes** | None | n/a | Cheapest; weakest for owners of those sets. |

**Recommendation:** only C is viable on 2018 hardware, and it is not a port of this codebase.
Do not start it before the spike gate below.

## Spike gate (before any implementation)

On an owned 2018 UHD set, with a Developer-Mode sideload of a minimal `.wgt` (no Plex code yet):
1. Record actual model code, firmware, Tizen and `navigator.userAgent`.
2. Play H.264/AAC and HEVC Main10 samples through AVPlay; note DTS/subtitle behaviour.
3. Measure remote-driven UI scroll latency in a plain DOM list with ~200 poster tiles.
4. Fetch from a Plex Media Server over HTTPS and HTTP on the LAN; note certificate trust failures.

**Go** if playback, scrolling and fetch all work acceptably. **Stop** if AVPlay cannot play the
test files or HTTPS to a personal server fails without a documented workaround.

## Constraints that carry over

- GPL-3.0-or-later: any derived code must be offered under the same terms; a clean-room web client
  from the public Plex docs is not derived.
- Never write to a real Plex account during testing; use a guest or mock server
  (`AGENTS.md`).
- Do not publish TV addresses, DUIDs, certificates or tokens.
- "Plex" and the app name are trademarked (`TRADEMARKS.md`).

## Open questions

- Does Samsung document any native-code route for TV (not .NET/Flutter)? Only the absence of one
  in the consulted pages is established; ask Samsung or the maintainer.
- Real 2018 AVPlay behaviour, Chromium 56 performance and certificate trust: untested.
- The two PlxNative-specific reports mentioned in the prior research were not available; this
  study replaces them with direct reading of the repository.
