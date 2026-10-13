# Account-free Samsung graphics probe

An isolated Web app, **not a replacement Plx build**. It has no Plex client,
credentials, network requests, playback, remote-key injection or storage writes.
It creates 96 synthetic cards and exposes three explicit inspector operations:

- `accelerationProbe.identity()` reads public product/firmware/AVPlay metadata.
- `accelerationProbe.graphics()` compiles and links actual WebGL shaders,
  draws a triangle, and requires an RGBA readback of `[64,128,191,255]`
  within one unit per colour channel, alpha exactly 255, and no GL error.
  It deletes GL objects and releases the context. Renderer strings alone do
  not pass this operation.
- `accelerationProbe.startMotion("transform"|"scroll")` runs exactly 120
  animation callbacks on the same synthetic shelf. Read
  `accelerationProbe.motion()` for completion and callback intervals.
  This is not a panel FPS measurement.

## Reproduce

Stage outside the checkout and supply `product.css` from the product revision
being assessed. The observed run used release `samsung-v0.2.6`, commit
`5a601a3ea0b37a44e7413ccd26966e119539b4ac`, with byte-identical release CSS.
Do not load production `main.js`: it can connect to household accounts.

```sh
stage="$(mktemp -d)"
cp tools/tizen/acceleration-probe/{config.xml,index.html,probe.js} "$stage/"
git show 5a601a3ea0b37a44e7413ccd26966e119539b4ac:samsung/PlexTv/css/style.css > "$stage/product.css"
node --check "$stage/probe.js"
node tools/tizen/acceleration-probe/selftest.cjs
tizen package -t wgt -s EXISTING_SAMSUNG_PROFILE -o PRIVATE_OUTPUT -- "$stage"
python3 TOOLKIT_ROOT/tools/tizen.py check-package PRIVATE_OUTPUT/PlxAccelerationProbe.wgt
```

Confirm the target's private identity and certificate coverage first. Acquire
the toolkit's canonical `/tmp/plx-samsung-device.lock` and target
`/tmp/tizen-tv-TARGET_ALIAS.lock` using its `Lease` implementation, only around
device operations. Refuse to install if `PlxAccel01.Probe` is already registered.
Build outside the lease. Keep signed packages and raw command output private.

Use the supported install/debug/owned-forward path with explicit `TARGET_SERIAL`.
Collect `Performance.getMetrics` before and after each completed trial, in
transform/scroll/scroll/transform order. Enable `LayerTree` and record
`LayerTree.compositingReasons` separately. Only read installed Plx metadata
through `tizen.application.getAppInfo("PlxNative0.Plx")`; do not launch it.

Always close the inspector, remove only the created forward, stop this probe,
and uninstall **the full Web application ID**:

```sh
tizen uninstall -p PlxAccel01.Probe -s TARGET_SERIAL
```

Verify absence with `sdb -s TARGET_SERIAL shell 0 applist`, confirm production
Plx remains registered, and release both leases. On this Q80C, using package
prefix `PlxAccel01` with `tizen uninstall` failed; `sdb shell 0 uninstall
PlxAccel01` returned no evidence and did not remove the app. The full-ID CLI
command above succeeded. Exit status alone never establishes cleanup.

## Observed result

See [the dated assessment](../../../docs/samsung-acceleration-assessment.md).
WebGL rendering, a reported Mali-G51 backend and compositor-layer reasons were
observed. No additional product speedup, decoder implementation, video-plane
composition, panel pixels or Rust/native GLES port was established.
