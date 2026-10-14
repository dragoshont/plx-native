#!/usr/bin/env python3
"""Build a signed Vemm Samsung client .wgt from this checkout (Windows, macOS, Linux).

    python samsung/build.py [VERSION]

Output: samsung/dist/Plx-VERSION.wgt (+ .sha256). Install it with
    python samsung/install.py TV_IP samsung/dist/Plx-VERSION.wgt

Signing uses an author certificate plus the public Tizen distributor that ships with
Tizen Studio, so the package installs on Developer Mode TVs without a Samsung account.
The author certificate is PLX_AUTHOR_P12 + PLX_AUTHOR_PW if set, otherwise your own one in
~/.config/plxnative/samsung-author (PLX_AUTHOR_DIR), created on first use. A TV refuses
to update an app signed with a different author certificate. Preserve the existing
author; do not uninstall a working app to bypass a mismatch.
"""
import hashlib
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

PACKAGE_ID = "PlxNative0"
LICENSE_FILES = (
    "Apache-2.0.txt", "FreeType.txt", "GCC-exception-3.1.txt", "HarfBuzz-Old-MIT.txt",
    "ICU4X.txt", "LGPL-2.1.txt", "LLVM-exception.txt", "MIT.txt",
    "PlxNative-historical-MIT.txt", "SGI-B-2.0.txt", "Unicode-3.0.txt", "Zlib.txt",
    "libass-ISC.txt", "libm.txt", "qrcodegen.txt", "native-history-NOTICES.md",
)
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
WINDOWS = os.name == "nt"


def fail(msg):
    sys.exit(f"ERROR: {msg}")


def studio_dir():
    for d in (os.environ.get("TIZEN_STUDIO"), Path.home() / "tizen-studio", "C:/tizen-studio", "/opt/tizen-studio"):
        if d and (Path(d) / "tools").is_dir():
            return Path(d)
    fail("Tizen Studio was not found. Install it in your home folder, or set TIZEN_STUDIO.")


CLI_LOG = None


def run(*args):
    r = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    if r.returncode != 0:
        log = ""
        if CLI_LOG and CLI_LOG.is_file():
            log = "\n--- Tizen CLI log (tail) ---\n" + "\n".join(CLI_LOG.read_text(errors="replace").splitlines()[-40:])
        fail(f"{Path(str(args[0])).name} {args[1]} failed:\n{r.stdout}{r.stderr}{log}")
    return r.stdout


def data_dir(studio):
    info = studio / "sdk.info"
    if info.is_file():
        m = re.search(r"^TIZEN_SDK_DATA_PATH=(.+)$", info.read_text(), re.M)
        if m:
            return Path(m.group(1).strip())
    return Path.home() / "tizen-studio-data"


def inline_passwords(profiles, pw):
    """Linux keeps profile passwords in a desktop keyring, which CI does not have.
    The CLI also reads a password stored inline with its fixed DESede key, so use that."""
    import xml.etree.ElementTree as ET
    key = b"KYANINYLhijklmnopqrstuvw".hex()

    def enc(text):
        r = subprocess.run(["openssl", "enc", "-des-ede3", "-K", key, "-nosalt", "-a", "-A"],
                           input=text.encode(), capture_output=True)
        if r.returncode != 0:
            fail("openssl is needed to sign on Linux")
        return r.stdout.decode().strip()

    tree = ET.parse(profiles)
    for prof in tree.getroot().iter("profile"):
        if prof.get("name") == "plx-build":
            for item in prof.iter("profileitem"):
                kind = item.get("distributor")
                if kind in ("0", "1"):
                    item.set("password", enc(pw if kind == "0" else "tizenpkcs12passfordsigner"))
    tree.write(profiles, encoding="UTF-8", xml_declaration=True)


def author_cert(tizen, work):
    p12, pw = os.environ.get("PLX_AUTHOR_P12"), os.environ.get("PLX_AUTHOR_PW")
    if p12:
        if not (Path(p12).is_file() and pw):
            fail("PLX_AUTHOR_P12 must be a file and PLX_AUTHOR_PW must be set.")
        return Path(p12), pw
    key_dir = Path(os.environ.get("PLX_AUTHOR_DIR") or Path.home() / ".config/plxnative/samsung-author")
    cert, pw_file = key_dir / "author.p12", key_dir / "author.pw"
    if not cert.is_file():
        print(f"Creating your Vemm update author certificate in {key_dir} (keep it for future updates)")
        key_dir.mkdir(parents=True, exist_ok=True)
        os.chmod(key_dir, 0o700)
        pw_file.write_text(secrets.token_urlsafe(18).replace("-", "a").replace("_", "b"))
        os.chmod(pw_file, 0o600)
        out = work / "cert"
        out.mkdir()
        run(tizen, "certificate", "-a", "plx-author", "-p", pw_file.read_text(), "-n", "Plx author", "-f", "author", "--", out)
        shutil.move(str(out / "author.p12"), cert)
    return cert, pw_file.read_text().strip()


