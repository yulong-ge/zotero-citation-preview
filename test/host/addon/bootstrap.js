var status = {
  stage: "starting",
  metadataSource: "deterministic test fixture",
};
var screenshot;
var reader;
var originalRequest;
var restorePopupCallback;
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
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
  const canvas = win.document.createElement("canvas");
  canvas.width = win.innerWidth;
  canvas.height = win.innerHeight;
  canvas
    .getContext("2d")
    .drawWindow(win, 0, 0, win.innerWidth, win.innerHeight, "white");
  screenshot = canvas.toDataURL("image/png").split(",")[1];
  status.hasScreenshot = true;
}
async function startup() {
  await Zotero.initializationPromise;
  status.runID = Services.env.get("HOST_CASE_RUN_ID");
  status.destination = Services.env.get("HOST_CASE_DEST");
  status.mode = Services.env.get("HOST_CASE_MODE") || "success";
  status.geometry = [];
  Zotero.Server.Endpoints["/citation-preview-host/status"] = class {
    constructor() {
      this.supportedMethods = ["GET"];
    }
    async init(_request) {
      return [200, "application/json", JSON.stringify(status)];
    }
  };
  Zotero.Server.Endpoints["/citation-preview-host/screenshot"] = class {
    constructor() {
      this.supportedMethods = ["GET"];
    }
    async init(_request) {
      return [200, "text/plain", screenshot];
    }
  };
  run().catch((error) => {
    status.error = { message: String(error), stack: error.stack };
    try {
      capture();
    } catch (captureError) {
      status.captureError = String(captureError);
    }
    status.stage = "failed";
    Zotero.logError(error);
  });
}
async function run() {
  await Zotero.uiReadyPromise;
  const controller = Zotero.CitationPreview;
  assert(controller, "Production addon was not loaded");
  const { AddonManager } = ChromeUtils.importESModule(
    "resource://gre/modules/AddonManager.sys.mjs",
  );
  const addon = await AddonManager.getAddonByID("citation-preview@local");
  assert(addon?.isActive, "Production addon is not active");
  status.installation = { version: addon.version, active: addon.isActive };
  // Only metadata is deterministic; PDF processing, hit testing and popup UI use the installed Zotero.
  originalRequest = Zotero.HTTP.request;
  Zotero.HTTP.request = async function (method, url, options) {
    if (
      !/^https:\/\/(api\.crossref\.org|api\.openalex\.org|export\.arxiv\.org)\//.test(
        url,
      )
    )
      return originalRequest.call(this, method, url, options);
    assert(
      url.startsWith("https://api.crossref.org/works?"),
      "Unexpected metadata request: " + url,
    );
    const raw = decodeURIComponent(
      url.split("query.bibliographic=")[1].split("&")[0],
    );
    const number = raw.match(/study (2|44)\b/)?.[1];
    assert(
      number,
      "Metadata request did not contain a fixture reference: " + raw,
    );
    status.metadataRequests = (status.metadataRequests || 0) + 1;
    const trace = {
      number,
      time: Date.now(),
      popupType: reader?._internalReader._state.primaryViewOverlayPopup?.type,
    };
    (status.requestTrace ||= []).push(trace);
    options.cancellerReceiver?.(() => {
      trace.cancelledAt = Date.now();
    });
    await Zotero.Promise.delay(700);
    trace.completedAt = Date.now();
    const host = reader?._iframeWindow.document.querySelector(".view-popup");
    if (host && status.mode !== "multiple") {
      // Explicit asynchronous layout perturbation, separate from metadata fixtures.
      status.resizeBefore = host.getBoundingClientRect().toJSON();
      await new Promise((resolve) =>
        host.ownerDocument.defaultView.requestAnimationFrame(() => {
          host.style.width = "360px";
          resolve();
        }),
      );
      await Zotero.Promise.delay(80);
      status.resizeAfter = host.getBoundingClientRect().toJSON();
    }
    if (status.mode === "metadata-failure")
      return { responseText: JSON.stringify({ message: { items: [] } }) };
    return {
      responseText: JSON.stringify({
        message: {
          items: [
            {
              title: ["Visual citation testing study " + number],
              author: [{ given: "Jane", family: "Researcher" }],
              DOI: "10.5555/gui-fixture-" + number,
              type: "journal-article",
              published: { "date-parts": [[2024]] },
              abstract:
                "<p>Deterministic test metadata. This is a generated GUI fixture, not a research result.</p>",
            },
          ],
        },
      }),
    };
  };
  const pdf = Services.env.get("HOST_CASE_PDF");
  const destination = Services.env.get("HOST_CASE_DEST");
  assert(pdf && destination, "HOST_CASE_PDF and HOST_CASE_DEST are required");
  status.stage = "importing-fixture";
  const item = await Zotero.Attachments.importFromFile({ file: pdf });
  reader = await Zotero.Reader.open(item.id);
  await reader._initPromise;
  const view = reader._internalReader._primaryView;
  await view.initializedPromise;
  const Cu = Components.utils;
  const pdfPage = Cu.waiveXrays(
    await view._iframeWindow.PDFViewerApplication.pdfDocument.getPage(1),
  );
  const annotations = Cu.waiveXrays(await pdfPage.getAnnotations());
  const annotation = annotations.find((a) => a.dest === destination);
  assert(annotation, "Fixture named destination was not found: " + destination);
  const position = { pageIndex: 0, rects: [Array.from(annotation.rect)] };
  await view.navigate(Cu.cloneInto({ position }, reader._iframeWindow));
  await waitFor(
    () => view._pdfPages[0]?.overlays?.length && !view._scrolling,
    "Source page did not become ready",
  );
  await Zotero.Promise.delay(800);
  const rect = view.getClientRect(
    Cu.cloneInto(position.rects[0], view._iframeWindow),
    0,
  );
  const win = Cu.unwaiveXrays(view._iframeWindow);
  function move(x, y) {
    assert(
      win.document.elementFromPoint(x, y),
      "Pointer coordinates are outside the document: " + [x, y],
    );
    win.windowUtils.sendMouseEventToWindow("mousemove", x, y, 0, 0, 0);
  }
  view._iframeWindow.addEventListener(
    "pointermove",
    (event) => {
      status.trustedPointer = event.isTrusted;
    },
    { once: true },
  );
  const doc = reader._iframeWindow.document;
  const popup = () => reader._internalReader._state.primaryViewOverlayPopup;
  let sampling = true;
  let phase = "opening";
  const sample = () => {
    const host = doc.querySelector(".view-popup");
    if (!host) return;
    const box = host.getBoundingClientRect();
    const bounds = host.parentNode.getBoundingClientRect();
    const anchor = popup()?.rect;
    status.geometry.push({
      phase,
      time: Date.now(),
      box: box.toJSON(),
      bounds: bounds.toJSON(),
      anchor: anchor && Array.from(anchor),
      transform: host.style.transform,
      position: doc.defaultView.getComputedStyle(host).position,
      left: doc.defaultView.getComputedStyle(host).left,
      metadata: !!host.querySelector(".cp-native-metadata"),
      text: host.querySelector(".cp-native-metadata")?.textContent,
    });
  };
  (async () => {
    while (sampling) {
      await new Promise((resolve) =>
        doc.defaultView.requestAnimationFrame(() =>
          doc.defaultView.setTimeout(resolve, 0),
        ),
      );
      if (sampling) sample();
    }
  })();
  if (status.mode === "multiple") {
    // The grouped fixture must be established before the first callback reaches
    // Zotero/production observers; replacing an already-open hover races its request.
    const original = view._onSetOverlayPopup;
    const references = [44, 2].map((number) => ({
      chars: [
        ...`[${number}] Jane Researcher. Visual citation testing study ${number}. 2024.`,
      ].map((c) => ({ c })),
    }));
    const callback = (value) => {
      if (value?.type === "internal-link") {
        status.groupedInjection = {
          time: Date.now(),
          inputType: value.type,
          requestsBefore: status.metadataRequests || 0,
        };
        return original(
          Cu.cloneInto(
            { type: "citation", rect: Array.from(value.rect), references },
            view._iframeWindow,
          ),
        );
      }
      return original(value);
    };
    view._onSetOverlayPopup = callback;
    restorePopupCallback = () => {
      if (view._onSetOverlayPopup === callback)
        view._onSetOverlayPopup = original;
    };
  }
  status.stage = "hovering";
  status.sourceRect = Array.from(rect);
  move((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2);
  await waitFor(() => popup(), "Trusted hover did not open the native popup");
  status.nativePopupType = popup().type;
  await waitFor(
    () => doc.querySelector(".cp-native-metadata"),
    "No enhanced popup",
  );
  phase = "loading";
  sample();
  const terminal = () => {
    const block = doc.querySelector(".cp-native-metadata");
    return ["success", "multiple"].includes(status.mode)
      ? block?.querySelector("h2")
      : /引用(?:查询|解析)失败/.test(block?.textContent || "");
  };
  await waitFor(
    terminal,
    "Expected terminal success/error card did not appear",
  );
  phase = "terminal";
  await Zotero.Promise.delay(150);
  sample();
  assert(status.trustedPointer, "Pointer event was not trusted");
  const block = doc.querySelector(".cp-native-metadata");
  status.title = block.querySelector("h2")?.textContent;
  assert(
    ["success", "multiple"].includes(status.mode)
      ? status.title ===
          "Visual citation testing study " + destination.match(/\d+$/)[0]
      : !status.title,
    "Wrong terminal content",
  );
  if (status.mode === "multiple") {
    phase = "switch-loading";
    const choice = doc.querySelectorAll(".cp-reference-choice")[1];
    assert(choice, "Missing second reference choice");
    choice.click();
    sample();
    await waitFor(
      () =>
        doc.querySelector(".cp-native-metadata h2")?.textContent ===
        "Visual citation testing study 2",
      "Switch did not resolve second paper",
    );
    phase = "switch-complete";
    await Zotero.Promise.delay(150);
    sample();
    status.switchedTitle = doc.querySelector(
      ".cp-native-metadata h2",
    ).textContent;
  }
  const expectedRequests =
    status.mode === "parser-failure" ? 0 : status.mode === "multiple" ? 2 : 1;
  status.expectedMetadataRequests = expectedRequests;
  if (status.mode === "multiple") {
    assert(
      status.groupedInjection?.requestsBefore === 0,
      "Metadata request started before grouped fixture initialization",
    );
    assert(
      status.requestTrace.length === 2 &&
        status.requestTrace.every(
          (x) => x.popupType === "citation" && !x.cancelledAt,
        ),
      "Grouped fixture leaked a native preflight request or cancellation",
    );
  }
  assert(
    (status.metadataRequests || 0) === expectedRequests,
    "Unexpected fixture metadata request count",
  );
  status.card = block.getBoundingClientRect().toJSON();
  status.viewport = {
    width: doc.defaultView.innerWidth,
    height: doc.defaultView.innerHeight,
  };
  const inner = block.parentNode.querySelector(".inner");
  assert(inner, "Native popup inner is missing");
  status.nativeInnerDisplay = doc.defaultView.getComputedStyle(inner).display;
  assert(
    status.nativeInnerDisplay === "none",
    "Native reference image remains expanded",
  );
  if (status.mode !== "multiple") {
    assert(
      status.card.width <= 422 &&
        status.card.height <= Math.min(300, status.viewport.height * 0.4) + 2,
      "Named reference card exceeds compact bounds",
    );
  } else {
    assert(
      status.card.width <= 432 &&
        status.card.height <= Math.min(360, status.viewport.height * 0.55) + 2,
      "Grouped reference card exceeds bounded layout",
    );
  }
  // Use the popup-owning document and its own window coordinates, not PDF iframe coordinates.
  const host = block.parentNode,
    outer = Cu.unwaiveXrays(doc.defaultView);
  const before = host.getBoundingClientRect(),
    x = before.left + before.width / 2,
    y = before.top + before.height / 2;
  const hit = doc.elementFromPoint(x, y);
  status.pointerHit = {
    x,
    y,
    tag: hit?.tagName,
    inside: !!hit && host.contains(hit),
  };
  assert(
    status.pointerHit.inside,
    "Pointer entry coordinates do not hit the popup",
  );
  let trustedEntry = false;
  host.addEventListener(
    "pointermove",
    (event) => {
      trustedEntry = event.isTrusted;
    },
    { once: true },
  );
  phase = "pointer-entry";
  outer.windowUtils.sendMouseEventToWindow("mousemove", x, y, 0, 0, 0);
  await Zotero.Promise.delay(150);
  sample();
  status.trustedEntry = trustedEntry;
  assert(trustedEntry, "Popup did not receive trusted pointer entry");
  const after = host.getBoundingClientRect();
  status.pointerShift = {
    x: after.left - before.left,
    y: after.top - before.top,
  };
  sampling = false;
  capture();
  assert(
    Math.hypot(status.pointerShift.x, status.pointerShift.y) <= 2,
    "Popup jumped on pointer entry",
  );
  const enhanced = status.geometry.filter((s) => s.metadata);
  assert(enhanced.length >= 3, "Missing enhanced geometry samples");
  for (const point of enhanced) {
    const { box, bounds, anchor } = point;
    assert(anchor?.length === 4, "Missing native anchor");
    const center = (anchor[0] + anchor[2]) / 2;
    let expected = center - box.width / 2;
    const below = anchor[3] + box.height + 10 < bounds.height,
      above = anchor[1] - 10 - box.height > 0;
    if (expected < 0) expected = anchor[2] + 10;
    else if (expected + box.width > bounds.width)
      expected = anchor[0] - box.width - 10;
    else if (!below && !above)
      expected =
        anchor[0] >= bounds.width / 2
          ? anchor[0] - box.width - 10
          : anchor[2] + 10;
    expected = Math.max(10, Math.min(expected, bounds.width - box.width - 10));
    assert(
      Math.abs(box.left - bounds.left - expected) <= 2,
      "Transient stale horizontal placement: " + JSON.stringify(point),
    );
    assert(
      box.top >= bounds.top - 2 && box.bottom <= bounds.bottom + 2,
      "Popup outside vertical bounds",
    );
  }
  const page =
    view._iframeWindow.PDFViewerApplication.pdfViewer._pages[0].div.getBoundingClientRect();
  move(Math.max(10, page.left + 10), Math.max(10, page.top + 10));
  await waitFor(
    () => !popup(),
    "Native popup did not close after pointer exit",
  );
  await Zotero.Promise.delay(1000);
  assert(
    !popup() && !doc.querySelector(".cp-native-metadata"),
    "Popup reappeared after pointer exit",
  );
  status.closedAfterPointerExit = true;
  restorePopupCallback?.();
  controller.stop();
  assert(
    !Zotero.Reader._registeredListeners.some(
      (x) => x.pluginID === "citation-preview@local",
    ),
    "Addon listeners survived stop",
  );
  status.cleanupPassed = true;
  status.stage = "passed";
}
function shutdown() {
  restorePopupCallback?.();
  if (originalRequest) Zotero.HTTP.request = originalRequest;
  delete Zotero.Server.Endpoints["/citation-preview-host/status"];
  delete Zotero.Server.Endpoints["/citation-preview-host/screenshot"];
}
function install() {}
function uninstall() {}
