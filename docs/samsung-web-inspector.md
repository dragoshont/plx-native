# Samsung Web Inspector diagnostics and capture

This tool inspects an **already running, debug-enabled Samsung web app** through
a local SDB forward. It does not install or launch an app, send remote keys,
navigate, reload, evaluate arbitrary scripts, read storage, or write Plex state.
Use it only with an owner-authorized development app. The fixed `Runtime.evaluate`
expression reads geometry and computed numeric typography; it is not a sandbox
against an app that has replaced browser APIs.

## Quick start

Requires Node 22 or newer and the installed Samsung SDB tool. The standalone
transport is pinned to `ws` 8.21.0, without native optional modules or compression.
It does not use the Samsung app test dependencies.

```sh
npm ci --prefix tools/tizen/inspector --ignore-scripts
npm test --prefix tools/tizen/inspector
node tools/tizen/inspector.js --help
```

First obtain the current app's debug port using Samsung's authorized SDK debug
workflow. Debug ports are ephemeral: `39506` below is **an example**, not a
permanent app port. Do not copy private target addresses, serials, DUIDs, tokens,
certificate paths or app logs into issues or source control.

Coordinate the single Samsung device lane before any SDB operation. For CLI
forward setup, take the atomic Samsung lease for the bounded operation, release
it immediately afterwards, and use the same pattern for teardown:

```sh
# Run only after verifying the selected target and port; placeholders are deliberate.
(
    set -eu
    mkdir /tmp/plx-samsung-device.lock  # Failure means stop; never break a live lock.
    trap 'rmdir /tmp/plx-samsung-device.lock' EXIT
    "$HOME/tizen-studio/tools/sdb" -s "<selected-target>" \
        forward tcp:39506 tcp:39506
)

node tools/tizen/inspector.js targets --endpoint http://127.0.0.1:39506
node tools/tizen/inspector.js probe --endpoint http://127.0.0.1:39506
node tools/tizen/inspector.js geometry --endpoint http://127.0.0.1:39506

# After inspection, remove only the forward that this lane created.
(
    set -eu
    mkdir /tmp/plx-samsung-device.lock
    trap 'rmdir /tmp/plx-samsung-device.lock' EXIT
    "$HOME/tizen-studio/tools/sdb" -s "<selected-target>" \
        forward --remove tcp:39506
)
```

Do not replace or remove an existing forward owned by another lane. SDB commands
can print private target identifiers; keep their terminal output private. The
inspector itself acquires `/tmp/plx-samsung-device.lock` around each invocation,
records a PID and random ownership token, and releases only its own lease. Do
not leave a manually held lease around these commands: they refuse an existing
lock. A killed process can leave a stale lock; coordinate with its owner and
prove it is gone before any manual recovery. The tool never breaks a lease.

`targets` emits only target indices and page/other kinds, not titles, target IDs
or URLs. A single page is selected automatically; multiple pages require
`--target-index N`. The index is from the current discovery response, not a
persistent target identity: rediscover after an app restart and avoid concurrent
app lifecycle changes. Only `http://127.0.0.1:PORT` is accepted, and the discovered
WebSocket must use that same authority and a `/devtools/page/` path.

The inspector does not manage Developer Mode, Local Network permissions, SDB
connection relays or TLS settings. Resolve connectivity using the SDK and owner
approved local workflow; never root the TV or disable browser/network security.

## What the output means

`probe` performs `Page.enable`, a fixed ES5-compatible `Runtime.evaluate`, and
`Page.canScreencast`. It does **not** attempt a screenshot or start a recording.
`geometry` reports viewport dimensions/scale and at most 200 visible element
boxes, known HTML tag kinds, DOM focus, viewport/scroll overflow and numeric font
size/line height. At most 2,000 elements are scanned; truncation is explicit.
An offscreen element can still have a layout box and is marked as such. Focus
may be omitted when the scan is truncated. A `lineHeight` of zero means the
computed value was nonnumeric (for example `normal`), not a zero-height line.

No text, class/ID/attribute values, input values, CSS URLs, DOM HTML, storage,
network bodies, console logs or remote error messages are exported. Host-side
allowlisting rejects malformed geometry instead of printing the peer's data.
Output is **`dom-css-geometry-not-pixels`**: it cannot prove text rasterization,
colors, artwork, overlays, a hardware video plane or what the panel displays.

Exit status is `0` for a completed discovery/diagnostic or saved capture, `2`
for an unavailable/unsupported screenshot or screencast, and `1` for invalid input,
transport, geometry, filesystem, interruption or lease errors.
Layer-capture failures also return `1` with a specific sanitized reason.
Diagnostic success does not mean pixels are supported. Capture receipts distinguish:

