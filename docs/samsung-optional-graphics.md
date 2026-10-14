# Optional Samsung graphics backend

The new **Settings > Graphics > New graphics enhancements** preference is
**off by default**, including when loading preferences saved by older versions.
It applies to this TV, not to the Plex account. The control is offered after an
account or server connection; enabling it does not require signing in again.

Existing Home `translate3d` movement, browser compositing, remote navigation,
artwork download/decode limits and AVPlay behavior remain unchanged in both
modes. Turning the new option off is **not** an OS-level GPU/software-rendering
switch and does not disable hardware video decoding.

## Shared ownership

`VemmGraphics` is one optional backdrop backend shared by Home and Detail. The
app still owns its models, navigation, original images, focus, scrims and text.
The backend receives an attached, already-decoded image; it never downloads
artwork, reads credentials, writes storage or creates per-card GL contexts.

The compatibility path is the existing DOM/CSS renderer. The opt-in path
uploads backdrop pixels and draws them through WebGL 1. Consecutive images in
the same live backend can use a bounded GPU crossfade. Home clears the previous
backend before changing featured metadata, so an old backdrop cannot cover a
new title while the next image is loading; its first GPU draw is immediate.
This does not establish a product performance improvement.

The interface is deliberately small: `setEnabled`, `present`, `clear`, `status`
and `dispose`. New rendering features should use this capability/lifecycle
boundary instead of duplicating screens or backend-specific app state.

## Compatibility and failures

Runtime context creation, shader compilation, texture limits and drawing are
checked. There is no model-year denylist: basic WebGL may work on a 2017 TV,
while an individual newer TV may reject a context or resource.

The original image is retained and hidden only after a successful GPU draw.
Unsupported contexts, known software-renderer evidence, shader/upload/draw
errors, resource limits and context loss restore the existing renderer and
produce a visible fallback message. Failure is sticky until an explicit
off/on retry; the saved preference records user intent, not a fabricated
hardware-support result.

At most two textures are held, each limited to 2,097,152 pixels and the actual
GL maximum edge. The drawing buffer is also bounded. Frame callbacks settle
after a short transition; there is no perpetual render loop.
Navigation, featured-image replacement, backgrounding and page teardown
release the optional resources before the existing image lifecycle ends.

## Verification boundary

Host tests cover preference migration/persistence, lazy default-off behavior,
Settings rollback, decoded-image-only presentation, fallback and resource
lifetimes. These do not prove a TV GPU or faster playback.

The device register must identify each current model/runtime and record
default-off, opt-in rendering or explicit fallback, off-again, context loss
and teardown using account-free synthetic artwork. Test TVs serially under the
Samsung leases. Never turn a blocked device connection into a compatibility
pass or replace the user's production installation just to test this option.
