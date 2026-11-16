var CitationPreview = (() => {
  if (
    typeof Cu === "undefined" ||
    typeof Cu.waiveXrays !== "function" ||
    typeof Cu.unwaiveXrays !== "function" ||
    typeof Cu.cloneInto !== "function"
  )
    throw new Error(
      "Citation Preview requires Cu.waiveXrays, Cu.unwaiveXrays and Cu.cloneInto in its script scope.",
    );
  const ID = "citation-preview@local";
  const states = new Map(),
    measurements = new Set(),
    cache = new Map();
  const metrics = {
    requests: 0,
    cacheHits: 0,
    cancellations: 0,
    showCalls: 0,
    maxShowMs: 0,
    totalShowMs: 0,
    pdfPageReads: 0,
    maxPdfResolveMs: 0,
    observerCalls: 0,
    maxObserverMs: 0,
  };
  let running = false;
  function report(error) {
    Zotero.logError(error);
  }
  function text(doc, tag, value, parent) {
    const node = doc.createElement(tag);
    node.textContent = value;
    parent?.append(node);
    return node;
  }
  async function request(s, url, signal) {
    if (signal.aborted) {
      const error = new Error("Citation request cancelled before start.");
      error.name = "AbortError";
      throw error;
    }
    metrics.requests++;
    let cancel;
    const onAbort = () => cancel?.();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await Zotero.HTTP.request("GET", url, {
        responseType: "text",
        anon: true,
        timeout: 12000,
        errorDelayMax: 0,
        noRetryOnThrottle: true,
        cancellerReceiver(received) {
          cancel = received;
          if (signal.aborted) cancel();
        },
      });
      checkAbort(signal);
      return {
        text: async () => response.responseText,
        json: async () => JSON.parse(response.responseText),
      };
    } catch (cause) {
      if (signal.aborted) {
        const error = new Error("Citation request cancelled.", { cause });
        error.name = "AbortError";
        throw error;
      }
      throw cause;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }
  function checkAbort(signal) {
    if (signal.aborted) {
      const error = new Error("Citation request cancelled.");
      error.name = "AbortError";
      throw error;
    }
  }
  function pdfDocument(view) {
    return view._iframeWindow.PDFViewerApplication.pdfDocument;
  }
  async function pageData(s, view, index, signal) {
    checkAbort(signal);
    const doc = pdfDocument(view);
    let pages = s.pageCaches.get(doc);
    if (!pages) {
      pages = new Map();
      s.pageCaches.set(doc, pages);
    }
    if (!pages.has(index)) {
      if (pages.size >= 8) pages.delete(pages.keys().next().value);
      metrics.pdfPageReads++;
      const pending = doc
        .getPageData(Cu.cloneInto({ pageIndex: index }, view._iframeWindow))
        .catch((error) => {
          pages.delete(index);
          throw error;
        });
      pages.set(index, pending);
    }
    const data = Cu.waiveXrays(await pages.get(index));
    checkAbort(signal);
    return data;
  }
  async function internalCitation(s, view, overlay, signal, session) {
    const doc = pdfDocument(view);
    const page = Cu.waiveXrays(
      await doc.getPage(overlay.position.pageIndex + 1),
    );
    checkAbort(signal);
    const annotations = Cu.waiveXrays(await page.getAnnotations());
    checkAbort(signal);
    const rect = overlay.position.rects[0];
    const matches = annotations.filter(
      (a) => a.rect && a.rect.every((x, i) => Math.abs(x - rect[i]) < 0.5),
    );
    if (
      matches.length !== 1 ||
      typeof matches[0].dest !== "string" ||
      !/^cite\.[\w.:-]+$/.test(matches[0].dest)
    )
      return null;
    session.namedCitation = true;
    const annotation = matches[0];
    const source = await pageData(s, view, overlay.position.pageIndex, signal);
    const number = CitationCore.markerNumber(source.chars, rect);
    return {
      label: `引用 [${number}] · ${annotation.dest.slice(5)}`,
      citation: { view, dest: annotation.dest, number },
    };
  }
  async function rawCitation(s, entry, signal) {
    if (entry.raw) return entry.raw;
    const started = s.win.performance.now();
    try {
      const { view, dest, number } = entry.citation;
      const position = Cu.waiveXrays(
        await view._getPositionFromDestination(dest),
      );
      checkAbort(signal);
      if (
        !Number.isInteger(position?.pageIndex) ||
        position.pageIndex < 0 ||
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y)
      )
        throw new Error(
          "PDF named destination must return a valid pageIndex/x/y position.",
        );
      const target = await pageData(s, view, position.pageIndex, signal);
      const raw = CitationCore.extractNumberedReference(
        target.chars,
        [position.x, position.y],
        number,
      );
      entry.raw = raw;
      return raw;
    } finally {
      metrics.maxPdfResolveMs = Math.max(
        metrics.maxPdfResolveMs,
        s.win.performance.now() - started,
      );
    }
  }
  async function resolve(s, raw, signal) {
    checkAbort(signal);
    if (cache.has(raw)) {
      metrics.cacheHits++;
      return cache.get(raw);
    }
    let result;
    const doi = raw
      .match(/\b10\.\d{4,9}\/[^\s<>]+/i)?.[0]
      .replace(/[.,;:)]+$/, "");
    const arxiv = raw.match(
      /(?:arxiv\s*[.:]?\s*|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5}(?:v\d+)?)/i,
    );
    if (arxiv) {
      const response = await request(
        s,
        "https://export.arxiv.org/api/query?id_list=" + arxiv[1],
        signal,
      );
      const xml = new s.win.DOMParser().parseFromString(
        await response.text(),
        "application/xml",
      );
      const entry = xml.querySelector("entry");
      if (
        !entry ||
        entry
          .querySelector("id")
          ?.textContent.match(/\/(\d{4}\.\d{4,5})(?:v\d+)?$/)?.[1] !==
          arxiv[1].replace(/v\d+$/, "")
      )
        throw new Error(
          "arXiv did not return the cited identifier " + arxiv[1],
        );
      result = {
        title: entry
          .querySelector("title")
          ?.textContent.replace(/\s+/g, " ")
          .trim(),
        authors: [...entry.querySelectorAll("author > name")]
          .map((x) => x.textContent)
          .join(", "),
        abstract: entry
          .querySelector("summary")
          ?.textContent.replace(/\s+/g, " ")
          .trim(),
        source: "arXiv · " + arxiv[1],
        url: "https://arxiv.org/abs/" + arxiv[1],
      };
    } else {
      const response = await request(
        s,
        doi
          ? "https://api.crossref.org/works/" + encodeURIComponent(doi)
          : "https://api.crossref.org/works?rows=5&query.bibliographic=" +
              encodeURIComponent(raw.slice(0, 1000)) +
              "&select=title,author,DOI,abstract,published,type,publisher",
        signal,
      );
      const data = await response.json();
      const matches = doi
        ? [data.message].filter(
            (work) =>
              work.DOI?.toLowerCase() === doi.toLowerCase() &&
              CitationCore.validateCarrier(raw, work),
          )
        : data.message.items.filter((work) => CitationCore.validate(raw, work));
      if (!matches.length)
        throw new Error(
          "未找到标题、作者、年份及文献载体一致的记录。未显示猜测结果。",
        );
      if (new Set(matches.map((work) => work.DOI.toLowerCase())).size > 1)
        throw new Error(
          "多个记录符合该引用，无法唯一确认。请核对原始引用中的 DOI 或 arXiv 编号。",
        );
      const work = matches[0];
      result = {
        title: work.title[0],
        authors: work.author
          .map((a) => [a.given, a.family].filter(Boolean).join(" "))
          .join(", "),
        abstract: "",
        source: "Crossref · " + work.DOI,
        url: "https://doi.org/" + work.DOI,
      };
      if (work.abstract) {
        result.abstract = new s.win.DOMParser().parseFromString(
          "<body>" + work.abstract + "</body>",
          "text/html",
        ).body.textContent;
      } else {
        const oa = await request(
          s,
          "https://api.openalex.org/works/https://doi.org/" +
            encodeURIComponent(work.DOI),
          signal,
        );
        const record = await oa.json();
        result.abstract = CitationCore.invertedAbstract(
          record.abstract_inverted_index,
        );
        result.source += " · 摘要：OpenAlex";
      }
    }
    if (!result.title || !result.authors)
      throw new Error("Metadata source omitted the required title or authors.");
    checkAbort(signal);
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(raw, result);
    return result;
  }
  function current(session) {
    const { state: s, slot, host, popup } = session;
    return (
      running &&
      states.get(s.reader) === s &&
      s.sessions.get(slot) === session &&
      host.isConnected &&
      s.reader._internalReader?._state?.[slot + "ViewOverlayPopup"] === popup
    );
  }
  function cancelRequest(session) {
    session.state.win.clearTimeout(session.timer);
    if (session.abort) {
      session.abort.abort();
      session.abort = null;
      metrics.cancellations++;
    }
    session.sequence++;
  }
  function endSession(s, slot) {
    const session = s.sessions.get(slot);
    if (!session) return;
    s.sessions.delete(slot);
    cancelRequest(session);
    session.resizeObserver?.disconnect();
    session.block?.remove();
  }
  // Zotero positions a view popup only when React renders it. Adding our card later
  // changes the popup's dimensions without causing another native render, so retain
  // Zotero's placement algorithm for that post-render resize.
  function positionPopup(session) {
    if (!current(session) || !session.block) return;
    const { host, popup } = session,
      rect = popup.rect;
    if (!rect || rect.length !== 4 || !host.parentNode?.getBoundingClientRect)
      return;
    const padding = 10,
      width = host.offsetWidth,
      height = host.offsetHeight;
    const bounds = host.parentNode.getBoundingClientRect();
    const anchorX = rect[0] + (rect[2] - rect[0]) / 2,
      anchorY = rect[1] + (rect[3] - rect[1]) / 2;
    const sideLeft = (placeLeft) => {
      const edge = placeLeft ? rect[0] - width - padding : rect[2] + padding;
      if (placeLeft) return edge < padding ? anchorX - width - padding : edge;
      return edge + width > bounds.width - padding ? anchorX + padding : edge;
    };
    const sideTop = () => {
      let top = anchorY - height / 2;
      if (rect[3] - rect[1] > height)
        top = Math.min(Math.max(top, rect[1]), rect[3] - height);
      return top;
    };
    let left = anchorX - width / 2,
      top,
      side;
    if (left < 0) {
      side = "right";
      left = sideLeft(false);
      top = sideTop();
    } else if (left + width > bounds.width) {
      side = "left";
      left = sideLeft(true);
      top = sideTop();
    } else if (rect[3] + height + padding < bounds.height) {
      side = "bottom";
      top = rect[3] + padding;
    } else if (rect[1] - padding - height > 0) {
      side = "top";
      top = rect[1] - padding - height;
    } else {
      const placeLeft = rect[0] >= bounds.width / 2;
      side = placeLeft ? "left" : "right";
      left = sideLeft(placeLeft);
      top = sideTop();
    }
    left = Math.max(padding, Math.min(left, bounds.width - width - padding));
    top = Math.max(padding, Math.min(top, bounds.height - height - padding));
    for (const name of ["top", "bottom", "left", "right"]) {
      const cls = `page-popup-${name}-center`;
      if (name === side) host.classList.add(cls);
      else host.classList.remove(cls);
    }
    host.style.transform = `translate(${left}px, ${top}px)`;
  }
  function metadataBlock(session, entries) {
    const started = session.state.win.performance.now();
    try {
      const { doc } = session.state;
      const block = (session.block = text(doc, "section", ""));
      block.className = "cp-native-metadata";
      if (session.namedCitation)
        block.setAttribute("data-cp-named-citation", "true");
      block.setAttribute("aria-label", "引用论文摘要");
      block.setAttribute("data-tabstop", "1");
      block.tabIndex = -1;
      let content = block;
      if (entries.length > 1) {
        block.setAttribute("data-cp-multiple", "true");
        const choices = text(doc, "div", "", block);
        choices.className = "cp-reference-choices";
        choices.setAttribute("role", "group");
        choices.setAttribute("aria-label", "切换引用论文");
        session.choices = entries.map((entry, index) => {
          const match = entry.raw.match(/^\s*(?:\[(\d+)\]|(\d+)[.)])\s*/);
          const label = match
            ? `[${match[1] || match[2]}]`
            : `文献 ${index + 1}`;
          const button = text(doc, "button", label, choices);
          button.className = "cp-reference-choice";
          button.type = "button";
          button.title = entry.raw;
          button.setAttribute("data-tabstop", "1");
          button.setAttribute("aria-pressed", "false");
          button.onclick = () => {
            if (session.selectedEntry !== entry)
              void loadMetadata(session, entry);
          };
          return { button, entry };
        });
        content = text(doc, "div", "", block);
        content.className = "cp-content";
        session.scroller = content;
      }
      session.body = text(doc, "div", "", content);
      session.body.setAttribute("aria-live", "polite");
      const original = (session.details = text(doc, "details", "", content));
      text(doc, "summary", "原始参考文献", original);
      original.hidden = true;
      session.original = text(doc, "p", "", original);
      session.original.className = "cp-original";
      session.host.append(block);
      if (session.state.win.ResizeObserver) {
        session.resizeObserver = new session.state.win.ResizeObserver(() =>
          positionPopup(session),
        );
        session.resizeObserver.observe(session.host);
      }
      positionPopup(session);
    } finally {
      const elapsed = session.state.win.performance.now() - started;
      metrics.showCalls++;
      metrics.totalShowMs += elapsed;
      metrics.maxShowMs = Math.max(metrics.maxShowMs, elapsed);
    }
  }
  async function loadMetadata(session, entry, prepared = false) {
    if (!current(session)) return;
    if (!prepared) {
      cancelRequest(session);
      session.abort = new session.state.win.AbortController();
      session.timer = session.state.win.setTimeout(
        () => session.abort?.abort(),
        12000,
      );
    }
    const { state: s, body, original } = session;
    const sequence = session.sequence,
      abort = session.abort,
      timer = session.timer;
    session.selectedEntry = entry;
    for (const choice of session.choices || [])
      choice.button.setAttribute(
        "aria-pressed",
        String(choice.entry === entry),
      );
    session.details.open = false;
    if (session.scroller) session.scroller.scrollTop = 0;
    original.textContent = entry.raw || "";
    session.details.hidden = !entry.raw;
    body.replaceChildren();
    text(s.doc, "p", "正在核对引用及获取摘要…", body);
    positionPopup(session);
    try {
      const result = await resolve(s, entry.raw, abort.signal);
      if (!current(session) || sequence !== session.sequence) return;
      body.replaceChildren();
      text(s.doc, "h2", result.title, body);
      text(s.doc, "p", result.authors, body).className = "cp-authors";
      text(s.doc, "p", result.abstract || "来源未提供摘要。", body).className =
        "cp-abstract";
      const source = text(s.doc, "button", result.source + " ↗", body);
      source.setAttribute("data-tabstop", "1");
      source.onclick = () => Zotero.launchURL(result.url);
    } catch (error) {
      if (!current(session) || sequence !== session.sequence) return;
      body.replaceChildren();
      text(
        s.doc,
        "p",
        error.name === "AbortError"
          ? "查询超时。关闭后重新打开引用可重试。"
          : "引用查询失败：" + error.message,
        body,
      );
      if (error.name !== "AbortError") report(error);
    } finally {
      positionPopup(session);
      s.win.clearTimeout(timer);
      if (sequence === session.sequence && session.abort === abort)
        session.abort = null;
    }
  }
  async function enhance(session) {
    const { state: s, popup, view } = session;
    const abort = (session.abort = new s.win.AbortController());
    const timer = (session.timer = s.win.setTimeout(
      () => abort.abort(),
      12000,
    ));
    try {
      let entries;
      if (popup.type === "internal-link") {
        const entry = await internalCitation(
          s,
          view,
          popup,
          abort.signal,
          session,
        );
        if (!entry) return;
        const raw = await rawCitation(s, entry, abort.signal);
        entries = [{ raw, label: entry.label }];
      } else {
        entries = [];
        // Content Array.map cannot receive privileged entry objects from its callback.
        for (const ref of popup.references) {
          const raw = CitationCore.referenceText(ref);
          entries.push({ raw, label: raw });
        }
        if (!entries.length || entries.some((entry) => !entry.raw))
          throw new Error("Native citation popup omitted reference text.");
      }
      if (!current(session)) return;
      metadataBlock(session, entries);
      // Only a verified cite.* destination and bounded reference may replace a page image.
      if (popup.type === "internal-link")
        session.block.setAttribute("data-cp-citation-verified", "true");
      await loadMetadata(session, entries[0], true);
    } catch (error) {
      if (!current(session)) return;
      if (error.name === "AbortError") {
        if (session.namedCitation) {
          metadataBlock(session, []);
          text(
            s.doc,
            "p",
            "引用解析超时。关闭后重新打开引用可重试。",
            session.body,
          );
        }
      } else {
        report(error);
        if (popup.type !== "internal-link" || session.namedCitation) {
          metadataBlock(session, []);
          text(s.doc, "p", "引用解析失败：" + error.message, session.body);
        }
      }
    } finally {
      positionPopup(session);
      s.win.clearTimeout(timer);
      if (session.abort === abort) session.abort = null;
    }
  }
  function reconcile(s) {
    const started = s.win.performance.now();
    try {
      const internal = s.reader._internalReader;
      for (const slot of ["primary", "secondary"]) {
        const popup = internal?._state?.[slot + "ViewOverlayPopup"];
        const kind =
          popup?.type === "internal-link" && popup.source === "annotation"
            ? "preview-popup"
            : popup?.type === "citation"
              ? "citation-popup"
              : popup?.type === "reference"
                ? "reference-popup"
                : null;
        const host = kind
          ? s.doc.querySelector(`.${slot}-view .${kind}`)
          : null;
        const previous = s.sessions.get(slot);
        const view = internal?.["_" + slot + "View"];
        if (
          previous &&
          previous.host === host &&
          previous.popup === popup &&
          previous.view === view &&
          (!previous.block || host.contains(previous.block))
        )
          continue;
        endSession(s, slot);
        if (!host || !view) continue;
        const session = { state: s, slot, popup, host, view, sequence: 0 };
        s.sessions.set(slot, session);
        void enhance(session);
      }
    } finally {
      metrics.observerCalls++;
      metrics.maxObserverMs = Math.max(
        metrics.maxObserverMs,
        s.win.performance.now() - started,
      );
    }
  }
  function attach(reader, doc) {
    // Native customEvent supplies a waived document; WebIDL options need the privileged DOM wrapper.
    doc = Cu.unwaiveXrays(doc);
    if (!running || !reader._internalReader || !doc.body) return;
    const previous = states.get(reader);
    if (previous?.doc === doc) {
      reconcile(previous);
      return;
    }
    if (previous) dispose(previous);
    const s = {
      reader,
      doc,
      win: doc.defaultView,
      sessions: new Map(),
      pageCaches: new WeakMap(),
    };
    const style = text(
      doc,
      "style",
      `
.cp-native-metadata{box-sizing:border-box;width:min(420px,70vw);max-width:100%;height:min(300px,40vh);max-height:min(300px,40vh);flex-shrink:0;overflow:auto;padding:12px;border-top:1px solid var(--fill-quinary);font:13px/1.5 system-ui;text-align:start;color:inherit}
.cp-native-metadata h2{font-size:16px;line-height:1.35;margin:0 0 8px}.cp-native-metadata p{margin:7px 0}.cp-native-metadata .cp-authors{color:var(--fill-secondary);font-size:12px;max-height:4.5em;overflow:auto}.cp-native-metadata .cp-abstract{white-space:pre-wrap}.cp-native-metadata .cp-original{font-size:11px}.cp-native-metadata select{display:block;width:100%;font:inherit;color:inherit;background:var(--material-background);margin-bottom:8px}.cp-native-metadata button{font:inherit;color:inherit}.preview-popup:has(> .cp-native-metadata[data-cp-named-citation]) > .inner{display:none}.preview-popup:has(> .cp-native-metadata[data-cp-named-citation]){height:min(300px,40vh)}.preview-popup>.cp-native-metadata[data-cp-named-citation]{height:100%;max-height:100%}.citation-popup:has(> .cp-native-metadata),.reference-popup:has(> .cp-native-metadata){height:min(420px,70vh);max-height:calc(100% - 20px);overflow:auto}.citation-popup:has(> .cp-native-metadata)>.inner{flex:1 1 auto;min-height:0;max-height:none}.reference-popup:has(> .cp-native-metadata)>.reference-row{flex:1 1 auto;min-height:0;overflow:auto}
.citation-popup:has(> .cp-native-metadata[data-cp-multiple]),.reference-popup:has(> .cp-native-metadata[data-cp-multiple]){height:min(360px,55vh);overflow:hidden}
.citation-popup:has(> .cp-native-metadata[data-cp-multiple])>.inner,.reference-popup:has(> .cp-native-metadata[data-cp-multiple])>.reference-row{display:none}
.cp-native-metadata[data-cp-multiple]{height:100%;max-height:100%;padding:0;overflow:hidden;display:flex;flex-direction:column;border-top:0}
.cp-reference-choices{display:flex;flex-wrap:wrap;gap:6px;flex:none;padding:10px 12px;border-bottom:1px solid var(--fill-quinary)}
.cp-reference-choice{border:1px solid var(--fill-quaternary);border-radius:5px;padding:3px 7px;background:transparent;cursor:pointer}
.cp-reference-choice[aria-pressed="true"]{background:var(--fill-tertiary);font-weight:700;box-shadow:inset 0 -2px currentColor}
.cp-reference-choice:focus-visible{outline:2px solid currentColor;outline-offset:1px}
.cp-content{min-height:0;flex:1;overflow:auto;padding:12px}
.cp-content .cp-authors{max-height:none;overflow:visible}
`,
    );
    s.style = style;
    doc.head.append(style);
    s.observer = new s.win.MutationObserver(() => reconcile(s));
    s.observer.observe(doc.body, { childList: true, subtree: true });
    s.unload = () => dispose(s);
    s.win.addEventListener("unload", s.unload, { once: true });
    states.set(reader, s);
    reconcile(s);
  }
  function dispose(s) {
    s.observer.disconnect();
    for (const slot of [...s.sessions.keys()]) endSession(s, slot);
    s.style.remove();
    s.pageCaches = new WeakMap();
    s.win.removeEventListener("unload", s.unload);
    states.delete(s.reader);
  }
  function readerReady({ reader, doc }) {
    attach(reader, doc);
    reader._initPromise
      .then(() => {
        if (running) attach(reader, doc);
      })
      .catch(report);
  }
  return {
    version: "0.1.12",
    build: "native-popup-dom-enhancement",
    metrics,
    debugHooks() {
      return [...states.values()].map((s) => ({
        itemID: s.reader.itemID,
        mode: "native-dom-observer",
        activePopups: s.sessions.size,
        observedDocument: s.doc === s.reader._iframeWindow?.document,
        primaryPopupType:
          s.reader._internalReader?._state?.primaryViewOverlayPopup?.type,
      }));
    },
    measureResponsiveness({ durationMs = 5000, intervalMs = 50 } = {}) {
      if (!running) throw new Error("Citation Preview is disabled.");
      if (
        !Number.isFinite(durationMs) ||
        durationMs < 100 ||
        durationMs > 60000 ||
        !Number.isFinite(intervalMs) ||
        intervalMs < 10 ||
        intervalMs > durationMs
      )
        throw new Error("Invalid measurement duration/interval.");
      const win = Zotero.getMainWindow();
      return new Promise((resolve, reject) => {
        const samples = [];
        const start = win.performance.now();
        let expected = start + intervalMs;
        let timer;
        const cancel = () => {
          win.clearTimeout(timer);
          measurements.delete(cancel);
          reject(
            new Error(
              "Responsiveness measurement cancelled because Citation Preview was disabled.",
            ),
          );
        };
        measurements.add(cancel);
        const tick = () => {
          const now = win.performance.now();
          samples.push(Math.max(0, now - expected));
          if (now - start >= durationMs) {
            measurements.delete(cancel);
            const sorted = samples.slice().sort((a, b) => a - b);
            resolve({
              elapsedMs: now - start,
              samples: samples.length,
              meanDelayMs: samples.reduce((a, b) => a + b, 0) / samples.length,
              maxDelayMs: sorted[sorted.length - 1],
              p95DelayMs: sorted[Math.floor((sorted.length - 1) * 0.95)],
              metrics: { ...metrics },
            });
          } else {
            expected = now + intervalMs;
            timer = win.setTimeout(tick, intervalMs);
          }
        };
        timer = win.setTimeout(tick, intervalMs);
      });
    },
    start() {
      if (running) throw new Error("Citation Preview is already running.");
      running = true;
      Zotero.Reader.registerEventListener("renderToolbar", readerReady, ID);
      for (const reader of Zotero.Reader._readers) {
        const doc = reader._iframeWindow?.document;
        if (doc) readerReady({ reader, doc });
      }
    },
    stop() {
      running = false;
      for (const cancel of measurements) cancel();
      Zotero.Reader.unregisterEventListener("renderToolbar", readerReady);
      for (const s of [...states.values()]) dispose(s);
      cache.clear();
    },
  };
})();