| Status | Meaning |
|---|---|
| `captured` | Actual Inspector PNG bytes were received and saved. Not reconstructed DOM. |
| `advertised` | `Page.canScreencast` returned true. Frames are still unproven. |
| `unsupported` | Capability returned false, or the protocol returned method-not-found. |
| `unavailable` / `rpc_timeout` | No usable reply within the deadline. The cause is not proven. |
| `unavailable` / `no_frames_before_deadline` | Start responded, but no frames arrived. |
| `unavailable` / `screencast_cleanup_failed` | Stop could not be confirmed. Disconnect occurred; reconcile the device before retrying. |

Each discovery, handshake and RPC has an absolute deadline of 100..15,000 ms
(`--timeout-ms`, default 15,000), including a peer that sends partial data.
Commands have finite sequential RPCs, so the complete invocation can take longer
than one RPC deadline. There are no automatic retries. Discovery is capped at
256 KiB and 100 targets, WebSocket messages at 12 MiB, outstanding RPCs at 16.
Compression and redirects are disabled. Late replies to timed-out requests are
ignored; disconnect rejects outstanding requests.

## Private pixel capture

Capture requires **explicit consent** because genuine pixels may contain
household titles, personal data, a sign-in PIN or licensed artwork. Output must
be an absolute path outside this repository, with an existing parent directory;
symlink parents are resolved, existing files/directories are never overwritten.
Files have mode `0600`; frame directories have mode `0700`. Raw pixels cannot be
sanitized like numeric diagnostics. Never publish them without reviewing them.

```sh
node tools/tizen/inspector.js screenshot \
    --endpoint http://127.0.0.1:39506 --allow-private-pixels \
    --output /absolute/private/capture.png

node tools/tizen/inspector.js screencast \
    --endpoint http://127.0.0.1:39506 --allow-private-pixels \
    --duration-ms 10000 --max-frames 120 --output /absolute/private/frames

# Working alternative on the measured retail TV: separate native paint layers.
node tools/tizen/inspector.js layers \
    --endpoint http://127.0.0.1:39506 --allow-private-pixels \
    --output /absolute/private/layers
```

Screenshot sends the parameter-free Chrome 47 `Page.captureScreenshot` command.
PNG base64, signature, chunk boundaries/CRCs, dimensions and terminal IEND are
checked before saving. Limits are 8 MiB per PNG, 4,096 per dimension and 16 Mi
pixels. Structural checks do not decode every image or prove nonblank content,
panel fidelity or inclusion of Samsung's hardware video plane.

Screencast first checks `Page.canScreencast` and will **not** start when it is
false or unknown. An advertised stream is bounded to 30 seconds, 120 frames
and 32 MiB total. Old `frameNumber` and newer `sessionId` acknowledgements are
supported. Stop is attempted even when start times out; a stop failure is not
reported as capture success. Only a fully successful collection is saved.
Filesystem failure can leave private partial files in the newly created
directory, but returns an error, never success; inspect and remove those files
before trying a fresh output path.

Saved frame PNGs and `manifest.json` are **not an MP4**. Manifest timing is host
receive time, not device FPS or presentation time. This tool does not install
encoders or invent a recording when the TV supplies no pixels. For public demos,
use original/synthetic art and no household data; a desktop rendering/recording
must be prominently labeled **desktop simulation, not retail-TV capture**.
An owner-approved external camera is a separate way to record the physical panel,
not evidence that the Inspector supports screenshot/screencast.

### Native renderer layer capture (working on the measured TV)

`layers` uses `LayerTree.enable`, `makeSnapshot`, `replaySnapshot`,
`releaseSnapshot` and `disable`. The TV's own renderer paints a SkPicture and
replays it into PNG. This is **real on-device renderer paint**, not host DOM
reconstruction or simulator output, but it is also **not compositor/panel
readback**. It bypasses the browser-window snapshot path that hangs on this set.

The command exports separate PNGs plus a private manifest. It does **not**
compose layers or infer complete-screen fidelity from a 1920x1080 image.
The manifest labels `on-device-renderer-paint-replay-not-panel` and
`separate-layers-not-a-composited-screenshot`. Offsets are parent-relative,
not absolute screen positions. A `hasTransform` flag warns that a transform
exists; its full matrix, parent chain and compositor effects are not exported.
Do not use these numeric fields as a compositing recipe.

