#!/usr/bin/env python3
"""Build, sign and publish a Plx Samsung release from a local machine.

    python samsung/release.py VERSION [--no-publish]

Same build as samsung/build.py, signed with the private release author certificate
(PLX_RELEASE_DIR, default ~/.config/plxnative/samsung-release: plx-release-author.p12 +
author.pw). Keep that certificate: the TV refuses updates signed with a different one.
CI does the same on a pushed samsung-vVERSION tag (.github/workflows/samsung.yml).
"""
import argparse
import os
import subprocess
from pathlib import Path

import build

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("version")
parser.add_argument("--no-publish", action="store_true")
parser.add_argument("--notes-file", type=Path)
args = parser.parse_args()
if args.notes_file is not None and not args.notes_file.is_file():
    parser.error("--notes-file must name an existing release note")
version = args.version
key_dir = Path(os.environ.get("PLX_RELEASE_DIR") or Path.home() / ".config/plxnative/samsung-release")
p12, pw = key_dir / "plx-release-author.p12", key_dir / "author.pw"
for f in (p12, pw):
    if not f.is_file():
        sys.exit(f"Missing: {f}")
os.environ["PLX_AUTHOR_P12"] = str(p12)
os.environ["PLX_AUTHOR_PW"] = pw.read_text().strip()
out = build.build(version)
print(Path(f"{out}.sha256").read_text(), end="")

if not args.no_publish:
    head = subprocess.check_output(["git", "-C", str(build.HERE), "rev-parse", "HEAD"], text=True).strip()
    notes = ["--notes-file", str(args.notes_file)] if args.notes_file else [
        "--notes", "Install with the tizen-tv-builder toolkit: https://github.com/dragoshont/plx-native/blob/main/docs/install-samsung.md"]
    subprocess.run(["gh", "release", "create", f"samsung-v{version}", str(out), f"{out}.sha256",
                    "--repo", "dragoshont/plx-native", "--target", head, "--prerelease",
                    "--title", f"Plx for Samsung {version}"] + notes,
                   check=True)
