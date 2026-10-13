# Published 0.2.7 OFF/ON benchmark

This stages the **exact public 0.2.7** `main.js`, CSS and modules in a separate
account-free application. It does not modify or launch production Plx.

```sh
python3 tools/tizen/graphics-benchmark/prepare.py PUBLIC_0_2_7_WGT PRIVATE_STAGE
node tools/tizen/graphics-benchmark/host.test.cjs PRIVATE_STAGE
node tools/tizen/check-es5.js PRIVATE_STAGE
tizen package -t wgt -s EXISTING_PROFILE -o PRIVATE_OUTPUT -- PRIVATE_STAGE
```

The preparer checks the published archive hash, copies product bytes
unchanged and writes a distinct manifest. The fixture changes only the
HTML script composition: before product startup, Web storage becomes an
in-memory object and external network APIs explicitly refuse requests.
After product modules load, the Plex adapter supplies only original
synthetic metadata and local PNG Blobs; playback/account operations refuse.
No Internet privilege or external-access rule is included.

The real manual-connect, Settings toggle, featured-title button, Detail,
Back and D-pad navigation handlers execute. Settings is activated by a
DOM click on its actual control, so this is **not a pass for remote access
to the Account icon**. No production remote keys, server or account data
are used. Four identical-size 1280x720 synthetic backdrops and 480x270 card
images are reused in both modes.

Call `graphicsBenchmarkConnect()` once, wait for
`graphicsBenchmarkResult.phase === "ready"`, then run blocks in
**OFF / ON / ON / OFF** order:

1. `graphicsBenchmarkBlock(order, enabled)` exercises the actual Settings
   path, seven featured changes and seven Detail reentries with Home returns.
2. After it finishes, `graphicsBenchmarkNavigation(order)` drives 32
   alternating left/right events in the owned synthetic shelf and waits
   16 animation callbacks with no input.

The first image operation of each kind is a warmup sample, retained
separately rather than discarded without a trace. Report later samples,
first activation and whole-block counters separately.

The observer times real context creation, shader compilation/linking,
texture upload and draw submission plus the backend's `present`/`clear`.
It neither forces `glFinish` nor reads pixels in timed calls, so these are
**CPU/API submission costs**, not GPU execution time. The actual backend
still checks its own GL errors. Decoding is timed from assigning a Blob
source to its capture-phase load event, before backend presentation.
Operation completion uses a five-millisecond bounded DOM poll and two
animation callbacks; it is not physical pixel presentation.

Record separate inspector Performance deltas for image work and navigation,
backend statuses/driver, layer reasons, callback gaps and settled metrics.
Callback intervals are **not panel FPS**. Synthetic/local decoding omits
PMS/TLS/network latency and does not predict real artwork compression.

Build outside the Samsung canonical/target leases. Install/debug only the
owned `PlxBench01.Probe` on the authorized target, record original/current
production version with safe `tizen.application.getAppInfo`, then close
the owned forward, stop/uninstall the full owned ID and retain a raw final
registration list. Never update production or enable its saved setting
as part of this measurement.
