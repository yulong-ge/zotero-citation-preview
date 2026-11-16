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

## Transient placement regression

The runner defaults to a real Zotero Gecko headless process. It does not establish visible-desktop rendering. The host samples native popup geometry after rendering frames and records opening, loading, terminal content and trusted pointer entry. Anchor-relative assertions run on every enhanced sample, including those before the terminal content appears. Pointer entry uses the popup-owning window and verifies elementFromPoint containment and a trusted event.

Use `--case metadata-failure` for delayed empty metadata results. Generate a parser-error PDF with `make_fixture.py OUTPUT parser-failure`, then use `--case parser-failure`. Neither error case requires an h2. `--case multiple` supplies explicit grouped reference data through Zotero's native popup callback after trusted PDF hover, then selects the second reference. This grouped input is a test fixture, not a claim that the generated PDF naturally produces grouped references. Every run needs a fresh output directory.

Named citation cards reserve their height, so delayed metadata success/failure may change content without changing outer dimensions. Recorded geometry must be inspected before claiming asynchronous size-change coverage. The reporter's original PDF remains unavailable.

Success and metadata-failure cases explicitly perturb the native host width from 420 to 360 pixels after a delay, before returning metadata. This isolates asynchronous layout handling; the width perturbation is test input and is not attributed to the original PDF. The host records both measured widths. A session-scoped ResizeObserver handles such layout changes and disconnects at session teardown.
