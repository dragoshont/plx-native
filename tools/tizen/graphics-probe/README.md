# Optional backdrop backend: account-free device matrix

This reusable probe loads **unchanged committed** `graphics.js`,
`preferences.js` and the product stylesheet, not production `main.js`.
Copy those three files into a private stage alongside this directory's
XML/HTML/JS, naming the stylesheet `product.css`.

The fixture generates original PNG Blobs in its own document. An 8x4 solid
RGBA image validates shader/texture drawing; a 4097x1 image tests the maximum
texture-edge rejection while allocating only 4097 decoded pixels. There is
no fetch, Plex/account traffic, real storage, playback or remote-key input.
Preference load/save is exercised against an in-memory object only.

After an owned install/debug session, call `graphicsMatrixStart()` once and
read `graphicsMatrixReceipt` when `phase` becomes `complete` or `failed`.
It records default-off allocations, opt-in WebGL or explicit compatibility
fallback, toggle-off, standard context loss/sticky fallback/explicit retry,
the oversize rejection and disposal.

The observer wraps only fixture-created canvases. It calls the actual
`drawArrays`, then synchronously `readPixels` before returning to the
backend. It does **not** enable `preserveDrawingBuffer`, change context
attributes or substitute shaders/texture data. Nonzero observed GL errors
are replayed to the backend's `getError` check rather than swallowed.
Expected center pixel is `[64,128,191,255]`, tolerance one per RGB channel,
alpha exactly 255 and GL error zero. A late inspector readback would not
be reliable with the production drawing-buffer setting.

Use the Samsung canonical and exact-target leases, one target at a time.
Verify fresh private identity/capabilities first and refuse to replace an
existing `PlxGpuM001.Probe`. Sign with an existing target-covered profile.
Store source/blob/package hashes, raw SDK/inspector output and final
registration lists privately. After every attempt, close the inspector,
remove only its forward, kill the owned package, and uninstall with the
full Web app ID:

```sh
tizen uninstall -p PlxGpuM001.Probe -s TARGET_SERIAL
```

Retain the **raw final** `sdb -s TARGET_SERIAL shell 0 applist` output proving
probe absence and unchanged production registration. Release both leases.
Transport failure is BLOCKED, not a successful graphics fallback. These
cases do not establish Settings-screen pixels, product speedup, frame rate,
video decoding, panel/video-plane composition or native GLES access.
