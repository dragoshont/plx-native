#!/usr/bin/env python3
"""Exercise the compiled Rust entry point, not a Python receipt implementation."""
import ctypes
from pathlib import Path
import secrets
import socket
import tempfile
import unittest


class ReceiptTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.library = ctypes.CDLL(str(
            Path(__file__).parent / "target/release/libplx_rust_receipt.dylib"))
        cls.entry = cls.library.plx_probe_entry
        cls.entry.argtypes = [ctypes.c_char_p]
        cls.entry.restype = ctypes.c_int

    def call(self, data):
        with tempfile.NamedTemporaryFile() as config:
            config.write(data)
            config.flush()
            return self.entry(str(config.name).encode())

    def test_rust_sends_exact_nonce(self):
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as receiver:
            receiver.bind(("127.0.0.1", 0))
            receiver.settimeout(2)
            nonce = secrets.token_bytes(32)
            config = socket.inet_aton("127.0.0.1")
            config += receiver.getsockname()[1].to_bytes(2, "big") + nonce
            self.assertEqual(self.call(config), 0)
            data, peer = receiver.recvfrom(1024)
            self.assertEqual(data, b"PLX-RUST-V1:\n" + nonce)
            self.assertEqual(peer[0], "127.0.0.1")
            receiver.settimeout(0.05)
            with self.assertRaises(socket.timeout):
                receiver.recvfrom(1024)

    def test_null_path(self):
        self.assertEqual(self.entry(None), 10)

    def test_missing_path(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(self.entry(str(Path(folder) / "missing").encode()), 11)

    def test_truncated_config(self):
        self.assertEqual(self.call(bytes(37)), 13)

    def test_oversized_config(self):
        self.assertEqual(self.call(bytes(39)), 13)

    def test_empty_config(self):
        self.assertEqual(self.call(b""), 13)

    def test_zero_port(self):
        self.assertEqual(self.call(bytes(38)), 13)

    def test_graphics_stage_is_not_a_success_receipt(self):
        if not hasattr(self.library, "plx_probe_stage"):
            self.skipTest("Build with --features gles for graphics stage tests")
        stage = self.library.plx_probe_stage
        stage.argtypes = [ctypes.c_char_p, ctypes.c_uint32]
        stage.restype = ctypes.c_int
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as receiver:
            receiver.bind(("127.0.0.1", 0))
            receiver.settimeout(2)
            nonce = secrets.token_bytes(32)
            config = socket.inet_aton("127.0.0.1")
            config += receiver.getsockname()[1].to_bytes(2, "big") + nonce
            with tempfile.NamedTemporaryFile() as file:
                file.write(config)
                file.flush()
                self.assertEqual(stage(str(file.name).encode(), 101), 0)
            self.assertEqual(receiver.recvfrom(1024)[0],
                             b"PLX-RUST-V1:\n" + nonce + (101).to_bytes(4, "big"))

    def test_graphics_missing_entry_point(self):
        if not hasattr(self.library, "plx_probe_gles"):
            self.skipTest("Build with --features gles for graphics resolver tests")
        resolver_type = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_char_p)
        resolver = resolver_type(lambda name: None)
        entry = self.library.plx_probe_gles
        entry.argtypes = [resolver_type]
        entry.restype = ctypes.c_int
        self.assertEqual(entry(resolver), 30)


if __name__ == "__main__":
    unittest.main()
