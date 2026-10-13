"""Stage a bounded, account-free benchmark from the exact public 0.2.7 WGT."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
import struct
import xml.etree.ElementTree as ET
import zipfile
import zlib

EXPECTED = "98de8a0990a443aa0912b00596686d84fe4297ba7dcee5bc4d8f2d9ad76c5944"
parser = argparse.ArgumentParser()
parser.add_argument("package", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
assert hashlib.sha256(args.package.read_bytes()).hexdigest() == EXPECTED, "Not the published 0.2.7 archive"
args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
template = Path(__file__).parent
hashes = {}
with zipfile.ZipFile(args.package) as archive:
    for name in archive.namelist():
        if name.endswith("/") or name in ("author-signature.xml", "signature1.xml", "config.xml", "index.html"):
            continue
        path = Path(name)
        assert not path.is_absolute() and ".." not in path.parts
        data = archive.read(name)
        destination = args.output / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        hashes[name] = hashlib.sha256(data).hexdigest()
    html = archive.read("index.html").decode()
    html = html.replace('<script src="$WEBAPIS/webapis/webapis.js"></script>', "")
    html = html.replace('<script src="js/plex-api.js">', '<script src="bootstrap.js"></script>\n    <script src="js/plex-api.js">')
    html = html.replace('<script src="main.js">', '<script src="artwork.js"></script>\n    <script src="adapters.js"></script>\n    <script src="main.js">')
    html = html.replace("</body>", '<script src="workload.js"></script>\n</body>')
    (args.output / "index.html").write_text(html)
    manifest = ET.fromstring(archive.read("config.xml"))
    manifest.set("id", "https://example.invalid/PlxGraphicsBenchmark")
    manifest.set("version", "1.0.0")
    app = manifest.find("{http://tizen.org/ns/widgets}application")
    app.set("id", "PlxBench01.Probe")
    app.set("package", "PlxBench01")
    manifest.find("{http://www.w3.org/ns/widgets}name").text = "PlxGraphicsBenchmark"
    for child in list(manifest):
        if child.tag.endswith(("access", "privilege", "metadata")):
            manifest.remove(child)
    ET.register_namespace("", "http://www.w3.org/ns/widgets")
    ET.register_namespace("tizen", "http://tizen.org/ns/widgets")
    ET.ElementTree(manifest).write(args.output / "config.xml", encoding="utf-8", xml_declaration=True)
for name in ("bootstrap.js", "adapters.js", "workload.js"):
    shutil.copyfile(template / name, args.output / name)

def chunk(kind, data):
    return struct.pack("!I", len(data)) + kind + data + struct.pack("!I", zlib.crc32(kind + data) & 0xffffffff)

art = []
def png_image(width, height, offset):
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        for x in range(width):
            rows.extend(((x // 5 + offset * 30) % 256, (y // 3 + offset * 20) % 256, 120 + offset * 10, 255))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b"")
    return base64.b64encode(png).decode()
for offset in range(4):
    art.append(png_image(1280, 720, offset))
(args.output / "artwork.js").write_text("window.graphicsBenchmarkArtwork=" + json.dumps(art) + ";" +
    "window.graphicsBenchmarkCardArtwork=" + json.dumps(png_image(480, 270, 0)) + ";")
provenance = {"public_package_sha256": EXPECTED, "public_source_sha": "6527197599d042bd52990222aa02cbbfc110ce05",
              "unchanged_product_files": hashes, "probe_app": "PlxBench01.Probe",
              "synthetic_images": 4, "image_dimensions": [1280, 720]}
(args.output.parent / (args.output.name + "-provenance.json")).write_text(json.dumps(provenance, indent=2))
print("Staged exact published product files, inert adapters, original 1280x720 artwork:", args.output)
