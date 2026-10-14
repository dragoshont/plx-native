#!/usr/bin/env python3
"""Rasterize the original Vemm vector mark without external dependencies."""
import argparse
import math
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zlib

ROOT = Path(__file__).resolve().parents[2]
SOURCE_MARK = ROOT / "samsung/brand/vemm-mark.svg"
SOURCE_ICON = ROOT / "samsung/brand/vemm-app-icon.svg"
APP_MARK = ROOT / "samsung/Vemm/brand/vemm-mark.svg"
TARGET = ROOT / "samsung/Vemm/icon.png"


def color(value):
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4)) + (255,)


def inside_polygon(x, y, points):
    inside = False
    previous = points[-1]
    for current in points:
        if (current[1] > y) != (previous[1] > y):
            crossing = (previous[0] - current[0]) * (y - current[1]) / (previous[1] - current[1]) + current[0]
            if x < crossing:
                inside = not inside
        previous = current
    return inside


def inside_rounded_rect(x, y, geometry):
    sx, sy, width, height, radius = geometry
    if x < sx or x >= sx + width or y < sy or y >= sy + height:
        return False
    if radius <= 0 or sx + radius <= x < sx + width - radius or sy + radius <= y < sy + height - radius:
        return True
    cx = sx + radius if x < sx + radius else sx + width - radius
    cy = sy + radius if y < sy + radius else sy + height - radius
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def inside_capsule(x, y, geometry):
    x1, y1, x2, y2, width = geometry
    dx, dy = x2 - x1, y2 - y1
    length = dx * dx + dy * dy
    projection = 0 if not length else max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / length))
    nearest_x, nearest_y = x1 + projection * dx, y1 + projection * dy
    return math.hypot(x - nearest_x, y - nearest_y) <= width / 2


def icon():
    size = 117
    root = ET.parse(SOURCE_ICON).getroot()
    shapes = []
    for node in list(root):
        name = node.tag.rsplit("}", 1)[-1]
        if name == "rect":
            geometry = tuple(float(node.get(key, "0")) for key in ("x", "y", "width", "height"))
            shapes.append(("rect", geometry + (float(node.get("rx", "0")),),
                           color(node.get("fill"))))
        elif name == "circle":
            shapes.append(("circle", tuple(float(node.get(key)) for key in ("cx", "cy", "r")),
                           color(node.get("fill"))))
        elif name == "polygon":
            points = [tuple(float(value) for value in point.split(","))
                      for point in node.get("points", "").split()]
            shapes.append(("polygon", points, color(node.get("fill"))))
        elif name == "line":
            geometry = tuple(float(node.get(key)) for key in ("x1", "y1", "x2", "y2"))
            shapes.append(("line", geometry + (float(node.get("stroke-width")),),
                           color(node.get("stroke"))))

    def sample(x, y):
        result = (0, 0, 0, 0)
        for kind, geometry, fill in shapes:
            if kind == "rect":
                hit = inside_rounded_rect(x, y, geometry)
            elif kind == "circle":
                cx, cy, radius = geometry
                hit = (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2
            elif kind == "line":
                hit = inside_capsule(x, y, geometry)
            else:
                hit = inside_polygon(x, y, geometry)
            if hit:
                result = fill
        return result

    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            samples = [sample(x + ox, y + oy) for oy in (0.125, 0.375, 0.625, 0.875)
                       for ox in (0.125, 0.375, 0.625, 0.875)]
            rows.extend(tuple(sum(pixel[channel] for pixel in samples) // len(samples) for channel in range(4)))

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
        APP_MARK.parent.mkdir(parents=True, exist_ok=True)
        APP_MARK.write_bytes(SOURCE_MARK.read_bytes())
        TARGET.write_bytes(data)
    elif not APP_MARK.is_file() or APP_MARK.read_bytes() != SOURCE_MARK.read_bytes() or \
            not TARGET.is_file() or TARGET.read_bytes() != data:
        parser.exit(1, "Vemm assets are stale; run python3 tools/tizen/build-icon.py --write\n")
