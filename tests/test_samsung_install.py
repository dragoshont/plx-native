"""Installer regression tests with fake SDK commands; no TV access."""

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "samsung_install", Path(__file__).resolve().parents[1] / "samsung/install.py"
)
INSTALL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSTALL)


class SamsungInstallTests(unittest.TestCase):
    def install(self, output, code=1):
        calls = []

        def run(*args):
            calls.append(args)
            if args == ("fake-sdb", "devices"):
                return 0, "List of devices attached\n192.0.2.1:26101 device SyntheticTV\n"
            if args[:2] == ("fake-tizen", "install"):
                return code, output
            return 0, ""

        with tempfile.TemporaryDirectory() as temporary:
            package = Path(temporary) / "Synthetic.wgt"
            package.write_bytes(b"synthetic")
            with patch.object(INSTALL.sys, "argv", ["install.py", "192.0.2.1", str(package)]), \
                    patch.object(INSTALL, "tools", return_value=("fake-sdb", "fake-tizen")), \
                    patch.object(INSTALL, "run", side_effect=run):
                try:
                    INSTALL.main()
                except SystemExit as error:
                    result = error.code
                else:
                    result = 0
        return result, calls

    def test_author_mismatch_does_not_uninstall_or_retry(self):
        result, calls = self.install("error -11: author signature mismatch")
        self.assertNotEqual(result, 0)
        self.assertFalse(any(call[:2] == ("fake-tizen", "uninstall") for call in calls))
        self.assertEqual(sum(call[:2] == ("fake-tizen", "install") for call in calls), 1)
        self.assertEqual(calls[-1], ("fake-sdb", "disconnect", "192.0.2.1:26101"))

    def test_other_signature_error_does_not_uninstall(self):
        result, calls = self.install("Distributor signature verification failed")
        self.assertNotEqual(result, 0)
        self.assertFalse(any(call[:2] == ("fake-tizen", "uninstall") for call in calls))

    def test_install_success(self):
        result, calls = self.install("install completed", code=0)
        self.assertEqual(result, 0)
        self.assertEqual(calls[-1], ("fake-sdb", "disconnect", "192.0.2.1:26101"))

    def test_other_install_error_stops_and_disconnects(self):
        result, calls = self.install("error 118: install permission denied")
        self.assertNotEqual(result, 0)
        self.assertFalse(any(call[:2] == ("fake-tizen", "uninstall") for call in calls))
        self.assertEqual(calls[-1], ("fake-sdb", "disconnect", "192.0.2.1:26101"))


if __name__ == "__main__":
    unittest.main()
