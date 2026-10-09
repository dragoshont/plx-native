---
name: samsung-tizen-tv
description: >
  Build, package, sign, install, debug, or verify apps for Samsung Smart TVs running Tizen.
  Use for Tizen Studio setup, TV Extension, `.wgt` web apps, Samsung developer certificates,
  Developer Mode, remote installation, AVPlay, MSE, model/firmware compatibility, emulator
  limits, and retail-TV proof of concepts. Not for Galaxy/Android apps or generic Samsung
  account/device support.
---

# Samsung Tizen TV development

Use this workflow for Samsung Smart TV applications. The public Tizen TV SDK, the TV emulator,
and a retail TV are distinct environments; a successful package or emulator run is not proof that
an app works on a particular TV.

For this repository, `tools/tizen/doctor.sh` reports the local CLI, templates and emulator inventory,
and `tools/tizen/new-web-app.sh <Name> <parent-directory> [tv-samsung-profile]` wraps Samsung's
official `BasicEmptyProject` generator. These are local development helpers, not a substitute for
Samsung's current target-specific documentation; emulator launchability must be observed, not
inferred from an installed image.

For the current Plex client, restore declared host dependencies with
`npm ci --prefix tests/tizen --ignore-scripts`, then run `tools/tizen/test.sh`.
`tools/tizen/check-es5.sh` parses shipped JavaScript with Acorn in ES5 mode; it does not prove
old-engine API availability. `tools/tizen/build-source.sh samsung/PlexTv` runs an unsigned Samsung
source build with temporary output outside the app directory. Both commands are host evidence,
not emulator/device evidence. Product status and credential-storage limitations are maintained in
`docs/samsung-tizen-client-spec.md`.

## Establish scope before setup

1. Identify the target app type: web app (`.wgt`), Tizen .NET, Flutter for Tizen, or another
   supported TV stack. This workflow's tested command examples apply to a Web application; do not
   assume that another framework supports the same model years.
2. Record the exact TV model code, region, model year, firmware/software version, and whether it is
   The Frame. Capabilities vary by model group and firmware, not year alone.
3. Check Samsung's current official TV development documentation for supported model years,
   SDK/TV Extension versions, emulator behavior, packaging, signing, and distribution. Prefer
   vendor documentation and device measurements over forum posts, symbol names, or assumptions
   based on the Linux kernel.
4. Use the emulator for quick UI and lifecycle iteration where it supports the feature. Keep an
   explicit real-device test list for APIs, codecs, DRM, color modes, memory, remote-control input,
   suspend/resume, and model-specific behavior the emulator cannot reproduce.

## Prepare tools and a device

- Install a Tizen Studio version and TV Extension supported by the chosen target, using Samsung's
  official installation instructions. Confirm the installed `tizen` and `sdb` versions before
  troubleshooting project code.
- Start with an emulator for packaging and basic UI smoke tests. Do not present emulator output as
  retail-TV compatibility evidence; its engine, media stack, display and lifecycle may differ.
- For a retail-TV test, get the owner's approval first. Enable Developer Mode using Samsung's
  instructions for that model, connect the computer and TV to the same LAN, and record the
  firmware and connection result. Never root or jailbreak a retail set as a workaround.
- On macOS, distinguish Local Network privacy restrictions on the process launching `sdb` from a
  TV, routing, firewall, or certificate failure. Check the selected interface and host IP, the
  Developer Mode host setting, `sdb devices`, and Samsung's current troubleshooting guidance.
  Do not replace normal network checks with an unreviewed relay or a security bypass.

## Package, sign and install a Web app

Use the target's current Samsung instructions. For a TV Web app, a minimal, repeatable path is:

```sh
tizen package -t wgt -s <certificate-profile> -- <app-directory>
tizen install-permit -s <target>
tizen install -n <package.wgt> -s <target>
tizen run -p <package-id>.<app-id> -s <target>
```

- Create a Samsung TV certificate profile in Certificate Manager, not a generic Tizen profile,
  when Samsung's retail-TV workflow requires it. The distributor certificate may be bound to the
  TV's DUID; permit that certificate on the TV before installing. For each additional TV, verify
  whether its DUID must be added and the certificate reissued.
- Keep DUIDs, serial numbers, `.p12` files, certificate passwords, signing keys, account details,
  LAN addresses, tokens, and private server URLs outside source control, logs, screenshots, issue
  reports, and generated packages shared publicly. Never print secrets to diagnose a signing
  problem.
- Request only the privileges the app needs. Check that each privilege and API is available on the
  target's Tizen version.
- Verify package and application IDs against current Samsung requirements. In the tested `.wgt`
  workflow, the package ID was exactly ten alphanumeric characters.
- Separate developer sideloading feasibility from public Store submission, review, and signing
  requirements. A successful local install says nothing about Store approval.

## Media and platform APIs

For streaming apps, choose APIs from the actual target matrix rather than treating web video as
uniform across Samsung TVs:

- Compare MSE / HTML media playback with Samsung's `webapis.avplay` against current vendor
  documentation for the exact model group and resolution. UHD capability can differ from FHD.
- Inspect runtime capability results and AVPlay track/state events on the target. Test each
  container, video codec/profile/bit depth, HDR format, audio codec/channel layout, subtitle type,
  seek, pause/resume, buffering and error path independently.
- Test display aspect handling explicitly. A full-screen rectangle may stretch non-16:9 material;
  verify the selected AVPlay display method and the picture on the TV.
- Do not disable TLS verification to make a server request work. Record the certificate, DNS,
  protocol, and firmware evidence and investigate supported remedies.
- Do not infer support or failure on newer TVs from an older test set. In one project study, a
  single 2017 Tizen 3.0 TV was observed to play selected UHD HEVC, HDR10, AC-3, AAC, E-AC-3,
  DTS-core and embedded text subtitle samples through AVPlay. These are narrow, model-specific
  observations, not a Samsung-wide guarantee. A separate 2018-model MSE limit or codec statement
  must be attributed to Samsung documentation and checked against the exact model group.

## Test evidence and reporting

Keep a test register with a case ID, model and firmware, date, media/input, procedure, measurable
pass criterion, result, and evidence type. Distinguish:

- **Implemented**: code or configuration exists; not necessarily exercised.
- **Emulator-observed**: exercised in the Samsung emulator only.
- **Vendor-documented**: explicitly stated in current Samsung documentation.
- **Owner-/author-reported**: a person reports seeing it; no independent capture or measurement.
- **Device-observed**: reproduced on the named retail model and firmware with logs or another
  inspectable artifact.

For UI tests, include focus navigation, repeated/held remote keys, loading and error states, and
resume after backgrounding. For media tests, record time to first frame, stalls/errors, active
tracks, seek landing position, and observed aspect/HDR/audio/subtitle output. Test The Frame's Art
Mode and return-to-app lifecycle separately if it is in scope.

Use explicit go/no-go criteria before a proof of concept. A smoke test should verify install,
launch, user-agent/runtime capabilities, remote input, a network request with normal TLS checks,
and clean exit/relaunch before implementing product features. Avoid household account writes;
use a test account/server and benign media. If a test would change viewing progress or other server
state, obtain explicit approval for the exact item and operation first.

## Handoff

Before calling a Samsung app "supported", state the precise tested model/firmware and tested
features, separate emulator from retail-device results, list untested model groups, and link the
test register and official sources. Never describe a platform's Linux base or a successful `.wgt`
install as evidence that another vendor's native binary or ABI is portable.
