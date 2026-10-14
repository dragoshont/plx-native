# Install Vemm on Samsung Tizen

Published Samsung 0.2.7 appears as **Plx** on the TV. Current development source
uses the **Vemm** working brand with original artwork; the package/app IDs,
saved settings and existing author continuity are unchanged. This source
transition does not replace any published asset or install an update.

Use **one command-line tool: `python3 tools/tizen.py`**.
For the published 0.2.7 instructions below, it downloads the historical Plx
package, connects to your TV, signs the package with your signing
profile, installs it and checks that the TV lists the app.
You do not need to build the client or run Samsung's `tizen` command yourself.

## 1. Clone the toolkit

Install [Python 3.10 or newer](https://www.python.org/downloads/),
[Git](https://git-scm.com/downloads).

Then open a terminal and run:

```sh
git clone https://github.com/dragoshont/tizen-tv-builder.git
cd tizen-tv-builder
```

Clone the repository above to get these commands. The older published plugin
is not a substitute for this checkout.
Keep this terminal in `tizen-tv-builder` for every command below.
On Windows, use `py -3` instead of `python3`.

## 2. Set up this computer

```sh
python3 tools/tizen.py setup
```

This checks the computer's Samsung connection and installation tools and
installs missing Tizen Studio command-line tools, showing progress and errors.
It finishes without contacting a TV, creating certificates or installing an
app on a TV. You do not need to run an IDE or emulator.
Continue only when it reports **This computer is ready.**

If setup fails, it prints the error and a manual installation command. You can
also install
[Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html)
manually, then run setup again.

## 3. Prepare the TV

Your computer and TV must be on the same network. On the TV:

1. Open **Apps** and press **1 2 3 4 5** on the remote.
2. Set **Developer Mode** to **On**.
3. Set **Host PC IP** to your computer's local IPv4 address, found in its network settings.
4. Hold the remote's power button until the TV restarts.

## 4. Scan and install the published package

Find your TV from the terminal:

```sh
python3 tools/tizen.py scan
```

The result includes TV names, addresses and `tv-xxxxxx` aliases.
Use an address, exact name or alias wherever the commands below say `TV_IP`.
Replace that placeholder; do not type the letters `TV_IP`.
**Ready to connect** means the developer port answers, not that signing or
installation permission has been checked.

A TV that is off or in standby shows **Not reachable**; turn it on and scan
again, or skip it for now.

Allow your TVs in your signing certificate. List every TV you want to use;
one Samsung sign-in covers them all:

```sh
python3 tools/tizen.py cert add TV_IP [TV_IP ...]
```

A browser opens for Samsung sign-in. Every named TV must be reachable, or
nothing is changed. TVs already covered keep working, and if every TV is
already covered no sign-in is needed. Run it again later to add another TV.

The current Samsung release is
[Plx 0.2.7](https://github.com/dragoshont/plx-native/releases/tag/samsung-v0.2.7).
Install it directly from its GitHub asset:

```sh
python3 tools/tizen.py install https://github.com/dragoshont/plx-native/releases/download/samsung-v0.2.7/Plx-0.2.7.wgt TV_IP
```

The tool downloads the `.wgt` to a temporary folder, validates it, signs and
installs it, then verifies that its app ID is listed on the TV. Failures are
printed in the terminal. This URL selects **0.2.7**, not a future release.
For another version, copy its `.wgt` asset link from
[GitHub Releases](https://github.com/dragoshont/plx-native/releases).
GitHub's generic `releases/latest` link is not suitable: Samsung releases are
currently prereleases; historical release links remain preserved independently
of the Samsung-only active source.

Repeat the command with another TV's address to install on several TVs.
If installation reports that no signing profile allows this TV, run
`python3 tools/tizen.py cert add TV_IP` and follow Samsung sign-in, then
retry installation.
An update must use the same author certificate as the installed app; an
author mismatch requires resolving the error before updating.

On the TV, open **Plx** from **Apps**, then visit **plex.tv/link** on your phone
and enter the code shown on the TV.

**0.2.7 graphics option:** leave **New graphics enhancements** off for performance.
This optional WebGL artwork path was slower in the measured OFF/ON workloads;
existing Home acceleration and AVPlay remain active with it off. See
[the measured results](samsung-027-graphics-performance.md). The Account icon's
D-pad access is a reported unresolved issue; no remote-access fix is claimed here.

## Additional commands (optional)

The published package is installed after step 4. Use these when you want to
check it or inspect its UI:

```sh
python3 tools/tizen.py info TV_IP
python3 tools/tizen.py apps TV_IP
python3 tools/tizen.py info TV_IP --app PlxNative0.Plx
python3 tools/tizen.py open TV_IP PlxNative0.Plx
python3 tools/tizen.py screenshot TV_IP --app PlxNative0.Plx --out ./TV-Screenshots
```

App info reports whether `PlxNative0.Plx` is installed and its version **when
the TV reports one**. TVs that list only app IDs show **Version: unknown**.
The downloaded package's version is not proof of the installed version.

`open` and `screenshot` restart the app in debug mode. Captures show the app's
renderer drawing, not the whole TV or its video plane. Launch and capture
errors are reported, but these commands are not a complete JavaScript console
or network-error viewer.

### Prefer the web interface?

```sh
python3 tools/tizen.py portal
```

Open the printed address, normally <http://127.0.0.1:47811/>.
The page scans automatically. Select your TV and **Connect**, then use
**Install app**, or choose **Open screen** for an installed app.
**Refresh picture** and **Save screenshot** are in the screen area.

Keep the terminal open while using the portal. **Ctrl+C** stops it; run the
same command again to restart. To use another port:

```sh
python3 tools/tizen.py portal --port 47900
```

## Optional: start over

Only if you deliberately intend to remove the app and its local data, use the
commands below. **Do not do this to bypass an update's author mismatch.**
Keep the original author certificate for compatible updates.

```sh
python3 tools/tizen.py remove TV_IP PlxNative0.Plx
python3 tools/tizen.py info TV_IP --app PlxNative0.Plx
python3 tools/tizen.py cert reset PROFILE [PROFILE ...]
python3 tools/tizen.py cert reset PROFILE [PROFILE ...] --yes
```

`remove` uninstalls exactly that app and checks the TV's app list; an app that
is not installed is left as it is. Run it once per TV.
`cert reset` without `--yes` only shows what would be removed. With `--yes`
it backs up and then removes exactly the named signing profiles.
Resetting the profile that signed an installed app means that app must be
removed before a new profile can install it again.
Then continue from **cert add** in step 4.

For building Vemm from source or deeper troubleshooting, see the
[developer guide](samsung-getting-started.md).
