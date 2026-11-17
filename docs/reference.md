# Reader behavior and metadata resolution

Adds verified paper metadata and abstracts **inside Zotero's native citation popovers**. Hover over a citation, or open it with Zotero's keyboard navigation. Zotero controls positioning, opening and dismissal. The plugin adds no toolbar button and creates no separate floating card.

Grouped citations show every reference number as a directly selectable button. Opening a group preloads its other references with one background lookup alongside the selected paper. Selecting a number reuses cached or in-flight metadata; a still-queued selection takes foreground priority. A failed background lookup marks its number with an error indicator and exposes the message on selection. The current paper remains visible while other references load; the current original entry is available in a collapsed disclosure. The buttons remain visible above one scrolling content area. Single structured references retain the native bibliography above the metadata. For explicit `cite.*` PDF links, a compact card replaces the page image while the plugin checks the source number against the destination entry. Parsing failures remain in this compact card. Figure and section previews keep their native behavior. Closing a popover cancels its pending work; late responses cannot reopen it.

## Resolution and privacy

Only references in a citation popover opened by the reader are sent to metadata services, including unselected entries in an opened group. The plugin does not scan or prefetch the entire PDF. arXiv identifiers use the arXiv API. DOI identifiers use Crossref. References without identifiers use Crossref bibliographic search. If that search succeeds but contains no verified match, the plugin searches arXiv using up to 64 unique bibliography terms and examines up to five results. Transport errors and ambiguous Crossref matches stop the lookup; they do not trigger another service.

Bibliographic matches require at least 90% title-token coverage, a matching author surname and a publication year within one year. The destination parser joins words where Zotero marks a line-end dash as ignorable; ordinary lines retain their word separator. Explicit line-end hyphenation in reference text is checked in both separated and joined forms. Missing years, short titles and ambiguous matches are rejected. Publisher and publication-type evidence must also agree. arXiv search results must pass the same checks and have a valid arXiv identifier. Crossref's abstract is used when available; otherwise the DOI is queried at OpenAlex. arXiv matches use the returned summary. Abstracts are never generated.

The original bibliography entry and source link remain available. Missing abstracts and lookup failures are shown explicitly. Some correctly identified references have no matching record in these services; the plugin reports that instead of showing an unrelated paper.

For PDF named destinations, source and target reference numbers must agree. The independent destination parser accepts both `[24]` and `24.` bibliography numbering. The next consecutive numbered reference supplies the end boundary. Ambiguous, cross-page and incomplete boundaries are rejected. The plugin does not reconstruct broken links or guess translated titles. PDF files, annotations and library records are not modified.

## Compatibility and verification

The implementation targets Zotero 10 and was tested against Zotero 10.0.9. It uses private reader state (`primaryViewOverlayPopup` / `secondaryViewOverlayPopup`), native popup DOM classes and PDF-worker methods. Zotero updates can change these interfaces.

Automated tests cover native-method preservation, popup removal, cancellation, late responses, strict reference matching and PDF-worker compartment boundaries. Additional local tests exercise methods extracted from the installed native reader. An isolated headless Zotero profile is used for real-host tests with Gecko-generated trusted pointer events; this does not substitute for every desktop theme, PDF or physical mouse interaction. See [release validation](validation.md).

## Upstream references

- [Zotero PDF reader](https://github.com/zotero/reader/blob/master/src/pdf/pdf-view.js)
- [Native reference popup](https://github.com/zotero/reader/blob/master/src/common/components/view-popup/overlay-popup/reference/reference-popup.js)
- [Zotero reader integration](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/reader.js)
- [arXiv API](https://info.arxiv.org/help/api/user-manual.html)
- [Crossref API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)
- [OpenAlex work data](https://docs.openalex.org/api-entities/works/work-object)
