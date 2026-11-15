# Release process and validation

Repository: https://github.com/yulong-ge/zotero-citation-preview

The owner authorized public source and release publication. Development and acceptance run in an isolated Zotero profile so the owner's running reader is not interrupted.

## Release gate

1. Demonstrate a failing regression against the preceding implementation, then pass it with the new implementation.
2. Run the complete repository tests under NVM Node 24, syntax checks and `git diff --check`.
3. Exercise native citation opening, metadata, dismissal and cleanup in an isolated Zotero host.
4. Commit the reviewed source and require CI green for that exact commit.
5. Download the CI XPI artifact and verify its version, HTTPS update URL and exact four entries: `manifest.json`, `bootstrap.js`, `core.js`, `preview.js`.
6. Generate separate `updates.json` and `SHA256SUMS` assets from that final XPI. Never embed them in the XPI.
7. Publish the tagged release, download the assets over HTTPS and verify their hashes. Install the published XPI in an isolated profile and check its version and activation state.

Stable update endpoint: `https://github.com/yulong-ge/zotero-citation-preview/releases/latest/download/updates.json`.

## Version 0.1.11 evidence

- Failing-first tests: seven citations previously had no directly selectable numbered buttons; the real EditHF dotted-reference fixture failed with a missing-start error; failed named citations lacked the compact-card marker. All three regressions pass after the change.
- Full suite: `node --test test/*.test.cjs .local/native-pointer.test.cjs` passes 36/36 tests (35 public tests plus one local upstream-method test). Syntax checks and `git diff --check` pass.
- The original 21-page EditHF-1M PDF was copied read-only into a separate Zotero 10.0.9 profile. Trusted pointer events at its table citation `[24]` reproduce a native internal-link popup. The independent parser extracts `24. Kawar…`, resolves Imagic metadata and its abstract, and the popup closes on pointer exit.
- The same original PDF's seven-reference group was exercised with trusted clicks on all six remaining numbers. Every selection updates the original entry and selected state; six papers resolve titles. Reference 18 fails strict metadata matching and explicitly reports that failure. This is not counted as seven successful metadata lookups.
- Grouped references hide the expanded native bibliography and keep one content scroller. A separate test-only copy with a deliberately invalid named destination verifies a 420 × 225.2 px error card at a 1000 × 563 viewport, with the page image hidden and native dismissal intact.
- Addon disable removes its metadata and registered listener while preserving the native popup. Testing does not modify the personal profile or interrupt the owner's reader.

## Version 0.1.10 evidence

The owner reported that 0.1.9 suppressed native hover in three PDFs. Earlier callback-level tests did not cover the complete pointer-to-popup path.

- Failing-first regression: the old implementation fails `native hit testing must never be wrapped`. A test using methods extracted from the installed Zotero reader also fails `actual native hit method identity must survive start`.
- Real-host reproduction: in separate clean Zotero 10.0.9 profiles, Gecko-generated trusted pointer events at the same translated-PDF citation coordinate fail to open a popup with 0.1.9. With 0.1.10, native hit testing remains unchanged, the native popup opens and moving away closes it. No popup callback is injected.
- Full suite: `node --test test/*.test.cjs .local/native-pointer.test.cjs` passes 32/32 tests under NVM Node 24.19.0. The public repository has 31 tests; one additional local test extracts the installed upstream implementation without copying vendor source into this repository. `node --check preview.js` and `git diff --check` pass.
- Translated PDF: the verified DIAMOND citation resolves its title, seven authors and published abstract. The native page image is hidden. Only the source and target bibliography pages are read. Two metadata requests are made. The enhanced popup closes and stays closed.
- Structured references: a test-only English PDF copy containing the main text and references, with link annotations removed, exercises Zotero's own citation recognition. The original PDF is unchanged. A native three-reference popup displays its bibliography and a working metadata selector; DIAMOND resolves correctly with zero plugin PDF-page reads. Native opening and dismissal remain functional.
- Screenshot inspection exposed and verified fixes for image visibility, loading-to-result height changes, viewport clipping and duplicate scrollbars. Native popup classes and positioning functions are not rewritten.
- A production-XPI test opens a new reader after installation. It exposed a different DOM wrapper on reader events; the implementation normalizes that wrapper so existing and newly opened readers use the same observer path.
- A real-host structured-reference test exposed a compartment permission error. Its regression reproduces a content-array callback rejecting a privileged object; the implementation now constructs reference entries in its own compartment.

The host tests use a separate profile, empty database and loopback-only development ports. Each run stops only its own child process. They do not manipulate the owner's Zotero windows, restart the personal instance or change its settings. Physical-mouse interaction in the owner's active profile and exhaustive PDF/theme coverage are not claimed.

Machine-specific PDFs, screenshots, host logs and diagnostic scripts are retained under ignored `.local/`. Release notes record the final commit, CI run and published-asset verification.
