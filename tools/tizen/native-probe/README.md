# Linux ARMv7 Rust Host-Only Native Probe & Architecture Seam Map

## Executive Summary & Scope Boundary
This artifact documents a **HOST-ONLY** investigation into cross-compiling an isolated Rust ARMv7 ELF binary matching the compilation profile of PlxNative's ARM architecture, and maps the exact upstream modules and dependencies required to port the GLES2 UI renderer to Samsung Smart TVs.

### Explicit Negative Boundaries:
1. **NO Device Execution Claimed**: This probe proves host cross-compilation and ELF construction for ARMv7 Linux; it does **not** prove runtime execution or Tizen OS startup compatibility.
2. **NO Retail TV Native Route Established**: Auditing retail 2017 Tizen 3.0 (UE55MU6172) confirmed that SDB exposes only `wascmd` (`0 vd_appinstall`), which manages web applications (`app_type = 2`). All 26 third-party apps on the set run inside the Chromium web runtime. There is no established standalone retail 2017 native TPK route or verified Partner workaround.
3. **NO Browser / WebAssembly / NaCl Substitution**: Upstream's contract requires native execution with GLES2 and direct widgets. Historical NaCl (`.nexe`/`.nmf`) packaged inside WGT containers is browser-hosted and is explicitly excluded from this native architecture contract.
4. **NO Speculative Platform Adapters**: Hypothetical window/surface bindings (`elm_win` or raw Wayland) are documented as speculative interfaces pending native runtime availability, not implemented or proven.

---

## Provenance & Revision Pointers
- **Original Upstream Base**: Commit `cab5d041a1e0559d6bb39769e7c04f4c6349609f` (`GLinnik21/plx-native`, *"Home: the top bar's glass keeps its blur source through a held key (#619)"*).
- **Working Fork Revision**: Commit `203dd0cfcc556802f0481b9f6bad3fee41159e2a` (`dragoshont/plx-native`, *"Fix Samsung subtitle timing and player recovery"*), which houses the working Samsung web client and portal UX.

---

## Upstream Module Reuse & Dependency Seam Map (Grounded in Source)

### Tier A: Direct Reuse Candidates (Platform-Agnostic Pure Rust)
These modules contain pure Rust layout math, state engines, and theme tokens with no OS or webOS FFI:
1. **Geometry & Crop**:
   - `rust-modules/gfx/src/gfx/geom.rs` (Lines 16–58):
     - `Crop` (`Centre`, `Headshot`), `Crop::top_share`.
     - `Rect` (`Rect::new`, `Rect::FULL` [1920x1080], `Rect::cover_uv`, `Rect::inset`).
     - `Zoom`: 2D zoom factor calculations.
2. **Design Tokens & Palette Primitives**:
   - `rust-modules/gfx/src/gfx/tokens.rs`:
     - Color definitions (`rgb8`), `NEUTRAL_500` (ground ink `0x1b1b1d`), `NEUTRAL_1000` (scrim ink `0x08080a`).
     - Card elevations, card shading constants (`CARD_BEVEL_LIGHT`, `CARD_BEVEL_DARK`).
   - `rust-modules/ui/src/theme.rs` (Lines 31–80):
     - Roles: `TEXT_PRIMARY`, `TEXT_SECONDARY`, `ACCENT`, `FOCUS_RING`, `HAIRLINE`.
     - Color cascade: `scrim()`, `scrim_black()`.
3. **Spatial Navigation Engine**:
   - `rust-modules/ui/src/focus.rs` (Lines 1–65):
     - Focus engine (`Outcome::Moved`, `Outcome::Edge`, `Outcome::Nothing`).
     - 2D grid/spatial navigation algorithm: nearest neighbour resolution, `EdgeRule`, `Seat` landing.
