# Samsung Tizen TV app development process

**Purpose:** make the first Samsung TV app establish a safe, repeatable workflow for building
additional Samsung Tizen TV apps. The Plex client is the first full product and the proving
project for shared development infrastructure; it is not itself the reusable template.

This playbook is deliberately separate from the Plex product contract in
[samsung-tizen-client-spec.md](samsung-tizen-client-spec.md). A new app should be able to reuse the
toolchain checks, project skeleton, package validation, emulator loop, device test harness and
release safeguards without inheriting Plex APIs, credentials, media assumptions or UI.

## 1. Goals

1. A developer can start a new Samsung TV app from a documented, versioned template and build a
   valid `.wgt` without copying an old product directory.
2. One command validates required local tools, project metadata, bundle compatibility and signing
   configuration without printing secrets.
3. One command builds, installs, launches and gathers useful diagnostics on an available Samsung
   emulator; the same app contract and test scenarios can be run on a retail TV when authorized.
4. Apps consume an explicit, testable platform capability profile and degrade safely when an API
   is unavailable.
5. Emulator results, vendor documentation and individual retail-TV measurements remain distinct
   evidence categories.
6. Signing credentials, DUIDs, tokens, server locations and app-specific private configuration
   never enter git, public build logs, reusable templates or test artifacts.
7. Reusable pieces are extracted only when a second app or an independently reusable platform
   contract validates them; no abstract framework is built solely for hypothetical use.

## 2. Scope and non-goals

**In scope:** Samsung Smart TV applications using the public Tizen TV application ecosystem:
primarily Web apps (`.wgt`), Samsung's TV emulator and TV Extension, remote input, lifecycle,
packaging, signing, test evidence and local/CI developer tooling.

**Not in scope:** Galaxy/Android applications, phones/tablets, Samsung appliances, device rooting,
private/native TV APIs not in Samsung's public developer contract, bypassing certificate or TLS
checks, or claiming that the emulator is equivalent to a retail model.

This workflow must support app-specific architectures. It does not require every future app to use
the Plex client's UI, network protocol, language or playback adapter.

## 3. Shared versus product-specific ownership

| Shared Tizen app-development layer | Plex-client product layer |
|---|---|
| SDK/CLI and emulator discovery; environment report; stable project skeleton; manifest/package validation; build/install/run/log/screenshot helpers; remote-key scenario harness; capability registry and evidence format; secrets policy; model/firmware test-matrix schema; release artifact/checksum mechanics | Plex QR auth and profiles; PMS discovery/API and media models; Home/library/search/detail features; playback policy and AVPlay integration; Plex progress/timeline writes; Plex settings, consent, and metadata |

Shared APIs should be small, dependency-light and usable without PMS. Plex-specific fields, token
handling and test data stay in the product directory. Shared tools accept app id, project root and
target explicitly; they do not hardcode one app's path, certificate name, model, IP or server.

## 4. Standard project shape

The canonical project template should eventually create a structure equivalent to:

```text
<app>/
  app.json                  # app id, display name, version, privileges, target policy
  config.xml                # generated/validated Tizen widget manifest
  src/
    platform/               # thin public-Tizen adapters
    app/                    # app-owned features and composition
  assets/
  tests/
    unit/
    contract/
    emulator/
  tools/
    app.config.example      # safe placeholders only
  dist/                     # ignored generated package and unsigned bundle
```

The exact language, bundler, test runner and source layout remain a first-app engineering decision.
The reusable contract is the manifest, package, build output and test interface, not a mandatory
UI framework. An app may use TypeScript or modern source syntax only when its production bundle
passes the engine target's syntax/API checks.

## 5. Canonical developer loop

The final workflow should be discoverable and composable, with a single documented top-level tool
or command family:

1. **Inspect environment:** report Tizen Studio/CLI/TV Extension/emulator versions, installed
   platforms/templates/virtual machines, host architecture and missing prerequisites. Never print
   certificates, passwords, DUIDs, tokens or private endpoints.
2. **Create app:** generate a new product directory from the versioned template, with a unique
   app id and placeholder metadata; do not mutate the LG app.
3. **Validate source:** lint and unit/contract test; verify bundle syntax against each declared
   engine tier, privileges and manifest; scan source and package metadata for credentials and
   machine-specific values.
4. **Build:** create deterministic, inspectable unsigned/static web assets and the signed package
   as distinct outputs. Record source revision, tool versions, target profile and artifact digest.
5. **Run emulator:** select an explicit image; create/boot if needed; install, launch, inject
   repeatable remote keys, collect app logs and screenshot, then close the app cleanly. Report the
   emulator's exact virtual model/platform image in the result.
6. **Run device:** only with explicit authorization and target identity; validate connectivity,
   certificate profile and install permission; install/launch; run a bounded test; gather app
   logs; close the test app and release the TV lock. Do not leave a developer app running when the
   owner needs the set.