Each replay is sequential, not an atomic page snapshot: animations or page
changes can differ between layers. The command captures at most eight drawable
layers from a tree capped at 100, 32 MiB total and the same per-PNG limits;
truncation is explicit. Oversized/malformed layer geometry fails instead of
requesting unbounded renderer paint work. Snapshot release and domain disable
are attempted on failure, including a timed-out make command. An unconfirmed
cleanup blocks success. Capturing layers does not capture Samsung AVPlay's
hardware video plane, system UI, or panel post-processing, and it is not a video
recording. The normal private-pixel consent and output protections apply.

### Live native layer viewer

`live` keeps one Inspector connection open and repeatedly runs the same
`layers` capture sequence. It serves only the latest capture, from memory, on a
loopback HTTP URL:

```sh
node tools/tizen/inspector.js live \
    --endpoint http://127.0.0.1:39506 --allow-private-pixels \
    --duration-ms 300000 --interval-ms 1000
```

The URL is written to stderr as a JSON line. It contains a random 192-bit path
token. Treat it as private and never paste it into a shared log. The server
binds to `127.0.0.1` only. It rejects any `Host` other than the exact loopback
host and port, and returns 405 for anything other than GET. Responses use
`no-store`, a nonce-based CSP, `DENY` framing and `no-referrer`. `--output` is
rejected: pixels are never written to disk, and the previous capture is
discarded when a new one is published. A frame URL for an older sequence
returns 410, so the page never shows a reused image under a fresh capture
number.

The page shows a red label: **separate and incomplete renderer layers, not the
panel**. It does not composite layers. Each layer caption shows the
parent-relative offset, a transform warning and whether the layer changed
since the previous capture. A layer counts as changed when its PNG SHA-256 or
its reported geometry (size, offset, transform presence) differs; `state`
also reports `pixelsChanged` separately, so a layer that moved without
repainting is not mistaken for new paint. A static screen is therefore
reported as `unchanged`, not presented as motion. Compositor-only animation
that leaves geometry and paint alone (such as a CSS transform spinner) is
not detected. Each capture costs about a second of
sequential replays, so the session is bounded:
- Duration: 1 s to 30 min, default 5 min.
- Interval: 0.5 to 10 s, default 1 s.
- Viewer connections: at most 8.

The loop stops in any of these cases:
- The duration elapses.
- The user interrupts it (Ctrl-C).
- The WebSocket closes.
- Three consecutive capture failures occur.
- Any snapshot or domain cleanup failure occurs, because it may leave
  renderer state behind.

The stop handler closes the HTTP server and all connections, then releases the
device lease. The final receipt reports cycles, changed cycles, failures and
`memory-only-discarded`.

Measured on UE55MU6172 (Tizen 3.0, Chromium 47) against the installed
sign-in screen:
- A 45-second session ran 45 cycles, each capture taking 0.75–0.97 s, with zero
  failures.
- Every capture had three layers: 1920x1080, 226x64 and 28x28.
- All sampled frames were served.
- The main layer, inspected visually, held the complete sign-in UI.
- Only the first cycle was `changed`. The screen was static, and the spinner
  rotates by a compositor transform, so its painted pixels are byte-identical.

The viewer is genuinely live: a capture changes when the page repaints. It is
not a frame-accurate recording of compositor animation, the video plane or
the panel.

## Retail result and source interpretation

Observed on **Samsung UE55MU6172, Tizen 3.0**, 2026-10-11:

| Case | Result | Evidence |
|---|---|---|
| I-01 | `/json/version`: Chromium `47.0.2526.69`, protocol `1.1` | Device-observed using this tool. |
| I-02 | Fixed geometry probe: 1920x1080, scale 1, 23 visible layout entries | Device-observed on the installed development app's sign-in screen. |
| I-03 | `Page.canScreencast`: `{result:false}` | Device-observed using this tool; no stream was started. |
| I-04 | `Page.captureScreenshot` recognized but unanswered at 15 s, with/without format and after Page enable | Earlier same-device coordinator probes; not repeated without a new hypothesis. |
| I-05 | Start accepted, no frames; stop responded | Earlier same-device coordinator probe. Acceptance is not recording evidence. |
| I-06 | Owned forward removed; relay and lease released | Device cleanup confirmed after this tool's read-only probe. |
| I-07 | Native LayerTree replay: 3 PNGs, 1920x1080 (113,508 bytes), 226x64 (4,456 bytes), 28x28 (801 bytes) | Device-observed alternate-path investigation; all three images visually inspected. |
| I-08 | Main layer has sign-in text/QR/code and direct-connect control; separate new-code button and spinner layers | Visual inspection proves useful UI capture, but main layer alone is incomplete. Private sign-in data is not published. |
| I-09 | One parameter-free screenshot with 90 s deadline still unanswered; concurrent Runtime geometry succeeded | New bounded slow-readback hypothesis; not an unbounded retry. |
| I-10 | Screenshot-only tracing for 8 s started/ended/completed but returned no screenshot frames | Device-observed on the settled sign-in screen; not a universal trace-capture verdict. |
| I-11 | One-shot `sdb shell` benign printf rejected: exit 1, `closed`, no marker | Interactive-shell capability alone was not assumed to decide this separate path. No privilege changes. |

