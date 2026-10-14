#!/usr/bin/env python3
"""Archive the exact clean committed Samsung source, without private worktree files."""
import argparse
import hashlib
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent


def create(output, root=ROOT):
    status = subprocess.check_output(
        ["git", "-C", str(root), "status", "--porcelain", "--untracked-files=normal"], text=True)
    if status.strip():
        raise ValueError("Complete-source archives require a clean committed tree")
    sha = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f"Samsung-source-{sha}.zip"
    checksum = archive.with_suffix(".zip.sha256")
    if archive.exists() or checksum.exists():
        raise FileExistsError("Refusing to replace an existing source archive or checksum")
    data = subprocess.check_output(
        ["git", "-C", str(root), "archive", "--format=zip", f"--prefix=Samsung-source-{sha}/", "HEAD"])
    with archive.open("xb") as stream:
        stream.write(data)
    with checksum.open("x", encoding="utf-8") as stream:
        stream.write(f"{hashlib.sha256(data).hexdigest()}  {archive.name}\n")
    return archive


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(create(args.output))
    except (ValueError, FileExistsError) as error:
        parser.exit(1, f"ERROR: {error}\n")
