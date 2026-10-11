# Install Plx on a Samsung TV

Use **one command-line tool: `python3 tools/tizen.py`**.
It downloads Plx, connects to your TV, signs the package with your signing
profile, installs it and checks that the TV lists the app.
You do not need to build Plx or run Samsung's `tizen` command yourself.

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

## 4. Scan and install Plx

Find your TV from the terminal:

```sh
python3 tools/tizen.py scan
```

The result includes TV names, addresses and `tv-xxxxxx` aliases.
Use an address, exact name or alias wherever the commands below say `TV_IP`.
Replace that placeholder; do not type the letters `TV_IP`.
**Ready to connect** means the developer port answers, not that signing or
installation permission has been checked.

The current Samsung release is
[Plx 0.2.2](https://github.com/dragoshont/plx-native/releases/tag/samsung-v0.2.2).
Install it directly from its GitHub asset:

```sh
python3 tools/tizen.py install https://github.com/dragoshont/plx-native/releases/download/samsung-v0.2.2/Plx-0.2.2.wgt TV_IP
```

The tool downloads the `.wgt` to a temporary folder, validates it, signs and
installs it, then verifies that its app ID is listed on the TV. Failures are
printed in the terminal. This URL selects **0.2.2**, not a future release.
For another version, copy its `.wgt` asset link from
[GitHub Releases](https://github.com/dragoshont/plx-native/releases).
GitHub's generic `releases/latest` link is not suitable: Samsung releases are
currently prereleases, and this repository also carries webOS releases.

Repeat the command with another TV's address to install on several TVs.
If installation reports that no signing profile allows this TV, run
`python3 tools/tizen.py tv cert add TV_IP` and follow Samsung sign-in, then
retry installation.
An update must use the same author certificate as the installed app; an
author mismatch requires resolving the error before updating.

On the TV, open **Plx** from **Apps**, then visit **plex.tv/link** on your phone
and enter the code shown on the TV.

## Additional commands (optional)

Plx is installed after step 4. Use these when you want to check it or inspect
its UI:

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

For building Plx from source or deeper troubleshooting, see the
[developer guide](samsung-getting-started.md).
