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
for an unavailable/unsupported explicit capture, and `1` for invalid input,
transport, geometry, filesystem, interruption or lease errors. Diagnostic
success does not mean pixels are supported. Capture receipts distinguish:

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

**Conclusion:** no reliable native Inspector screenshot or recording was obtained
on this measured TV. Screencast is explicitly not advertised; screenshot readback
is unavailable under the tested conditions, not proven impossible by every
alternative. Do not relabel DOM reconstruction or desktop video as TV footage.
Revisit only with new platform evidence or a different explicitly authorized
model/firmware, not unchanged unbounded capture retries.
