# Samsung Tizen TV: getting started (for beginners)

Part of the [Samsung feasibility study](samsung-tizen-feasibility.md). This is a plain-language
checklist for installing the separate experimental Samsung client and preparing a named-model
[test](samsung-tizen-poc.md). **Developer installation observed** (2026-10-09/11, macOS, a 2017 set):
Tizen Studio 6.1 installation, Tizen CLI 2.5.25, SDB 4.2.36, Samsung signing, Developer Mode,
hello/probe apps and the current Plex client installed and launched. The gotchas
below are the ones actually hit. Where a page changes, Samsung's wins. Ask the owner before installing anything.

**Only want to install Plx?** Follow the [Samsung installation guide](install-samsung.md): one
toolkit command installs a released `.wgt`. This page is for building and developing the client.

## What you are building

A Samsung TV app is a small website packaged as a `.wgt` file. You sign it with a certificate that
names your TV, install it over your home network, and run it. No rooting or jailbreaking is involved,
and none is proposed. This is different from the existing LG app, which stays untouched.

There is no Samsung Store release or universal download you can install on any TV. The current
route needs a computer and a Samsung developer certificate containing **your** TV's DUID.
An LG `.ipk` or Homebrew Channel package cannot install on Samsung. If you only want a supported
one-click app today, this experimental build is not that yet.

## Installing Plx

Use the [Samsung installation guide](install-samsung.md). It installs a released package with
`python3 tools/tizen.py` from [tizen-tv-builder](https://github.com/dragoshont/tizen-tv-builder):
`scan`, `cert add` for your TV's DUID (one Samsung sign-in) and `install`. You do not need Tizen
Studio's IDE, Certificate Manager or the `tizen` command for that route. The sections below explain
what those steps do, for development and troubleshooting.

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

### Build and install your own package

Complete sections 1–4 first, or let the toolkit's `cert add` create the certificate for you.

1. Clone this repository's `main` branch and run the host gates above:
   ```sh
   git clone https://github.com/dragoshont/plx-native.git
   cd plx-native
   ```
2. Build a signed package. The version is yours to choose:
   ```sh
   python3 samsung/build.py 0.0.1
   ```
   It writes `samsung/dist/Plx-0.0.1.wgt` and its `.sha256`, with the fixed application ID
   `PlxNative0.Plx`, the same ID as the released packages, so your build updates or replaces an
   installed Plx rather than appearing as a second app. Nothing private enters the checkout:
   the author certificate lives outside it.
3. Install it with the toolkit, exactly as for a release:
   ```sh
   python3 tools/tizen.py install /path/to/plx-native/samsung/dist/Plx-0.0.1.wgt TV_IP
   ```
   The toolkit re-signs with your active profile, installs and checks the TV's app list.
   A TV refuses an update signed by a different author: remove Plx first
   (`python3 tools/tizen.py remove TV_IP PlxNative0.Plx`).
4. Open **Plx** from the TV's Apps screen. Scan the QR or enter the displayed code at
   `plex.tv/link`, choose your profile (PIN only if protected), then your server. Sign-in is
   saved automatically in unencrypted TV storage; Settings can turn this off and sign-out
   deletes it.

Plx has been installed and used on a 2017 UE55MU6172 (Tizen 3.0), two 2019 UE43RU7092 sets
(Tizen 5.0), a QE65Q80C and a 2025 QE55QN70F. That is not a support list for other models:
each new TV needs its DUID in your certificate, and codec, remote and standby behaviour can
differ by model year.

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
Delete. Confirm removal by re-listing apps, not by the CLI's exit status:
`sdb -s <ip>:26101 shell 0 vd_applist` worked on both the 2017 and 2019 sets and prints
"apps count: N" followed by one `app_tizen_id` entry per app.

Other developers have reported the same behaviour, so it is not specific to our set. No vendor
documentation or affected-model list was found:

- A Stack Overflow question about a 2019 UA43RU7100 (same RU7 series) reports that uninstalling
  from Tizen Studio fails while removing the app on the TV works
  ([77222543](https://stackoverflow.com/questions/77222543)).
- The Appium Tizen driver found that `tizen uninstall`, `sdb uninstall` and `0 vd_appuninstall`
  "end silently" on some models, treated it as a device-side fault, and now re-checks the app list
  and asks for manual removal
  ([headspinio/appium-tizen-tv-driver#603](https://github.com/headspinio/appium-tizen-tv-driver/issues/603),
  [#604](https://github.com/headspinio/appium-tizen-tv-driver/pull/604),
  [#690](https://github.com/headspinio/appium-tizen-tv-driver/pull/690)).
- A 2018 report against the Tizen VS Code extension shows `sdb uninstall` returning "closed" on
  one TV while `0 vd_appuninstall` worked
  ([chunhua-liu/vscode-extension-tizentv#5](https://github.com/chunhua-liu/vscode-extension-tizentv/issues/5)).
- Apps2Samsung probes `0 vd_appuninstall` before installing and treats "FAILED" as a TV that
  cannot delete apps.

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