The prior recorded firmware was **T-KTMDEUC-1410.1**; it was not re-read during
I-01..I-03. The probe observed the existing installed app, not newer uninstalled
source. No remote keys, media playback, account writes, deployment or rooting
were performed. Private receipts remain outside the repository. This result
does not generalize to other Samsung model groups/firmware.

[Samsung's Web Inspector documentation](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/web-inspector.html)
documents CSS/layout/runtime debugging on 2015+ TVs, not a universal native
pixel-capture promise. It explicitly distinguishes device and emulator
measurements. Its browser security-disabling flags are **not** used by this tool.

The matching upstream
[Chromium 47.0.2526.69 PageHandler source](https://github.com/chromium/chromium/blob/47.0.2526.69/content/browser/devtools/protocol/page_handler.cc)
sets `CanScreencast` true only for Android builds. `StartScreencast` can still
accept the command on other platforms; frames depend on compositor metadata
and surface readback. `CaptureScreenshot` waits for a browser snapshot callback.
[RenderWidgetHostImpl at the same tag](https://github.com/chromium/chromium/blob/47.0.2526.69/content/browser/renderer_host/render_widget_host_impl.cc)
queues that callback and sends `ViewMsg_ForceRedraw`. Upstream code explains why
method recognition is insufficient; it is **not** proof of Samsung's precise
downstream implementation or the reason its snapshot callback did not arrive.

### Adversarial reassessment and alternate-path sources

The first pass was too narrow: failure of `Page.captureScreenshot` did not decide
whether another native Inspector API could produce useful app pixels. The
user-directed reassessment found the independent renderer paint path and tested
it successfully. Parameter variations on the old screenshot command were weak
experiments because the version's handler has no format parameter to validate.
Absence of capture in Samsung's documented Inspector tabs is not proof that
every undocumented native path is impossible.

The exact engine's
[InspectorLayerTreeAgent implementation](https://github.com/chromium/chromium/blob/47.0.2526.69/third_party/WebKit/Source/core/inspector/InspectorLayerTreeAgent.cpp)
paints the selected GraphicsLayer into a SkPicture and returns PNG from replay,
without using `GetSnapshotFromBrowser`. The
[Chrome 47 TimelineModel](https://github.com/chromium/chromium/blob/47.0.2526.69/third_party/WebKit/Source/devtools/front_end/timeline/TimelineModel.js)
also offers `disabled-by-default-devtools.screenshot` tracing; the bounded
passive trace on this app produced no images.

Samsung's newer
[Tizen screenshot skill](https://github.com/Samsung/tizen-agent-skills/blob/main/tizen-sdk-skills/tizen-cli/skills/tizen-screenshot/SKILL.md)
documents device framebuffer/capture-tool paths. Its
[current underlying script](https://github.com/Samsung/tizen-agent-skills/blob/main/tizen-sdk-skills/common/scripts/tizen-screenshot/tizen-screenshot.sh)
also attempts root elevation for Enlightenment capture. **That script was not
run**: rooting or changing privileges is outside this authorization, and its
general emulator/device guidance does not prove access on this retail TV.
The benign one-shot shell check was denied before any framebuffer capture.

An
[EFL sibling snapshot implementation](https://github.com/crosswalk-project/chromium-efl/blob/db2d09aba6498fb09bbea1f8440d071c4b0fde78/impl/ui/snapshot/snapshot_efl.cc)
contains a no-op asynchronous snapshot callback. This is a possible explanation
for an indefinitely orphaned screenshot reply, **not proof** of Samsung's closed
TV browser implementation. The successful parallel Runtime query only proves
that the Inspector/renderer was not globally unresponsive.

**Revised conclusion:** useful native renderer-layer screenshots **are obtainable**
on this measured TV. Full compositor/panel screenshots and native video recording
remain unproven: screencast is not advertised, browser screenshot readback times
out even at 90 seconds, and the tested passive trace produced no frames. Keep
these boundaries explicit; do not relabel layer paint replay, DOM reconstruction
or desktop video as panel footage.
