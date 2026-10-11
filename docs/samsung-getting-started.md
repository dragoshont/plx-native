# Samsung Tizen TV: getting started (for beginners)

Part of the [Samsung feasibility study](samsung-tizen-feasibility.md). This is a plain-language
checklist for installing the separate experimental Samsung client and preparing a named-model
[test](samsung-tizen-poc.md). **Developer installation observed** (2026-10-09/11, macOS, a 2017 set):
Tizen Studio 6.1 installation, Tizen CLI 2.5.25, SDB 4.2.36, Samsung signing, Developer Mode,
hello/probe apps and the current Plex client installed and launched. The gotchas
below are the ones actually hit. Where a page changes, Samsung's wins. Ask the owner before installing anything.

## What you are building

A Samsung TV app is a small website packaged as a `.wgt` file. You sign it with a certificate that
names your TV, install it over your home network, and run it. No rooting or jailbreaking is involved,
and none is proposed. This is different from the existing LG app, which stays untouched.

There is no Samsung Store release or universal download you can install on any TV. The current
route needs a computer and a Samsung developer certificate containing **your** TV's DUID.
An LG `.ipk` or Homebrew Channel package cannot install on Samsung. If you only want a supported
one-click app today, this experimental build is not that yet.

## 1. Find out exactly which TV you have

Write down, in a private note (not in git):

