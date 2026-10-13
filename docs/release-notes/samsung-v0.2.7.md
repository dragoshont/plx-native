# Plx for Samsung 0.2.7

New optional GPU artwork rendering is available in **Settings > Graphics > New graphics enhancements** after connecting/signing in. It is **OFF by default**, including for existing installations. Existing Home acceleration, browser compositing, navigation and AVPlay remain unchanged.

The shared WebGL backend serves Home and Detail rather than duplicating screens. Unsupported contexts, rendering failures, software-renderer evidence, resource limits and context loss restore the original artwork path with a visible fallback message. Turning this option off does not disable the TV's GPU or video decoder.

This remains a Samsung developer-mode **prerelease**, not a Store release. The optional backend's exact-source shader/texture output and lifecycle cases were verified on the Q80C and QN70F. Older-target results and current connectivity limitations are recorded separately; no blanket all-model certification is claimed.

This release does not claim faster playback, a measured product speedup, codec/HDR/audio acceptance or a native Rust renderer. The new option is a bounded WebGL artwork path; decoder hardware and server transcoding are separate.

Install using the existing signing identity so the update preserves your app data. Do not uninstall a working installation to work around an author-certificate mismatch.

- [Installation guide](https://github.com/dragoshont/plx-native/blob/main/docs/install-samsung.md)
- [Source and shared optional graphics backend](https://github.com/dragoshont/plx-native/tree/samsung-v0.2.7/samsung/PlexTv)
- [Optional graphics behavior and limits](https://github.com/dragoshont/plx-native/blob/samsung-v0.2.7/docs/samsung-optional-graphics.md)
- [Named-device evidence and blocked cases](https://github.com/dragoshont/plx-native/blob/samsung-v0.2.7/docs/samsung-graphics-device-matrix.md)
