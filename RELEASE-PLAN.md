# Release process

Repository: https://github.com/yulong-ge/zotero-citation-preview

The owner authorized public source and release publication. Version 0.1.9 adds automatic dismissal of hover cards. Installation is not complete until Zotero reports the published extension active and its reading interactions have been checked.

## Release gate

1. Verify the hover regression fails with the preceding implementation, then passes with the fix.
2. Run `node --test test/*.test.cjs` under NVM Node 24 and inspect the full results.
3. Commit the reviewed source and require CI green for that exact commit.
4. Download that run's XPI artifact and verify its version, HTTPS update URL and exact four entries: `manifest.json`, `bootstrap.js`, `core.js`, `preview.js`.
5. Hash the final XPI. Generate a separate `updates.json` with the addon ID, version, versioned release download URL, `sha256:` hash and `applications.zotero` compatibility. Generate `SHA256SUMS` last. Never embed the update manifest or checksums in the XPI.
6. Publish the tagged release, then download and verify both assets over HTTPS.
7. Install the published XPI and check version, `isActive=true`, `appDisabled=false`, citation content, dismissal and cleanup in Zotero.

Stable update endpoint: `https://github.com/yulong-ge/zotero-citation-preview/releases/latest/download/updates.json`.

## Previous acceptance evidence

- Version 0.1.8: 13 tests passed under Node 24.19.0, including strict citation identity, book-versus-journal rejection, PDF worker realm boundaries and native HTTP cancellation.
- Zotero 10.0.9: English references and a translated Chinese PDF displayed matching paper titles, authors and abstracts. Native keyboard activation of DIAMOND displayed all seven authors and its full published abstract. The incorrect Sutton book/journal match was rejected.
- Version 0.1.7: two 15-second samples with the same page-down/page-up interaction produced enabled mean/p95/max timer delay 6.693/6.872/293.6 ms versus stopped 6.293/6.775/262.7 ms. Scrolling did not create metadata requests; a real cache hit was observed. This is a short comparison, not a long-term performance guarantee.
- The owner subsequently confirmed mouse-hover opening works and reported that leaving the citation did not dismiss the card. Version 0.1.9 addresses that specific remaining interaction defect.

Machine-specific logs, PDFs and historical reports are retained under ignored `.local/`, not published. Current validation should be recorded against the released commit; prior-version checks do not establish that a new release has passed.
