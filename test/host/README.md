# Native Zotero GUI tests

GitHub Actions runs the production XPI in **Zotero 10.0.8 on Ubuntu 24.04**, with a new profile and data directory for each case. The process is headless under Xvfb. It never opens a user's desktop or copies a personal profile.

`make_fixture.py` generates a two-page PDF with named citation links `[2]` and `[44]`. The test uses Zotero's PDF processing, trusted mouse events, native popup, and the production plugin. Only public metadata HTTP responses are replaced by a deterministic test record inside the isolated test extension. This tests UI integration, not live Crossref/arXiv availability.

Assertions cover correct reference/title, compact native-image replacement, pointer exit dismissal, no late reappearance, and listener cleanup. Screenshots capture the enhanced native popup. This baseline does **not** claim to reproduce the PDF or transient positioning defect in Issue #1. A fix must add its own effective regression check.

The `issue-1` case opens citation `cite.sohl2015deep` in the public Kalman-Edit conference PDF, pinned by SHA256 in the GUI workflow. It verifies the extracted bibliography and resolves reference 44 to arXiv `1503.03585`. Crossref returns an explicit empty test result; `addon/issue-1-arxiv.xml` supplies public identity fields with a synthetic summary. This is separate from the generated PDF cases. The paper is downloaded from its publisher and is not committed or included in the evidence artifact.

For live-service verification, manually dispatch the `Zotero GUI` workflow with `live_metadata=true`. This adds the `issue-1-live` case using actual Crossref and arXiv responses. Network failures remain test failures. The live check is optional so provider availability does not determine routine PR checks. Both cases retain trusted-pointer, placement, dismissal and cleanup assertions. Neither establishes macOS visual parity or equivalence to a different local revision of the paper.

## Run in Linux Cloud

Install `libgtk-3-0t64 libdbus-glib-1-2 libasound2t64 xvfb xauth fonts-noto-cjk`, `curl`, `xz-utils`, `zip`, and `uv`. The setup script requires Linux x86_64. Use a directory that does not already contain test results:

```bash
scripts/setup-cloud-zotero.sh /tmp/citation-preview-zotero
mkdir -p .local/cloud-gui
uv sync --locked
archive="$(uv run python scripts/build.py)"
cp "$archive" .local/cloud-gui/citation-preview.xpi
uv run --locked python test/host/make_fixture.py .local/cloud-gui/fixture.pdf
xvfb-run -a uv run --locked python test/host/run.py \
  --zotero /tmp/citation-preview-zotero/Zotero_linux-x86_64/zotero \
  --xpi .local/cloud-gui/citation-preview.xpi \
  --pdf .local/cloud-gui/fixture.pdf \
  --destination cite.fixture44 \
  --output .local/cloud-gui/reference-44
```

Ports 23129 (test status) and 23130 (local debugger) must be free; run cases sequentially. The runner stops its own process group, rejects occupied test ports, and checks a unique run ID and destination on each status response. Failed runs return a nonzero exit status and upload logs and a screenshot when a reader window exists. Profiles and data directories are excluded from uploaded artifacts.

## Transient placement regression

The runner defaults to a real Zotero Gecko headless process. It does not establish visible-desktop rendering. The host samples native popup geometry after rendering frames and records opening, loading, terminal content and trusted pointer entry. Anchor-relative assertions run on every enhanced sample, including those before the terminal content appears. Pointer entry uses the popup-owning window and verifies elementFromPoint containment and a trusted event.

Use `--case metadata-failure` for delayed empty metadata results. Generate a parser-error PDF with `make_fixture.py OUTPUT parser-failure`, then use `--case parser-failure`. Neither error case requires an h2. `--case multiple` supplies explicit grouped reference data before the first trusted PDF hover callback is forwarded to Zotero, waits for all three references to preload, then selects the second reference without another request. This grouped input is a test fixture, not a claim that the generated PDF naturally produces grouped references. Every run needs a fresh output directory.

Named citation cards reserve their height, so delayed metadata success/failure may change content without changing outer dimensions. Recorded geometry must be inspected before claiming asynchronous size-change coverage. The reporter's original PDF remains unavailable.

Success and metadata-failure cases explicitly perturb the native host width from 420 to 360 pixels after a delay, before returning metadata. This isolates asynchronous layout handling; the width perturbation is test input and is not attributed to the original PDF. The host records both measured widths. A session-scoped ResizeObserver handles such layout changes and disconnects at session teardown.

The grouped fixture wraps only the test view callback and restores it at teardown. Request traces record popup type and cancellation/completion times. Grouped input must precede all metadata requests; exactly three citation requests and no preflight internal-link request are required. The second request must start before the selected request completes. Every choice must reach its ready state before the simulated click; the report records the warm switch time.
