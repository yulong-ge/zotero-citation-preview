# Native Zotero GUI tests

GitHub Actions runs the production XPI in **Zotero 10.0.8 on Ubuntu 24.04**, with a new profile and data directory for each case. The process is headless under Xvfb. It never opens a user's desktop or copies a personal profile.

`make_fixture.py` generates a two-page PDF with named citation links `[2]` and `[44]`. The test uses Zotero's PDF processing, trusted mouse events, native popup, and the production plugin. Only public metadata HTTP responses are replaced by a deterministic test record inside the isolated test extension. This tests UI integration, not live Crossref/arXiv availability.

Assertions cover correct reference/title, compact native-image replacement, pointer exit dismissal, no late reappearance, and listener cleanup. Screenshots capture the enhanced native popup. This baseline does **not** claim to reproduce the PDF or transient positioning defect in Issue #1. A fix must add its own effective regression check.

## Run in Linux Cloud

Install `libgtk-3-0t64 libdbus-glib-1-2 libasound2t64 xvfb xauth fonts-noto-cjk`, `curl`, `xz-utils`, `zip`, and `uv`. The setup script requires Linux x86_64. Use a directory that does not already contain test results:

```bash
scripts/setup-cloud-zotero.sh /tmp/citation-preview-zotero
mkdir -p .local/cloud-gui
zip -q .local/cloud-gui/citation-preview.xpi manifest.json bootstrap.js core.js preview.js
uv run --python 3.12 --with reportlab==4.4.5 --with pikepdf==9.11.0 python test/host/make_fixture.py .local/cloud-gui/fixture.pdf
xvfb-run -a uv run --python 3.12 python test/host/run.py \
  --zotero /tmp/citation-preview-zotero/Zotero_linux-x86_64/zotero \
  --xpi .local/cloud-gui/citation-preview.xpi \
  --pdf .local/cloud-gui/fixture.pdf \
  --destination cite.fixture44 \
  --output .local/cloud-gui/reference-44
```

Ports 23129 (test status) and 23130 (local debugger) must be free; run cases sequentially. The runner stops its own process group, rejects occupied test ports, and checks a unique run ID and destination on each status response. Failed runs return a nonzero exit status and upload logs and a screenshot when a reader window exists. Profiles and data directories are excluded from uploaded artifacts.
