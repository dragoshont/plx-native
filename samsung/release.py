#!/usr/bin/env python3
"""Build, sign and publish a Plx Samsung release from a local machine.

    python samsung/release.py VERSION [--no-publish]

Same build as samsung/build.py, signed with the private release author certificate
(PLX_RELEASE_DIR, default ~/.config/plxnative/samsung-release: plx-release-author.p12 +
author.pw). Keep that certificate: the TV refuses updates signed with a different one.
CI does the same on a pushed samsung-vVERSION tag (.github/workflows/samsung.yml).
"""
import os
import subprocess
import sys
from pathlib import Path

import build

if len(sys.argv) < 2:
    sys.exit("Usage: python samsung/release.py VERSION [--no-publish]")
version = sys.argv[1]
key_dir = Path(os.environ.get("PLX_RELEASE_DIR") or Path.home() / ".config/plxnative/samsung-release")
p12, pw = key_dir / "plx-release-author.p12", key_dir / "author.pw"
for f in (p12, pw):
    if not f.is_file():
        sys.exit(f"Missing: {f}")
os.environ["PLX_AUTHOR_P12"] = str(p12)
os.environ["PLX_AUTHOR_PW"] = pw.read_text().strip()
out = build.build(version)
print(Path(f"{out}.sha256").read_text(), end="")

if "--no-publish" not in sys.argv:
    head = subprocess.check_output(["git", "-C", str(build.HERE), "rev-parse", "HEAD"], text=True).strip()
    subprocess.run(["gh", "release", "create", f"samsung-v{version}", str(out), f"{out}.sha256",
                    "--repo", "dragoshont/plx-native", "--target", head, "--prerelease",
                    "--title", f"Plx for Samsung {version}",
                    "--notes", "Install: see docs/install-samsung.md. Signed for Developer Mode TVs (no Samsung account needed)."],
                   check=True)