7. **Record evidence:** add results to the app-specific register with exact model/firmware, test,
   criterion, outcome and evidence type. Update shared capability knowledge only if supported by
   vendor evidence or more than one relevant, named-device observation.
8. **Release:** validate signing/distribution permissions, version/package metadata and checksum;
   keep private signing assets outside the repo; retain an audit trail for the release artifact.

No step may silently continue after a failed precondition. Error output names the failed check and
the safe next diagnostic, not a guessed cause or a security bypass.

Initial local command family:

```sh
tools/tizen/doctor.sh
npm ci --prefix tests/tizen --ignore-scripts
tools/tizen/new-web-app.sh SampleApp /tmp/tizen-apps tv-samsung-3.0
tools/tizen/check-es5.sh /path/to/app
tools/tizen/test.sh
tools/tizen/build-source.sh samsung/PlexTv
tools/tizen/build-web.sh /path/to/app <security-profile>
```

The generator wraps Samsung's installed `BasicEmptyProject`; the app owner must replace its
`example.invalid` widget ID before distribution. `build-web.sh` requires the signing profile
explicitly and writes generated packages beneath `samsung/dist/` (ignored by Git). These helpers
cover project creation and local packaging only; install, emulator launch, key injection and log
collection are not automated yet.

`test.sh` runs synthetic account/PMS/native-adapter contracts, the host DOM product journey,
generated-locale freshness and strict Acorn ES5 parsing. Dependencies are declared and locked under
`tests/tizen/`; they are host tools, not production assets. Use
`node tools/tizen/build-locales.js --write` after editing Samsung strings or upstream locale sources.
`build-source.sh` runs Samsung's unsigned source build into a unique temporary output directory
and removes only its own output on exit; it does not mutate the candidate source directory or
install/sign a package. None of these commands launch a Samsung runtime.

## 6. Emulator and device policy

- The Samsung emulator is the default local Tizen integration loop. It is useful for package
  install/launch, shell/runtime compatibility for its image, remote navigation, layout, web APIs
  it implements, and basic app lifecycle.
- Emulator capabilities and OS version are read from the selected image, never inferred from a
  marketing model or from the host Tizen Studio version. For this project, the currently installed
  image is **Tizen 10.0 x86_64**. It is not evidence for 2017/2018 engines; no older image was
  present at the time this process spec was written.
- First-host attempt (2026-10-09): `em-cli launch` could not start the x86_64 image on this
  Apple-Silicon macOS host, reporting that hardware virtualization is unsupported. The VM config
  already had hardware virtualization disabled; retrying through the official manager returned the
  same blocker. The image is therefore installed but **not yet runtime-verified** on this host.
  Do not equate a package build or a `list-vm` entry with a successful emulator run. Resolve this
  with a supported host/image combination or a Samsung-supported emulator update; do not edit VM
  internals or bypass the manager as a workaround.
- The initial shared helpers now live at `tools/tizen/doctor.sh` and
  `tools/tizen/new-web-app.sh`, `tools/tizen/check-es5.sh`, and `tools/tizen/build-web.sh`.
  On this host, the generator produced a clean `tv-samsung-3.0` `BasicEmptyProject`; the build
  wrapper originally ran a heuristic scan for common post-ES5 syntax, Samsung's `tizen build-web`, and
  `tizen package -t wgt` with an explicitly selected local signing profile. The signed package
  passed ZIP integrity checking and
  the build output/checksum landed under ignored `samsung/dist/`, outside the app source directory.
  This proves local generation/build/package only: the package was not installed or launched, and
  this does not validate its UI or any retail model. New app IDs use the reserved
  `example.invalid` placeholder and must be changed to an identifier controlled by the app owner.
- A missing historical image must be represented as “not available in this emulator setup,” not
  worked around by compiling code against a newer engine and claiming old-model support. Use
  source-level compatibility checks, vendor sources and an actual older retail set for those tiers.
- Retail-device tests are needed for real remote behavior, video decoder/API compatibility, HDR,
  sound, subtitles, panel composition, memory/performance, and hardware-dependent suspend/wake.
- Physical-device operations use a short TV lock around one bounded test. Device access, account
  writes, certificate trust changes, network disruption, install/uninstall and panel/sound changes
  require appropriate human authorization.
- The emulator may contain a clean synthetic account/mock server. Never seed a user's personal
  token into a checked-in fixture, test package, reusable template or CI log.

## 7. Capability and compatibility model

Every reusable platform capability is described by:

- API/feature name and official documentation URL/version;
- minimum documented Tizen TV version and known model-group constraints;
- runtime feature-detection method, if any;
- whether emulator support is documented and the exact image on which it was observed;
- named retail model, firmware and test artifact for device observations;
- fallback behavior and whether fallback has actually been tested.

