# Samsung Tizen TV: getting started (for beginners)

Part of the [Samsung feasibility study](samsung-tizen-feasibility.md). This is a plain-language
checklist for preparing a Samsung TV and a computer for the
[proof of concept](samsung-tizen-poc.md). **Run end to end once** (2026-10-09, macOS, a 2017 set): Tizen
Studio 6.1 CLI, a Samsung certificate, Developer Mode, and a hello app installed and launched. The gotchas
below are the ones actually hit. Where a page changes, Samsung's wins. Ask the owner before installing anything.

## What you are building

A Samsung TV app is a small website packaged as a `.wgt` file. You sign it with a certificate that
names your TV, install it over your home network, and run it. No rooting or jailbreaking is involved,
and none is proposed. This is different from the existing LG app, which stays untouched.

## 1. Find out exactly which TV you have

Write down, in a private note (not in git):

- Full model code from the label or Settings (for example `QN55Q60RAFXZA`), region, and model year (the 5th letter of the code on most models).
- Software version: Settings > Support > About This TV.
- The Frame: note that it is The Frame; Art Mode and standby are tested separately.
- The TV's Unique Device ID (DUID): Menu > Support > Contact Samsung > Unique Device ID [samsung].

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
   `tizen package -t wgt -s <profile> -- <dir>`, `tizen install -n <file>.wgt -s <target>`,
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

Credentials stay in memory unless a user explicitly selects **remember-me**. That option stores
the account token **unencrypted** in Web Storage; leave it off on shared or untrusted TVs.
Sign-out deletes the saved token; if deletion fails the app warns that its data must be cleared.
Never include a saved token in a developer package, test fixture or screenshot.

## 7. Rules for device and account tests

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
