"""Build and verify the four-file Zotero addon; release assets stay separate."""

import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
names = ("manifest.json", "bootstrap.js", "core.js", "preview.js")
manifest = json.loads((root / "manifest.json").read_text())
if manifest["applications"]["zotero"]["id"] != "citation-preview@local":
    raise ValueError("Unexpected Zotero addon ID")
if (
    manifest["applications"]["zotero"]["update_url"]
    != "https://github.com/yulong-ge/zotero-citation-preview/releases/latest/download/updates.json"
):
    raise ValueError("Unexpected addon update URL")
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