- Full model code from the label or Settings (for example `QN55Q60RAFXZA`), region, and model year (the 5th letter of the code on most models).
- Software version: Settings > Support > About This TV.
- The Frame: note that it is The Frame; Art Mode and standby are tested separately.
- The TV's Unique Device ID (DUID): Menu > Support > Contact Samsung > Unique Device ID [samsung].
  **Not** the `duid` field of `http://<tv-ip>:8001/api/v2/`: that is a SmartThings-space UUID
  and is not valid in a certificate ([tizen-cert-cli](https://github.com/gifflet/tizen-cert-cli)).

Why: Samsung's support depends on model group and firmware, not only the year. Never put the DUID,
serial number, IP address or account name in a commit, issue or screenshot.

## 2. Computer

- Same Wi-Fi/LAN as the TV, with no client isolation.
- Install **Tizen Studio** and the **TV Extension** from Samsung's SDK pages (needs a free Samsung
  account). Only do this with the owner's go-ahead. Apple Silicon support was not established in the
  pages read; check Samsung's page for your Mac first.
- The Samsung simulator uses a different engine from the TV, so final tests always use the real TV [samsung].

## 3. Signing certificate

1. In Tizen Studio open Tools > Certificate Manager and add a profile, type **Samsung** (not Tizen) > TV.
   Retail TVs need the Samsung type; it signs you in with your Samsung account.
2. Create an **author** certificate, then a **distributor** certificate. Enter the TV's DUID in the distributor step [samsung].
3. Keep the `.p12` files and passwords outside the repository (treat them like the repo's other private files).
4. **Give the TV the certificate before the first install:** `tizen install-permit -s <target>` (Device
   Manager: right-click the TV > "Permit to install applications"). Without it the install ends in
   `install failed[118]` with no further reason, which looks like a broken certificate but is not.
   Quit Certificate Manager afterwards: it keeps restarting its own `sdb` server.

A certificate is tied to named devices; installing on a new TV means adding its DUID to the distributor
certificate and running `install-permit` on that TV.

## 4. Turn on Developer Mode on the TV

On the TV, open the Apps panel, enter Developer Mode, enable it and type the computer's IP address.
Restart the TV. The exact keys differ by year, so follow Samsung's page for your model. Then connect
from Tizen Studio's Device Manager, or with `sdb connect <tv-ip>:26101` then `sdb devices`.

Gotchas observed on a 2017 set from a Mac (2026-10-09):

- **Use the IP the Mac is actually using.** A Mac with both Wi-Fi and Ethernet may route through the
  one you did not expect. `route get <tv-ip>` names the interface; `ipconfig getifaddr <iface>` gives
  its address. Type that one into the TV.
- **macOS Local Network privacy blocks `sdb`.** If `nc -vz <tv-ip> 26101` succeeds but `sdb connect`
  says "failed to connect to remote target", the app that launched `sdb` has no Local Network
  permission. Apple's own `nc` is exempt, which is why it looks like a TV problem when it isn't.
  Run `sdb kill-server` and then `sdb connect` from macOS **Terminal.app** and allow the prompt, or
  enable the launching app under System Settings > Privacy & Security > Local Network. Terminals
  embedded in other apps inherit that app's permission. Once Terminal.app has started the sdb server,
  other local `sdb` clients reuse it over localhost.
- **If no app can be granted Local Network access**, relay through Apple's `nc`, which is exempt:
  `mkfifo /tmp/f; while true; do nc -l 127.0.0.1 26111 < /tmp/f | nc <tv-ip> 26101 > /tmp/f; done`,
  then `sdb connect 127.0.0.1:26111` and pass `-s 127.0.0.1:26111` to `tizen`. The TV still sees the
  Mac's own address, so the Developer Mode host IP check passes.
- On that set, `sdb shell 0 getduid` returned the DUID, so you need not copy it off the screen. Other
  `sdb shell` commands return "closed": a retail TV gives no general shell.

## 5. First app: "hello TV"

1. Create a Web application for TV with the blank template (an `index.html` and a `config.xml`).
2. Show `navigator.userAgent`, `window.innerWidth`/`innerHeight`, and the result of
   `webapis.productinfo.isUdPanelSupported()`.
3. Build, sign with the certificate profile, install to the TV, run it:
   `tizen package -t wgt -s <profile> -- <dir>/.buildResult`, `tizen install -n <file>.wgt -s <target>`,
   `tizen run -p <package>.<app> -s <target>`.
   - The package ID in `config.xml` must be exactly 10 letters or digits.
   - `tizen package` names the file after the app's `<name>`; rename it if that contains spaces.
4. Copy the output into the private notes with the date. This is the first real data point for the model.
   A simple way to get it off the TV is to `POST` it as JSON to a small HTTP listener on the computer.

If this does not work, stop device testing and fix it first. Host/mock Plex development can
continue independently; it does not establish TV compatibility.

## 6. Build the current Plex application without touching a TV

From this repository, with Node/npm and Samsung's Tizen CLI already installed:

```sh
npm ci --prefix tests/tizen --ignore-scripts
tools/tizen/test.sh
tools/tizen/build-source.sh samsung/PlexTv
```

The tests use synthetic data and a fake AVPlay adapter; no personal token or server is needed.
The source build is unsigned and temporary: it is not an installation or working-TV demonstration.
See the [product specification](samsung-tizen-client-spec.md) for current features and outstanding
acceptance gaps, and the [development process](samsung-tizen-development-process.md) for the reusable
workflow. The installed x86_64 Tizen 10 emulator did not launch on this Apple-Silicon host.

### Install the current Samsung client

Complete sections 1–4 first: identify the TV, install the SDK/TV Extension, create the Samsung
certificate profile with its DUID, and enable Developer Mode. Keep Certificate Manager closed
while using the command line. The steps below are for macOS/Linux with the Tizen CLI and SDB
on `PATH`; on Windows use the equivalent SDK tools and a copied source folder.

1. Download or clone **this fork's Samsung branch**, not an LG release:
   ```sh
   git clone --branch dragoshont-samsung-tizen-feasibility https://github.com/dragoshont/plx-native.git
   cd plx-native
   ```
   Record `git rev-parse HEAD`. Follow the host-test/source-build commands above first.
2. Copy `samsung/PlexTv` outside the checkout so your private signing setup and build output
   cannot enter a commit. In the copy's `config.xml`, replace the application line with:
   ```xml
   <tizen:application id="<PACKAGE>.PlexTv" package="<PACKAGE>" required_version="3.0"/>
   ```
   Replace `<PACKAGE>` with your own 10-character alphanumeric package ID (for example one
   generated by Tizen Studio). These are development IDs, not Store-approved identifiers. Reuse them for updates; changing
   them creates a separate app. Never put an account token, server address or certificate in
   this folder.
3. Build and sign the copy with your existing Samsung certificate profile:
   ```sh
   tizen build-web -- /path/to/PlexTv
   tizen package -t wgt -s YOUR_PROFILE -- /path/to/PlexTv/.buildResult
   ```
   Package the SDK's `.buildResult` output, not the source directory; otherwise build output
   can be duplicated inside the widget. The SDK prints the signed `.wgt` path; use that exact
   file, not an earlier build. On macOS,
   `shasum -a 256 /path/to/app.wgt` records its checksum (PowerShell: `Get-FileHash -Algorithm SHA256`).
4. Connect and install:
   ```sh
   sdb connect TV_IP:26101
   sdb devices
   tizen install -n /path/to/app.wgt -s TARGET_SERIAL
   ```
   Replace `TARGET_SERIAL` with the exact serial printed by `sdb devices`. Complete the
   certificate-install-permit step from section 3 before the first install. Stop on an error;
   a successfully signed package is not proof it installed.
5. Open **Plex Tizen Development** from the TV's Apps screen. Scan the QR or enter the displayed
   code at `plex.tv/link`, select your profile (PIN only if protected), then your server.
   The TV and PMS keep your existing library and progress. Sign-in is saved automatically
   in unencrypted TV storage. Settings can turn this off; sign-out deletes the saved token.
   Keep the same app/package IDs and signing identity when updating; uninstalling or clearing
   app data removes the saved sign-in. Restart/update retention still requires native verification.
6. Start with read-only Home/library/detail/search navigation. For playback, use content you
   intend to watch or explicitly disposable test records. See the
   [remaining acceptance gates](samsung-upstream-readiness.md#required-before-a-parity-announcement).
   To update, build/sign the new source with the **same author identity and app IDs**, then
   install its `.wgt` again. To remove it, delete the app through the TV's Apps management UI.

The observed target is UE55MU6172 (2017, Tizen 3.0; previously recorded firmware
`T-KTMDEUC-1410.1`). Installation on that set does not certify another model. Before moving to
a newer TV, add its DUID to your distributor certificate and record its exact model/firmware;
repeat installation, sign-in, the same navigation loop, then codec and standby/Art Mode checks.
Do not reuse the older set's Inspector port or assume its decoder results carry over.

### Mac emulator: acceleration and Apple Silicon

Research checked 2026-10-10; this is source evidence, not a newly observed emulator launch.
Tizen's [Emulator Manager guide](https://docs.tizen.org/application/tizen-studio/common-tools/emulator-manager/)
distinguishes **GPU acceleration** from **CPU VT**. Turning off GPU acceleration can address
graphics problems; it does not supply Intel CPU virtualization on an ARM Mac. The documented
[host prerequisites](https://docs.tizen.org/application/tizen-studio/setup/prerequisites/)
list x64 hosts, and the [emulator guide](https://docs.tizen.org/application/tizen-studio/common-tools/emulator/)
describes x86 guests with KVM/HAX acceleration. These are the documented legacy requirements,
not proof that a future ARM release cannot exist.

Public reports corroborate the architecture gap: in
[Samsung/Tizen.Issues#23](https://github.com/Samsung/Tizen.Issues/issues/23), a Samsung reply
on 2025-09-18 says Apple Silicon ARM emulation is unsupported. In
[Samsung/Tizen.Issues#117](https://github.com/Samsung/Tizen.Issues/issues/117), an M4 Pro user
reports installed TV emulator packages that cannot launch; Samsung replies on 2026-07-15/16
acknowledge missing Silicon Mac QEMU support and announce an October release. That announcement
does not establish that the release has shipped or works with our installed SDK. Recheck the
actual release/package version before upgrading; installation changes require owner approval.

No source-backed, successfully reproduced CPU software-emulation recipe was established in
this investigation. CPU VT being described as a speed setting is not enough to prove that
disabling it runs the installed TV image on ARM. Do not present a GPU-off switch as a verified
workaround. CrossOver is also not an established solution: [CodeWeavers describes it as Windows
API translation, not an emulator](https://www.codeweavers.com/crossover); that alone provides
neither a supported Tizen guest nor Intel VT-x. This is an architectural assessment, not an
observed CrossOver failure.

Practical alternatives are a supported x64 host with working virtualization, or authorized
testing on a physical Samsung TV. A browser preview remains useful for UI work but does not
replace the TV emulator or native AVPlay evidence. Keep the TV off during source research;
turn it on only for a scheduled, authorized device session.

### Windows x64 with AMD Ryzen

Ryzen is a more promising host, but **x64 alone does not prove this emulator works**.
The older Tizen Windows documentation describes Intel HAXM; HAXM is Intel-only and
[retired](https://github.com/intel/haxm), so do not install it as a Ryzen fix.
More recent Samsung guidance in
[Samsung/Tizen.Issues#97](https://github.com/Samsung/Tizen.Issues/issues/97)
(2026-06-09, verified from the public comments) says to enable **Windows Hypervisor Platform**
in Windows Features and restart; it explicitly says the separate Hyper-V feature is not required.
This is a supported troubleshooting lead, not an independently observed Ryzen launch.
Check that AMD-V/SVM is enabled in firmware and record the exact Windows, SDK/extension and
TV-image versions. Do not disable Windows security features based on an old HAXM recipe.

After installing Node/npm and Tizen Studio/TV Extension with the owner's approval, the host
contracts can run in PowerShell without an emulator or Plex credentials:

```powershell
npm ci --prefix tests/tizen --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
node tools/tizen/build-locales.js
if ($LASTEXITCODE -ne 0) { throw "Locale check failed" }
Get-ChildItem tests/tizen -Filter *.test.js | Sort-Object Name | ForEach-Object {
    node $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Test failed: $($_.Name)" }
}
```

These commands are portable Node test entry points; execution on Windows remains to be observed.
Use the installed Windows Tizen CLI to perform an unsigned `build-web` into a uniquely named
temporary directory, then create/launch the TV emulator and record readiness before installing
an app. Signing and retail installation are separate authorized steps. If the installed emulator
still requires HAXM, Linux/KVM on an AMD host is the documented AMD-V alternative; do not assume
an ARM Windows VM or CrossOver supplies the missing backend.

Sign-in is saved automatically in **unencrypted** Web Storage. Turn **Stay signed in on this TV**
off in Settings on shared or untrusted TVs; the opt-out remains until explicitly turned on.
Sign-out deletes the saved token; if deletion fails the app warns that its data must be cleared.
Never include a saved token in a developer package, test fixture or screenshot.

## 7. Signing for other people, more TVs, and "homebrew"

Research checked 2026-10-11 from public sources; only the Tizen Studio route below was observed
in this project. Community tools listed here were **not** run or tested with PlexTv.

**Why every person signs their own build.** A Samsung distributor certificate can only be issued
by Samsung's servers after a Samsung-account sign-in, and it lists the DUIDs allowed to install the
package ([Samsung](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html),
[tizen-cert-cli FAQ](https://tizen-cert-cli.vercel.app)). We therefore cannot publish one `.wgt`
that installs on everyone's TV. Each person either signs the source with their own certificate
(section 6), or re-signs a released `.wgt` with their profile:
`tizen package -t wgt -s <profile> -o <out-dir> -- <app>.wgt`
(the same command Dolby's [SPOTT guide](https://ott.dolby.com/spott_releases/samsung_tizen_installation.html)
and [TizenBrew](https://github.com/reisxd/TizenBrew/blob/main/docs/README.md) document).
Never share your `.p12` files, passwords or a package signed for your DUIDs.

**Adding a TV.** Collect its DUID, then re-create (or renew) the distributor certificate with
the complete DUID list; Dolby recommends keeping a private DUID list file for this. Re-sign, run
`install-permit` on the new TV, install. Keep the same author certificate so updates match the
installed app (section 6). A 50-TV limit per certificate is stated by tizen-cert-cli's
documentation; Samsung's own page read here gives no number.

**Expiry.** The Samsung certificates expire; when signing or installing starts failing with a
certificate error after months of working, renew the profile (Certificate Manager, or
tizen-cert-cli's *Renew*, which reuses the old DUIDs). No primary source for the exact validity
period was verified, so check the dates in Certificate Manager.

**Certificate without Tizen Studio's GUI.** [gifflet/tizen-cert-cli](https://github.com/gifflet/tizen-cert-cli)
(MIT) is a terminal wizard that performs the same Samsung sign-in and writes a normal profile to
`~/tizen-studio-data/profile/profiles.xml`; you still need the Tizen CLI to package and install.
Its FAQ notes Tizen's Java signer rejects AES-encrypted `.p12` files with a misleading
"Invalid password" error.

**Is there "homebrew" for Samsung, like LG's Homebrew Channel?** Not in the LG sense. LG's Homebrew
Channel relies on a rooted TV; no public root route is used or proposed here. What exists are
**community installers that automate the same official Developer Mode + Samsung-certificate flow**:

| Project | What it is | Relevance |
|---|---|---|
| [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) (MIT; formerly Jellyfin2Samsung) | Desktop/Android installer: network scan, Samsung sign-in, per-TV certificates, installs catalog apps or your own `.wgt`/`.tpk` | Possible friendlier install path for PlexTv; untested |
| [TizenBrew](https://github.com/reisxd/TizenBrew) + [TizenBrewInstaller](https://github.com/reisxd/TizenBrewInstaller) | An app that loads modules (modded websites/apps) after one install; Tizen 7+ asks for Samsung sign-in to sign it | A loader, not a root channel; not a target for PlexTv now |

All of them still require Developer Mode with your computer's IP and, at least on Tizen 7+, a
Samsung account. TizenBrew notes Samsung shut down the USB demo-package service, so a USB-only
route is not available.

**Observed: installing without a Samsung account (2017 and 2019 sets, 2026-10-11).** The test
started in a clean directory. The only TV-side setup was Developer Mode with this computer's IP.
The Tizen CLI ran from the public `vitalets/tizen-webos-sdk` Docker image under Colima. The test
app was a synthetic hello `.wgt`, not PlexTv. It was signed with a self-made author certificate
(`tizen certificate ...`) and the SDK's stock **Tizen default distributor**
(`tools/certificate-generator/certificates/distributor/tizen-distributor-signer.p12` with
`tizen-distributor-ca.cer`). The TV's DUID was never used. Results:

| TV | Install | Launch | Uninstall |
|---|---|---|---|
| UE43RU7092 (2019, Tizen 5.0) | pass, about 4 s | pass | **fail**: CLI is a silent no-op; delete via the TV's Apps screen |
| UE55MU6172 (2017, Tizen 3.0) | pass, about 4 s | pass | pass with `-p <app-id> -t <name>` |

- The 2017 set had earlier run `install-permit` for a different, Samsung-issued certificate. No
  permit was run in this test.
- Not yet tested:
  - a 2018 set;
  - Tizen 6.5 or newer;
  - a TV that has never had a developer install;
  - whether Developer Mode turning off later removes or disables such apps;
  - PlexTv itself.

Until those are tested, the Samsung-certificate route (section 3) remains the documented path.

Exact commands, where `<name>` is the third column of `sdb devices`, not the `ip:port` serial:

```sh
tizen package -t wgt -s <profile> -- <app-dir>
tizen install -n <app>.wgt -t <name>
tizen run -p <package-id>.<app-name> -t <name>
tizen uninstall -p <package-id>.<app-name> -t <name>
```

`tizen uninstall` needs the full **application** ID. Given only the package ID it fails with "The
package is not exist", and without `-t` it exits silently without removing anything.

On the 2019 set (Tizen 5.0) even the correct command printed only "Platform log view" and left the
app installed; `sdb uninstall`, `sdb shell 0 vd_appuninstall` and `sdb shell 0 uninstall` all
returned "closed". Remove the app on the TV instead: Apps → Settings (gear) → select the app →
Delete. Confirm removal by re-listing apps, not by the CLI's exit status.

**Troubleshooting.**

| Symptom | Likely cause |
|---|---|
| `install failed[118]` | `install-permit` not run for this TV/certificate (section 3) |
| Signing says "Invalid password" | AES-encrypted `.p12` (see tizen-cert-cli above), a wrong password, or Linux/Docker with no keyring: `security-profiles add` stores masked passwords. Write `profiles.xml` with the plain passwords instead. The real error is in `~/tizen-studio-data/cli/logs/cli.log` |
| `tizen uninstall` says "package is not exist" or does nothing | Use the app ID (`<pkg>.<name>`) and `-t <device name>` (above); on Tizen 5.0 it may still do nothing, so delete on the TV |
| Port 26101 open but `sdb connect` fails | Developer Mode's Host PC IP points at another computer |
| `sdb connect` fails but `nc -vz <tv-ip> 26101` works | macOS Local Network permission (section 4) |
| TV refuses the connection | Host PC IP in Developer Mode is not the address the computer actually uses (section 4) |
| Certificate rejected for a new TV | Its DUID is not in the distributor certificate, or the REST-API `duid` was used |

**Baseline to beat.** Plex's support page says the official app runs on 2016+ Tizen Samsung sets,
and that most Samsung models cannot make secure connections to a personal server, so insecure
connections must be allowed
([Plex support](https://support.plex.tv/articles/204080173-which-smart-tv-models-are-supported/)).
Test against the official app on the same TV before claiming an improvement.

## 8. Rules for device and account tests

- Use a throwaway test server with lawful sample media. Use a guest or test account, never a household's real profile or watch history.
- Do not disable TLS verification as a shortcut. Record what happens instead.
- Do not publish tokens, addresses, certificates, or DUIDs.
- Label results with model, firmware and date; claim only what was observed.

## Glossary

- **`.wgt`**: Samsung's packaged web app.
- **DUID**: the TV's unique ID, used in the certificate.
- **AVPlay**: Samsung's video API; Samsung documents it for 2018 UHD where MSE is FHD-only. Selected UHD HEVC playback, including HDR10, was observed on the tested 2017 UE55MU6172; that one-set result does not establish capability for other 2017 models.
- **MSE**: the browser video interface; FHD-only on 2018 TVs.
- **Distributor certificate**: the certificate that lists which TVs may install your app.
