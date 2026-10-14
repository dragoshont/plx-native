#!/usr/bin/env python3
"""Install or update Vemm in Samsung Developer Mode (Windows, macOS, Linux).

    python install.py TV_IP [VERSION | Plx.wgt]

Without a file it downloads the given (or latest) Samsung release. An installed app
can be updated with the same author certificate. This script never uninstalls it.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

REPO = "dragoshont/plx-native"
APP_ID = "PlxNative0.Plx"
WINDOWS = os.name == "nt"


def fail(*lines):
    print(f"ERROR: {lines[0]}", file=sys.stderr)
    for line in lines[1:]:
        print(f"  {line}", file=sys.stderr)
    sys.exit(1)


def tools():
    for d in (os.environ.get("TIZEN_STUDIO"), Path.home() / "tizen-studio", "C:/tizen-studio", "/opt/tizen-studio"):
        if not d:
            continue
        sdb = Path(d) / "tools" / ("sdb.exe" if WINDOWS else "sdb")
        tizen = Path(d) / "tools/ide/bin" / ("tizen.bat" if WINDOWS else "tizen")
        if sdb.is_file() and tizen.is_file():
            return str(sdb), str(tizen)
    fail("Tizen Studio was not found. Install it (step 2), or set TIZEN_STUDIO to its folder.")


def run(*args):
    r = subprocess.run(args, capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def latest_version():
    try:
        with urllib.request.urlopen(f"https://api.github.com/repos/{REPO}/releases?per_page=30", timeout=30) as r:
            for rel in json.load(r):
                if rel["tag_name"].startswith("samsung-v"):
                    return rel["tag_name"][len("samsung-v"):]
    except OSError:
        pass
    fail("Could not find the latest Samsung release.")


def download(version, folder):
    url = f"https://github.com/{REPO}/releases/download/samsung-v{version}/Plx-{version}.wgt"
    path = Path(folder) / f"Plx-{version}.wgt"
    print(f"Downloading Samsung release {version}...")
    try:
        with urllib.request.urlopen(url, timeout=120) as r:
            path.write_bytes(r.read())
    except OSError:
        fail(f"Download failed: {url}")
    return path


def installed(out):
    return re.search(r"install completed|installed successfully", out, re.I) is not None


def main():
    if len(sys.argv) < 2:
        fail("Usage: python install.py TV_IP [VERSION | Plx.wgt]")
    serial = sys.argv[1].removesuffix(":26101") + ":26101"
    arg = sys.argv[2] if len(sys.argv) > 2 else ""
    sdb, tizen = tools()

    with tempfile.TemporaryDirectory() as tmp:
        wgt = Path(arg) if arg and Path(arg).is_file() else download(arg or latest_version(), tmp)

        print("Connecting to the TV...")
        run(sdb, "connect", serial)
        try:
            _, devices = run(sdb, "devices")
            name = next((l.split()[2] for l in devices.splitlines()
                         if len(l.split()) >= 3 and l.split()[0] == serial and l.split()[1] == "device"), None)
            if not name:
                fail("The TV refused the connection.",
                     "On the TV: Apps, press 1 2 3 4 5, set Developer Mode On and Host PC IP to this computer's IP.",
                     "Then hold the TV's power button until it restarts, and run this again.")

            print(f"Installing on {name}...")
            _, out = run(tizen, "install", "-n", str(wgt), "-t", name)
            if not installed(out) and re.search(r"-11\b|signature", out, re.I):
                print(out, file=sys.stderr)
                fail("The TV rejected the package signature. The existing app was not removed.",
                     "For an author mismatch, install an update signed with the original author certificate.",
                     "Do not uninstall a working app to bypass the mismatch; uninstalling can erase saved sign-in.")
            if not installed(out):
                print(out, file=sys.stderr)
                fail("Install failed (output above).")
        finally:
            run(sdb, "disconnect", serial)
    print("Done. Open Vemm from Apps (published 0.2.7 and older releases still appear as Plx) and sign in at plex.tv/link.")


if __name__ == "__main__":
    main()
