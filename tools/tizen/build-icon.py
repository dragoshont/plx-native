#!/usr/bin/env python3
"""Original neutral screen artwork, GPL-3.0-or-later; no borrowed brand assets."""
import argparse
from pathlib import Path
import struct
import zlib

TARGET = Path(__file__).resolve().parents[2] / "samsung/PlexTv/icon.png"


def icon():
    size = 117
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            color = (22, 29, 42, 255)
            if 17 <= x <= 99 and 23 <= y <= 83:
                color = (128, 218, 222, 255)
            if 23 <= x <= 93 and 29 <= y <= 77:
                color = (22, 29, 42, 255)
            if 46 <= x <= 70 and 90 <= y <= 95:
                color = (128, 218, 222, 255)
            if 34 <= x <= 82 and 41 <= y <= 47 or 34 <= x <= 65 and 58 <= y <= 64:
                color = (245, 247, 250, 255)
            rows.extend(color)

    def chunk(kind, data):
        return struct.pack("!I", len(data)) + kind + data + struct.pack("!I", zlib.crc32(kind + data))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack("!IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    data = icon()
    if args.write:
        TARGET.write_bytes(data)
    elif not TARGET.is_file() or TARGET.read_bytes() != data:
        parser.exit(1, "Icon is stale; run python3 tools/tizen/build-icon.py --write\n")
