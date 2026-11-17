# Release process and validation

Repository: [zotero-citation-preview](https://github.com/yulong-ge/zotero-citation-preview)

Development and acceptance run in an isolated Zotero profile so the owner's running reader is not interrupted.

## Release gate

1. Demonstrate a failing regression against the preceding implementation, then pass it with the new implementation.
2. Run the complete repository tests under NVM Node 24, syntax checks and `git diff --check`.
3. Exercise native citation opening, metadata, dismissal and cleanup in an isolated Zotero host.
4. Commit the reviewed source and require CI green for that exact commit.
5. Download the CI XPI artifact and verify its version, HTTPS update URL and exact seven entries: `manifest.json`, `bootstrap.js`, `core.js`, `preview.js`, and the three PNGs declared by the manifest.
6. Generate separate `updates.json` and `SHA256SUMS` assets from that final XPI. Never embed them in the XPI.
7. Publish the tagged release, download the assets over HTTPS and verify their hashes. Install the published XPI in an isolated profile and check its version and activation state.

Stable update endpoint: `https://github.com/yulong-ge/zotero-citation-preview/releases/latest/download/updates.json`.

Published installers, update manifests and checksums belong to GitHub Releases. Downloaded copies belong in `~/Downloads/zotero-citation-preview/`, not in the source tree. Local builds use ignored `dist/`. Publishing is manual and requires task authorization; CI does not publish.

Previous verification results are in [validation](validation.md).