4. **Deterministic Machine Runtime**:
   - `rust-modules/machine/src/machine.rs` (Lines 26–85):
     - `Host` trait: defines application bundle (`Arg`, `Fx`, `Msg`, `Elem`, `Views`, `Init`, `Memory`).
     - `Machine` + `Cx` + `Effects` runtime abstraction, strictly decoupled from concrete OS platforms.

---

### Tier B: Reusable Rendering Foundations (Requiring Platform Glue)
These modules compile standard OpenGL ES 2.0 / EGL calls, but depend on a native window and surface:
1. **GLES2 Drawing Engine & Shaders**:
   - `rust-modules/gfx/src/gfx.rs` (Lines 1–90):
     - Shader programs compiled via embedded GLSL:
       - `shaders/fs_src.frag` / vertex shader: Textured RGBA card rendering.
       - `shaders/fs_glass.frag`: SDF rounded rectangles, focus rings, ambient lighting.
       - `shaders/fs_flat.frag`: 4-corner ambient gradient.
     - Draw primitives: `draw_rect`, `draw_rrect`, `draw_focus_ring`, `draw_tex`.
     - **Required Platform Glue**: Standard EGL context initialization (`eglGetDisplay`, `eglCreateWindowSurface`, `eglMakeCurrent`).
2. **Text Rasterization**:
   - `rust-modules/gfx/src/text.rs`:
     - Text glyph quad atlas management and rendering into GLES2 textures.
     - **Required Platform Glue**: Font rasterizer. Upstream uses `SDL2_ttf` / FreeType. On Samsung TV, requires either an embedded FreeType library or system font rasterizer.
3. **Image Decoding**:
   - `rust-modules/gfx/src/img.rs`:
     - Pure Rust JPEG/PNG image decoding via `image` crate (replaces legacy `stb_image`). Directly portable.

---

### Tier C: Non-Reusable Platform Components & Hypothetical Contracts
1. **Window Surface & Canvas Contract**:
   - `rust-modules/base/src/surface.rs` (Lines 1–45):
     - Authored canvas is strictly **1920x1080 logical** (`LOGICAL_W`, `LOGICAL_H`).
     - Separates drawable resolution from physical 4K panel resolution.
   - `rust-modules/platform/src/tv/window.rs` (Lines 1–60):
     - Drives platform bus pump (`pump_bus`), window binding (`bind_window`), opaque region routing (`opaque_route`), and frame presentation probes.
     - **Hypothetical Samsung Contract**: In a native environment, requires wrapping native window/surface creation (e.g. hypothetical EGL / Wayland / Enlightenment surface hooks). *Note: No such native surface API is accessible on retail 2017 Smart TVs without root.*
2. **Application Lifecycle & OS Daemon**:
   - `rust-modules/src/app/boot.rs` & `rust-modules/platform/src/webos.rs`:
     - Specific to webOS Luna Service bus (`luna-send`, `PMLog`, `LS2` handles).
     - **Hypothetical Samsung Contract**: Would require Tizen native application lifecycle (`ui_app_lifecycle_callback_s`), currently blocked by retail package installer restrictions.
3. **Hardware Playback Seam**:
   - `src/starfish.c` & `rust-modules/media/`:
     - LG webOS StarfishMediaAPIs / ACB hardware video plane composition.
     - **Status**: Excluded from probe scope.

---

## Reproducible Build & Verification Commands
Build with `CARGO_INCREMENTAL=0` using host-installed nightly toolchain:
```bash
cd tools/tizen/native-probe
CARGO_INCREMENTAL=0 cargo +nightly build \
  -Z json-target-spec \
  -Z build-std=core,compiler_builtins \
  -Z build-std-features=compiler-builtins-mem \
  --target armv7-unknown-linux-gnueabi.json \
  --release
```

Run tightened ELF validator and complete 16-case regression suite:
```bash
python3 -O validate_elf.py target/armv7-unknown-linux-gnueabi/release/rust-armv7-probe
python3 -O test_validate_elf.py
```