There is no global “Samsung TV supported” boolean. Product apps declare a baseline plus optional
capabilities. The app's effective capability set is the intersection of build-time support,
runtime detection and verified server/device behavior. Unknown playback capability chooses a safe
server-side transcode or a clear unavailable state; it never guesses native decode support.

## 8. Reusable process deliverables

Build these once through the first app, but keep each deliverable independently useful:

1. **Tizen app skill/playbook:** initial routing and safety guidance exists in
   `.agents/skills/samsung-tizen-tv/SKILL.md`; automated install/run details remain future work.
2. **Project template:** `new-web-app.sh` wraps Samsung's installed sample; a versioned, repository-
   owned template with lifecycle tests is not yet established.
3. **Environment checker:** `doctor.sh` currently reports host architecture, Tizen CLI/version,
   available TV web templates and emulator inventory. TV Extension version checks and actionable
   prerequisite remediation remain future work.
4. **Build/package wrapper:** `build-web.sh` runs the strict Acorn ES5 syntax gate, `tizen build-web` and
   `tizen package` with an explicit profile, then hashes the package. Manifest/privilege/identifier
   validation, secret scanning and output redaction remain future work.
5. **Emulator harness:** image boot/readiness, install/launch, remote key schedule, logs, screenshot
   and teardown are not automated. The current host cannot launch its installed x86_64 image.
   Expose individual steps for debugging when the harness is implemented.
6. **Device harness integration:** target identity, certificate/permit preflight, lock-aware bounded
   run and teardown; never store DUIDs or credentials in source.
7. **Conformance contract:** test interfaces for app startup/readiness, key dispatch, diagnostics,
   lifecycle and graceful exit. Apps can provide adapters without adopting common UI code.
8. **Compatibility evidence register:** reusable schema and tooling for per-model capability/results.
9. **CI gates:** unit/contract tests, lint, ES5/engine compatibility as applicable, manifest and
   privilege validation, secret scan, mock app smoke and reproducible packaging.
10. **Release/onboarding guide:** documented at the end after local build/emulator/device workflows
    are proven; explain what is universal and what must be repeated per developer or TV.

Each deliverable records what was automated, the manual fallback, known platform limits, and its
owner/source of truth. Do not duplicate the same runbook across a skill, README and scripts: keep
the skill as the entry point, canonical behavior in tooling, and detailed facts in one maintained
reference.

## 9. First-app process milestones

The Plex client is used to discover and verify the reusable process, in this order:

1. Inventory the installed SDK and emulator images and make a non-destructive environment report.
2. Create a clean, separate Tizen Web app skeleton using the supported template/CLI; attempt the
   installed Tizen 10 emulator, and exercise remote input, logs and screenshots on a host where the
   official emulator actually starts. The initial template has been generated and packaged; emulator
   launch and remote-input evidence remain blocked on a supported host.
3. Turn observed setup/build/emulator steps into reusable commands and test them from a fresh
   throwaway app directory, not only from the Plex app.
4. Add app-specific mock PMS fixtures and build Plex vertical slices against the shared app
   contract. Keep every Plex credential absent from the repository.
5. Add older-engine compatibility checks and use available 2017/2019 retail sets only for checks
   the Tizen 10 emulator cannot prove. Keep the model evidence granular.
6. Harden lifecycle, AVPlay, performance, privacy and release behavior against the Plex spec.
7. Re-run the reusable workflow from a clean generated sample, record timing/failure modes, and
   finish the deferred environment, signing, device setup and user-facing onboarding docs.

**Reusable-workflow acceptance:** a second, unrelated sample Tizen TV app can be generated, built,
installed/launched in the emulator, driven by scripted remote input, diagnosed from collected logs
and removed using the documented workflow without editing Plex code or accessing the user's Plex
credentials. A full clean-machine onboarding run is done last, after process churn has settled.

**Current result:** the unrelated sample and Plex app have both been generated, built and packaged;
the emulator install/launch and remote-input conditions remain unmet on this host, so reusable-
workflow acceptance has not passed.

## 10. Measurements for process improvement

Record these for the first app, then compare against the next app:

- elapsed time and manual actions from a prepared workstation to first emulator launch;
- elapsed time from a new app directory to a signed emulator-installable package;
- number of undocumented steps, failed commands and recovery actions;
- percentage of the app build/test loop runnable without a retail TV;
- setup repetitions required per developer, emulator image and physical target;
- number and type of secret-bearing artifacts prevented by automated checks;
- time to diagnose a failed package, launch, network, AVPlay or lifecycle test;
- number of app-specific files modified to use a shared tool/template;
- proportion of shared components exercised by an unrelated sample app;
- host, emulator and retail-device test coverage reported separately.

Optimize repeated, evidence-backed work. Do not optimize by skipping required device tests, merging
different model tiers, hiding failure details, or moving private data into shared templates.
