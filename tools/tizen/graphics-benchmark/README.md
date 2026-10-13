# Published 0.2.7 OFF/ON benchmark

This stages the **exact public 0.2.7** `main.js`, CSS and modules in a separate
account-free application. It does not modify or launch production Plx.
This workload and its Plex-specific adapters remain GPL-3.0-or-later in the
app repository. The separate MIT Tizen toolkit owns generic collection and
statistics; its licence does not relicense these files.

```sh
python3 tools/tizen/graphics-benchmark/prepare.py PUBLIC_0_2_7_WGT PRIVATE_STAGE
node tools/tizen/graphics-benchmark/host.test.cjs PRIVATE_STAGE
node tools/tizen/graphics-benchmark/adapter.test.cjs
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
The public API declarations used by the unchanged modules remain in the
manifest for the SDK audit; CSP additionally denies every network connection
and embedded object, while adapters prohibit any player construction.

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

## Run through Tizen TV Builder

The stage now includes a GPL `window.__tvBenchmark` adapter for the toolkit's
generic benchmark contract. `prepare.py` writes `PRIVATE_STAGE-descriptor.json`
beside the stage: it binds the published WGT and the exact fixture-source hash,
metric units/meaning and owned app ID. Keep this file with the package.

After explicitly installing the owned synthetic app and opening its inspector
through the toolkit's authorized device workflow, use an existing, verified
loopback inspector endpoint and page ID. No command below installs or launches
production Plx:

```sh
python3 "$KIT/tools/tizen.py" benchmark run \
  --endpoint http://127.0.0.1:PORT --target PAGE_ID --device-alias tv-xxxxxx \
  --app PlxBench01.Probe --contract /ABS/PRIVATE_STAGE-descriptor.json \
  --warmup 0 --samples 1 --timeout 240 \
  --authorized --reviewed-account-free --output /ABS/PRIVATE/raw.json
python3 "$KIT/tools/tizen.py" benchmark validate /ABS/PRIVATE/raw.json
python3 "$KIT/tools/tizen.py" benchmark summarize /ABS/PRIVATE/raw.json
```

`KIT` names the Tizen TV Builder checkout containing its benchmark command;
`PORT`, `PAGE_ID`, alias and paths must come from the verified owned session.
Consult the toolkit's benchmark documentation for its version/availability.
The caller owns inspector-forward creation/removal and final app cleanup;
the benchmark command does not replace those steps or prove a user-supplied
adapter is safe.

This Plx adapter deliberately requires **zero outer warmups and one sample
request per block**. Each request runs the existing seven-feature/seven-Detail
workload plus navigation; it emits the six later operations per scene as raw
arrays and retains internal first-operation warmups under separate metric
names. Activation has one sample per block and is not cold application startup.
Missing OFF-mode context/upload/presentation measurements are `null`, not
fabricated zero-cost samples. Do not compare warmup metrics as steady-state work.

Cancellation invalidates pending workload actions, dispatches the isolated
app's page-hide cleanup and removes the in-memory preference. Restart the
owned fixture before another run. A cancellation acknowledgement does not
establish that the external app/forward was uninstalled.

The original October 14 TV timings were collected with the earlier direct
runner; they are **not** a claim that this new toolkit adapter was rerun on a
TV. Host tests execute all four real-product blocks through the adapter and
cover cancellation/invalid requests separately. Production 0.2.7 bytes and
recorded measurements remain unchanged.
