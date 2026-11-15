# Citation Preview for Zotero 10

Local, reversible plugin. Does not change TeXlate, PDF files, annotations or library records.

Current status: version 0.1.9 is ready for release verification. Its manifest points to the repository’s HTTPS release update asset. That asset must exist and the published XPI must be installed and tested before formal installation is considered complete; ZIP validation alone is insufficient.

Hover over an in-text citation after Zotero resolves it. The native hover delay triggers a card containing the raw bibliography entry, verified paper title, authors, abstract and source. Native keyboard navigation follows the same popup path: focus the PDF, use Tab and arrow keys to select a citation, then press Space. This keyboard path has been tested in Zotero; direct mouse hover has not been verified with the current automation tools. The **引用摘要** toolbar button provides a compact selector for references cited on currently visible PDF pages. The full original bibliography entry is available below the abstract in a disclosure. Hover cards close about 350 ms after the pointer leaves the reference and card. Returning to the same reference before the deadline or entering the card cancels that close; leaving the card starts a new close delay. Mouse clicks inside a hover card do not keep it open after the pointer leaves. Cards opened by keyboard or the toolbar stay open; keyboard interaction inside a hover card also keeps it open for accessibility. Escape or **关闭** dismisses the card and cancels pending work.

## Resolution and privacy

Only an explicitly opened citation is sent to metadata services. arXiv identifiers use the arXiv API directly. DOI identifiers use Crossref directly. References without identifiers use Crossref bibliographic search, requiring ≥90% title-token coverage, matching author surname, and a publication year within one year. Missing years and titles under three significant tokens are rejected. Multiple matching DOI records are rejected. Explicit book publisher/ISBN evidence must agree with the candidate book type and publisher; a same-title journal record is rejected. Conference venue evidence prevents treating an article as a book just because its publisher contains Press. Crossref's abstract is used when present; otherwise the DOI is queried at OpenAlex for its published abstract. Source links and the original reference remain visible. Missing abstracts, lookup errors and ambiguous matches are stated explicitly. Abstracts are never generated.

Both original and TeXlate PDFs use the same native reference mapping. If native citation recognition fails, an explicit `cite.*` PDF named destination can identify a reference. Only a deliberate hover/keyboard activation or toolbar choice reads that source page and its target bibliography page. Source and target reference numbers must agree; the next consecutive numbered item is the end boundary. Ambiguous, cross-page or incomplete boundaries are rejected. Ordinary section/figure links retain native behavior and issue no metadata requests. The plugin does not reconstruct broken links or guess translated titles.

## Performance

No scrolling or pointer-move listeners. Hover dismissal wraps the native popup delayer and uses pointer-leave events; it does not wait for the reader to send a null popup. Late native preview, PDF parsing and network results cannot reopen a dismissed hover card. No OCR, prefetch, periodic scans or background indexing. Named-citation handling reads at most the explicitly selected source and target page through the existing PDF worker; page data is cached with an eight-page bound. The plugin consumes Zotero's already-resolved `citation.references` only after native hover delay. Toolbar access visits visible pages only. One active metadata request per reader; superseded and dismissed requests are aborted. Responses are cached in memory, bounded to 128 entries. Requests use privileged `Zotero.HTTP.request` with its native cancellation callback, anonymous mode and a 12-second timeout. They do not use the reader window's cross-origin fetch. The overall lookup also times out after 12 seconds. Reader unload and addon disable restore original callbacks and remove UI/listeners.

`Zotero.CitationPreview.metrics` records request/cache counts and synchronous hook time. `maxShowMs` and `totalShowMs` separately record card construction/DOM insertion time (not browser paint). `await Zotero.CitationPreview.measureResponsiveness({durationMs:5000,intervalMs:50})` explicitly measures event loop timer delay for acceptance; it starts no timer until invoked. Browser painting still requires visual acceptance. Real Zotero scrolling/selection and hover checks remain an installation acceptance gate. Disable the addon if reading is affected.

## Build and verify

```sh
source "$HOME/.nvm/nvm.sh"
nvm use default
node --test test/*.test.cjs
build_dir="$(mktemp -d)"
zip -q "$build_dir/citation-preview-0.1.9.xpi" manifest.json bootstrap.js core.js preview.js
mv "$build_dir/citation-preview-0.1.9.xpi" .
rmdir "$build_dir"
```

The XPI contains exactly four files. `updates.json` is a separate release asset, generated only after the final XPI exists so it can record that XPI’s hash. It is never embedded in the XPI. The temporary build directory ensures older ZIP entries cannot survive a rebuild.

Install from Add-ons → gear → Install Add-on From File. Disable/remove from Add-ons to undo. No restart is required. The update URL is `https://github.com/yulong-ge/zotero-citation-preview/releases/latest/download/updates.json`. Release assets are separate from the four-file XPI.

## API evidence

The installed Zotero 10.0.9 `resource/reader/reader.js` exposes `_primaryView._onSetOverlayPopup`, `citation.references[].chars`, `_pdfPages[].overlays` and `_getVisiblePages()`. These private APIs are version-sensitive. Unsupported shapes are reported instead of triggering another parser.

- https://github.com/zotero/reader/blob/master/src/pdf/pdf-view.js
- https://github.com/zotero/reader/blob/master/src/common/components/view-popup/overlay-popup/reference/reference-popup.js
- https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/reader.js
- https://info.arxiv.org/help/api/user-manual.html
- https://www.crossref.org/documentation/retrieve-metadata/rest-api/
- https://docs.openalex.org/api-entities/works/work-object