def stage(app, version):
    app.mkdir()
    for name in ("config.xml", "index.html", "main.js", "icon.png"):
        shutil.copyfile(HERE / "PlexTv" / name, app / name)
    for name in ("js", "css"):
        shutil.copytree(HERE / "PlexTv" / name, app / name,
                        ignore=shutil.ignore_patterns(".*", "*.map", "*.wgt"))
    shutil.copytree(HERE / "PlexTv" / "brand", app / "brand")
    cfg = app / "config.xml"
    text = cfg.read_text(encoding="utf-8")
    text, n1 = re.subn(r'(<widget [^>]*version=")[^"]*"', rf'\g<1>{version}"', text, count=1)
    text, n2 = re.subn(r"<tizen:application required_version=",
                       f'<tizen:application id="{PACKAGE_ID}.Plx" package="{PACKAGE_ID}" required_version=', text, count=1)
    if n1 != 1 or n2 != 1:
        fail("Could not stamp config.xml")
    cfg.write_text(text, encoding="utf-8")
    for name in ("LICENSE", "LICENSING.md", "THIRD-PARTY-NOTICES.md", "TRADEMARKS.md"):
        shutil.copyfile(ROOT / name, app / name)
    (app / "licenses").mkdir()
    for name in LICENSE_FILES:
        shutil.copyfile(ROOT / "licenses" / name, app / "licenses" / name)


def es5_check():
    node = shutil.which("node")
    if node and (ROOT / "tests/tizen/node_modules/acorn").is_dir():
        run(node, ROOT / "tools/tizen/check-es5.js", HERE / "PlexTv")


def build(version, out_dir=HERE / "dist"):
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        fail("Usage: python samsung/build.py [VERSION]   (e.g. 0.2.2)")
    studio = studio_dir()
    tizen = studio / "tools/ide/bin" / ("tizen.bat" if WINDOWS else "tizen")
    dist = studio / "tools/certificate-generator/certificates/distributor"
    for f in (tizen, dist / "tizen-distributor-signer.p12", dist / "tizen-distributor-ca.cer"):
        if not f.exists():
            fail(f"Missing: {f} (reinstall Tizen Studio with the TV extension)")
    es5_check()

    global CLI_LOG
    CLI_LOG = data_dir(studio) / "cli/logs/cli.log"
    profiles = data_dir(studio) / "profile/profiles.xml"
    backup = profiles.read_bytes() if profiles.is_file() else None
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        try:
            cert, pw = author_cert(tizen, work)
            app = work / "app"
            stage(app, version)
            if backup is None:
                # A fresh data directory (e.g. a CI cache hit on the CLI alone) has no
                # profiles.xml, and `security-profiles add` refuses to create one.
                profiles.parent.mkdir(parents=True, exist_ok=True)
                profiles.write_text('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
                                    '<profiles active="" version="3.1"/>\n', encoding="utf-8")
            # A temporary signing profile; the previous profiles.xml is restored below.
            run(tizen, "security-profiles", "add", "-n", "plx-build", "-a", cert, "-p", pw,
                "-d", dist / "tizen-distributor-signer.p12", "-dp", "tizenpkcs12passfordsigner",
                "-dc", dist / "tizen-distributor-ca.cer")
            if sys.platform.startswith("linux"):
                inline_passwords(profiles, pw)
            pkg_dir = work / "out"
            pkg_dir.mkdir()
            run(tizen, "package", "-t", "wgt", "-s", "plx-build", "-o", pkg_dir, "--", app)
        finally:
            if backup is None:
                profiles.unlink(missing_ok=True)
            else:
                profiles.write_bytes(backup)
        pkgs = list(pkg_dir.glob("*.wgt"))
        if len(pkgs) != 1:
            fail("Packaging produced no .wgt (see the Tizen CLI log in tizen-studio-data/cli/logs)")
        with zipfile.ZipFile(pkgs[0]) as z:
            if "signature1.xml" not in z.namelist():
                fail("Package is not signed")
        out_dir.mkdir(parents=True, exist_ok=True)
        out = out_dir / f"Plx-{version}.wgt"
        shutil.move(str(pkgs[0]), out)
    digest = hashlib.sha256(out.read_bytes()).hexdigest()
    (out_dir / f"{out.name}.sha256").write_text(f"{digest}  {out.name}\n")
    print(f"Built {out}")
    return out


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "0.0.0")
