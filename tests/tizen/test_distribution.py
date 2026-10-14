"""Offline WGT staging and exact committed-source contracts. No SDK or certificates."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


build = load("samsung_build", ROOT / "samsung/build.py")
source = load("samsung_source", ROOT / "samsung/source_bundle.py")


class DistributionTests(unittest.TestCase):
    def test_staged_identity_and_notices(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = Path(tmp) / "app"
            build.stage(app, "0.2.7")
            config = (app / "config.xml").read_text()
            self.assertIn('id="PlxNative0.Plx" package="PlxNative0"', config)
            self.assertIn('version="0.2.7"', config)
            self.assertIn("<name>Media for Tizen</name>", config)
            for name in ("LICENSE", "LICENSING.md", "THIRD-PARTY-NOTICES.md", "TRADEMARKS.md",
                         "licenses/PlxNative-historical-MIT.txt", "licenses/native-history-NOTICES.md"):
                self.assertEqual((app / name).read_bytes(), (ROOT / name).read_bytes())
            self.assertEqual((app / "icon.png").read_bytes(), (ROOT / "samsung/PlexTv/icon.png").read_bytes())
            self.assertFalse(list(app.rglob("*.wgt")))
            self.assertFalse((app / "node_modules").exists())
            self.assertFalse((app / "author-signature.xml").exists())
            self.assertFalse((app / ".buildResult").exists())

    def test_inherited_language_fixture_is_frozen(self):
        catalog = json.loads((ROOT / "tests/tizen/fixtures/account-languages.json").read_text())
        data = json.dumps(catalog["languages"], ensure_ascii=False, separators=(",", ":")).encode()
        self.assertEqual(hashlib.sha256(data).hexdigest(),
                         "668f2f8d75481e5749b7a4ad99e0e5dac5cac35f98a94189a861859966293679")

    def test_staging_excludes_non_product_root_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            here = Path(tmp) / "samsung"
            product = here / "PlexTv"
            product.mkdir(parents=True)
            for name in ("config.xml", "index.html", "main.js", "icon.png"):
                (product / name).write_bytes((ROOT / "samsung/PlexTv" / name).read_bytes())
            for name in ("js", "css"):
                (product / name).mkdir()
            (product / "private.txt").write_text("synthetic-private-value")
            (product / ".settings").mkdir()
            (product / ".settings/account.txt").write_text("synthetic-account")
            (product / "author-signature.xml").write_text("synthetic-signature")
            with patch.object(build, "HERE", here):
                build.stage(Path(tmp) / "stage", "0.2.7")
            files = {p.name for p in (Path(tmp) / "stage").iterdir()}
            self.assertEqual(files, {"config.xml", "index.html", "main.js", "icon.png", "js", "css",
                                     "LICENSE", "LICENSING.md", "THIRD-PARTY-NOTICES.md",
                                     "TRADEMARKS.md", "licenses"})

    def test_exact_source_ignores_private_files_and_refuses_dirty_or_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo"
            root.mkdir()

            def git(*args):
                return subprocess.check_output(["git", "-C", str(root), *args], stderr=subprocess.STDOUT)

            git("init", "-q")
            git("config", "user.name", "Synthetic Test")
            git("config", "user.email", "synthetic@example.invalid")
            (root / ".gitignore").write_text("private.txt\n")
            (root / "app.js").write_text('"use strict";\n')
            git("add", ".gitignore", "app.js")
            git("commit", "-qm", "Synthetic source")
            (root / "private.txt").write_text("synthetic-private-value")
            sha = git("rev-parse", "HEAD").decode().strip()
            output = Path(tmp) / "output"
            archive = source.create(output, root)
            checksum = archive.with_suffix(".zip.sha256")
            self.assertEqual(checksum.read_text(), f"{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n")
            prefix = f"Samsung-source-{sha}/"
            with zipfile.ZipFile(archive) as package:
                self.assertEqual(sorted(package.namelist()), [prefix, prefix + ".gitignore", prefix + "app.js"])
                self.assertEqual(package.read(prefix + "app.js"), b'"use strict";\n')
            with self.assertRaises(FileExistsError):
                source.create(output, root)
            (root / "app.js").write_text("changed")
            with self.assertRaisesRegex(ValueError, "clean committed tree"):
                source.create(Path(tmp) / "dirty", root)
            (root / "app.js").write_text('"use strict";\n')
            (root / "untracked.txt").write_text("not committed")
            with self.assertRaisesRegex(ValueError, "clean committed tree"):
                source.create(Path(tmp) / "untracked", root)


if __name__ == "__main__":
    unittest.main()
