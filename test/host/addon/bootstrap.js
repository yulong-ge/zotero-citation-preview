var status = {stage: 'starting', metadataSource: 'deterministic test fixture'};
var screenshot;
var reader;
var originalRequest;
function assert(condition, message) { if (!condition) throw new Error(message); }
async function waitFor(check, message, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(message);
    await Zotero.Promise.delay(50);
  }
}
function capture() {
  if (!reader) return;
  const win = Components.utils.unwaiveXrays(reader._iframeWindow);
  const canvas = win.document.createElement('canvas');
  canvas.width = win.innerWidth; canvas.height = win.innerHeight;
  canvas.getContext('2d').drawWindow(win, 0, 0, win.innerWidth, win.innerHeight, 'white');
  screenshot = canvas.toDataURL('image/png').split(',')[1];
  status.hasScreenshot = true;
}
async function startup() {
  await Zotero.initializationPromise;
  status.runID = Services.env.get('HOST_CASE_RUN_ID');
  status.destination = Services.env.get('HOST_CASE_DEST');
  Zotero.Server.Endpoints['/citation-preview-host/status'] = class {
    constructor() { this.supportedMethods = ['GET']; }
    async init(request) { return [200, 'application/json', JSON.stringify(status)]; }
  };
  Zotero.Server.Endpoints['/citation-preview-host/screenshot'] = class {
    constructor() { this.supportedMethods = ['GET']; }
    async init(request) { return [200, 'text/plain', screenshot]; }
  };
  run().catch(error => {
    status.error = {message: String(error), stack: error.stack};
    try { capture(); } catch (captureError) { status.captureError = String(captureError); }
    status.stage = 'failed'; Zotero.logError(error);
  });
}
async function run() {
  await Zotero.uiReadyPromise;
  const controller = Zotero.CitationPreview;
  assert(controller, 'Production addon was not loaded');
  const {AddonManager} = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const addon = await AddonManager.getAddonByID('citation-preview@local');
  assert(addon?.isActive, 'Production addon is not active');
  status.installation = {version: addon.version, active: addon.isActive};
  // Only metadata is deterministic; PDF processing, hit testing and popup UI use the installed Zotero.
  originalRequest = Zotero.HTTP.request;
  Zotero.HTTP.request = async function(method, url, options) {
    if (!/^https:\/\/(api\.crossref\.org|api\.openalex\.org|export\.arxiv\.org)\//.test(url))
      return originalRequest.call(this, method, url, options);
    assert(url.startsWith('https://api.crossref.org/works?'), 'Unexpected metadata request: ' + url);
    const raw = decodeURIComponent(url.split('query.bibliographic=')[1].split('&')[0]);
    const number = raw.match(/study (2|44)\b/)?.[1];
    assert(number, 'Metadata request did not contain a fixture reference: ' + raw);
    status.metadataRequests = (status.metadataRequests || 0) + 1;
    await Zotero.Promise.delay(200);
    return {responseText: JSON.stringify({message: {items: [{
      title: ['Visual citation testing study ' + number], author: [{given: 'Jane', family: 'Researcher'}],
      DOI: '10.5555/gui-fixture-' + number, type: 'journal-article', published: {'date-parts': [[2024]]},
      abstract: '<p>Deterministic test metadata. This is a generated GUI fixture, not a research result.</p>'
    }]}})};
  };
  const pdf = Services.env.get('HOST_CASE_PDF');
  const destination = Services.env.get('HOST_CASE_DEST');
  assert(pdf && destination, 'HOST_CASE_PDF and HOST_CASE_DEST are required');
  status.stage = 'importing-fixture';
  const item = await Zotero.Attachments.importFromFile({file: pdf});
  reader = await Zotero.Reader.open(item.id);
  await reader._initPromise;
  const view = reader._internalReader._primaryView;
  await view.initializedPromise;
  const Cu = Components.utils;
  const pdfPage = Cu.waiveXrays(await view._iframeWindow.PDFViewerApplication.pdfDocument.getPage(1));
  const annotations = Cu.waiveXrays(await pdfPage.getAnnotations());
  const annotation = annotations.find(a => a.dest === destination);
  assert(annotation, 'Fixture named destination was not found: ' + destination);
  const position = {pageIndex: 0, rects: [Array.from(annotation.rect)]};
  await view.navigate(Cu.cloneInto({position}, reader._iframeWindow));
  await waitFor(() => view._pdfPages[0]?.overlays?.length && !view._scrolling, 'Source page did not become ready');
  await Zotero.Promise.delay(800);
  const rect = view.getClientRect(Cu.cloneInto(position.rects[0], view._iframeWindow), 0);
  const win = Cu.unwaiveXrays(view._iframeWindow);
  function move(x, y) {
    assert(win.document.elementFromPoint(x, y), 'Pointer coordinates are outside the document: ' + [x, y]);
    win.windowUtils.sendMouseEventToWindow('mousemove', x, y, 0, 0, 0);
  }
  view._iframeWindow.addEventListener('pointermove', event => { status.trustedPointer = event.isTrusted; }, {once: true});
  const doc = reader._iframeWindow.document;
  const popup = () => reader._internalReader._state.primaryViewOverlayPopup;
  status.stage = 'hovering';
  status.sourceRect = Array.from(rect);
  move((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2);
  await waitFor(() => popup(), 'Trusted hover did not open the native popup');
  status.nativePopupType = popup().type;
  await waitFor(() => doc.querySelector('.cp-native-metadata h2'), 'Metadata card did not resolve: inspect screenshot');
  assert(status.trustedPointer, 'Pointer event was not trusted');
  assert(status.metadataRequests === 1, 'Expected exactly one fixture metadata request');
  const block = doc.querySelector('.cp-native-metadata');
  status.title = block.querySelector('h2').textContent;
  assert(status.title === 'Visual citation testing study ' + destination.match(/\d+$/)[0], 'Wrong reference metadata');
  await Zotero.Promise.delay(300);
  const card = block.getBoundingClientRect();
  status.card = card.toJSON();
  status.viewport = {width: doc.defaultView.innerWidth, height: doc.defaultView.innerHeight};
  assert(card.width <= 422 && card.height <= Math.min(300, doc.defaultView.innerHeight * .4) + 2, 'Named reference card exceeds compact bounds');
  assert(doc.defaultView.getComputedStyle(block.parentNode.querySelector('.inner')).display === 'none', 'Native reference image remains expanded');
  capture();
  const page = view._iframeWindow.PDFViewerApplication.pdfViewer._pages[0].div.getBoundingClientRect();
  move(Math.max(10, page.left + 10), Math.max(10, page.top + 10));
  await waitFor(() => !popup(), 'Native popup did not close after pointer exit');
  await Zotero.Promise.delay(1000);
  assert(!popup() && !doc.querySelector('.cp-native-metadata'), 'Popup reappeared after pointer exit');
  status.closedAfterPointerExit = true;
  controller.stop();
  assert(!Zotero.Reader._registeredListeners.some(x => x.pluginID === 'citation-preview@local'), 'Addon listeners survived stop');
  status.cleanupPassed = true;
  status.stage = 'passed';
}
function shutdown() {
  if (originalRequest) Zotero.HTTP.request = originalRequest;
  delete Zotero.Server.Endpoints['/citation-preview-host/status'];
  delete Zotero.Server.Endpoints['/citation-preview-host/screenshot'];
}
function install() {}
function uninstall() {}
