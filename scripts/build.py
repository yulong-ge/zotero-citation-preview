"""Build and verify the Zotero addon and its icons; release assets stay separate."""

import json
import re
import struct
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / "manifest.json").read_text())
if manifest["manifest_version"] != 2:
    raise ValueError("Expected manifest_version 2")
if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", manifest["version"]):
    raise ValueError("Expected a three-part numeric addon version")
if manifest["applications"]["zotero"]["id"] != "citation-preview@local":
    raise ValueError("Unexpected Zotero addon ID")
if (
    manifest["applications"]["zotero"]["update_url"]
    != "https://github.com/yulong-ge/zotero-citation-preview/releases/latest/download/updates.json"
):
    raise ValueError("Unexpected addon update URL")
icons = {str(size): f"icons/icon-{size}.png" for size in (32, 64, 128)}
if manifest.get("icons") != icons:
    raise ValueError("Expected bundled 32, 64 and 128 pixel addon icons")
for size, name in icons.items():
    image = (root / name).read_bytes()
    if (
        len(image) < 24
        or image[:16] != b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
        or struct.unpack(">II", image[16:24]) != (int(size), int(size))
    ):
        raise ValueError(f"Invalid {size} pixel PNG icon: {name}")
names = ("manifest.json", "bootstrap.js", "core.js", "preview.js", *icons.values())
out = root / "dist" / f"citation-preview-{manifest['version']}.xpi"
out.parent.mkdir(exist_ok=True)
temporary = out.with_suffix(".tmp")
with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, (root / name).read_bytes())
with zipfile.ZipFile(temporary) as archive:
    if archive.testzip() is not None or tuple(archive.namelist()) != names:
        raise ValueError("Invalid addon archive contents")
    if json.loads(archive.read("manifest.json")) != manifest:
        raise ValueError("Packaged manifest differs from source")
temporary.replace(out)
print(out)
