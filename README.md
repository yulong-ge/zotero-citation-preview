# Citation Preview for Zotero 10

Adds verified paper metadata and abstracts **inside Zotero's native citation popovers**. Hover over a citation, or open it with Zotero's keyboard navigation. Zotero controls positioning, opening and dismissal. The plugin adds no toolbar button and creates no separate floating card.

Grouped citations show every reference number as a directly selectable button. Selecting a number loads that paper’s title, authors and abstract; the current original entry is available in a collapsed disclosure. The buttons remain visible above one scrolling content area. Single structured references retain the native bibliography above the metadata. For explicit `cite.*` PDF links, a compact card replaces the page image while the plugin checks the source number against the destination entry. Parsing failures remain in this compact card. Figure and section previews keep their native behavior. Closing a popover cancels its pending work; late responses cannot reopen it.

## Resolution and privacy

Only a citation opened by the reader is sent to metadata services. arXiv identifiers use the arXiv API. DOI identifiers use Crossref. References without identifiers use Crossref bibliographic search, requiring at least 90% title-token coverage, a matching author surname and a publication year within one year. Missing years, short titles and ambiguous matches are rejected. Publisher and publication-type evidence must also agree. Crossref's abstract is used when available; otherwise the DOI is queried at OpenAlex. Abstracts are never generated.

The original bibliography entry and source link remain available. Missing abstracts and lookup failures are shown explicitly. Some correctly identified references have no matching record in these services; the plugin reports that instead of showing an unrelated paper.

For PDF named destinations, source and target reference numbers must agree. The independent destination parser accepts both `[24]` and `24.` bibliography numbering. The next consecutive numbered reference supplies the end boundary. Ambiguous, cross-page and incomplete boundaries are rejected. The plugin does not reconstruct broken links or guess translated titles. PDF files, annotations and library records are not modified.

## Implementation and performance

A `MutationObserver` watches the reader document for native popovers. The plugin reads native popup state, then appends its metadata section. It does not replace native pointer handlers, hit-testing methods, popup callbacks, delay timers or selected-overlay state.

There are no pointer-move listeners, periodic scans, OCR, prefetch or background indexing. Named-citation handling reads the selected source and bibliography pages through Zotero's PDF worker. Page data has an eight-page cache per document; metadata has a 128-entry memory cache. Each open native popover has one cancellable request. Requests use privileged `Zotero.HTTP.request`, anonymous mode and a 12-second timeout. Reader unload and addon disable remove the enhancement and observer.

`Zotero.CitationPreview.metrics` records requests, cache hits, page reads, DOM construction and observer time. `await Zotero.CitationPreview.measureResponsiveness({durationMs:5000,intervalMs:50})` measures event-loop timer delay when explicitly invoked. These metrics do not measure browser paint.

## Build and install

```sh
source "$HOME/.nvm/nvm.sh"
nvm use default
node --test test/*.test.cjs
build_dir="$(mktemp -d)"
zip -q "$build_dir/citation-preview-0.1.11.xpi" manifest.json bootstrap.js core.js preview.js
mv "$build_dir/citation-preview-0.1.11.xpi" .
rmdir "$build_dir"
```

The XPI contains exactly four files. `updates.json` and `SHA256SUMS` are separate release assets. Install the XPI through Add-ons → gear → Install Add-on From File. Disable or remove it through Add-ons to undo. No restart is required.

Update endpoint: `https://github.com/yulong-ge/zotero-citation-preview/releases/latest/download/updates.json`.

## Compatibility and verification

The implementation targets Zotero 10 and was tested against Zotero 10.0.9. It uses private reader state (`primaryViewOverlayPopup` / `secondaryViewOverlayPopup`), native popup DOM classes and PDF-worker methods. Zotero updates can change these interfaces.

Automated tests cover native-method preservation, popup removal, cancellation, late responses, strict reference matching and PDF-worker compartment boundaries. Additional local tests exercise methods extracted from the installed native reader. An isolated headless Zotero profile is used for real-host tests with Gecko-generated trusted pointer events; this does not substitute for every desktop theme, PDF or physical mouse interaction. See [release validation](RELEASE-PLAN.md).

## Upstream references

- [Zotero PDF reader](https://github.com/zotero/reader/blob/master/src/pdf/pdf-view.js)
- [Native reference popup](https://github.com/zotero/reader/blob/master/src/common/components/view-popup/overlay-popup/reference/reference-popup.js)
- [Zotero reader integration](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/reader.js)
- [arXiv API](https://info.arxiv.org/help/api/user-manual.html)
- [Crossref API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)
- [OpenAlex work data](https://docs.openalex.org/api-entities/works/work-object)
