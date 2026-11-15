var CitationPreview = (() => {
  if(typeof Cu==='undefined' || typeof Cu.waiveXrays!=='function' || typeof Cu.cloneInto!=='function') throw new Error('Citation Preview requires Cu.waiveXrays and Cu.cloneInto in its script scope.');
  const ID = 'citation-preview@local';
  const states = new Map();
  const measurements = new Set();
  const cache = new Map();
  const metrics = { hookCalls: 0, maxHookMs: 0, requests: 0, cacheHits: 0, cancellations: 0, showCalls: 0, maxShowMs: 0, totalShowMs: 0, pdfPageReads: 0, maxPdfResolveMs: 0 };
  let running = false;
  function report(error) { Zotero.logError(error); }
  function text(doc, tag, value, parent) {
    const el = doc.createElement(tag); el.textContent = value; parent?.append(el); return el;
  }
  function cancelClose(s) { s.win.clearTimeout(s.pendingClose); s.pendingClose=null; }
  function scheduleClose(s) {
    if(s.mode!=='hover' || s.pendingClose) return;
    s.pendingClose=s.win.setTimeout(()=>{s.pendingClose=null;if(s.mode==='hover' && !s.inside) close(s);},350);
  }
  function watchHoverExit(s, view) {
    const targets=[s.doc.body,view?._iframeWindow?.document?.body].filter(Boolean);
    s.hoverExitTargets=[...new Set(targets)];
    s.hoverExit=()=>scheduleClose(s);
    for(const target of s.hoverExitTargets) target.addEventListener('pointerleave',s.hoverExit);
  }
  function close(s,{clearNative=true}={}) {
    cancelClose(s);
    for(const target of s.hoverExitTargets||[]) target.removeEventListener('pointerleave',s.hoverExit);
    s.hoverExitTargets=[];
    const source=s.sourceView, selection=s.sourceSelected;
    if(clearNative && source && selection && source._selectedOverlay===selection) {
      source._selectedOverlay=null;
      const hook=s.hooks.find(h=>h.view===source);
      if(hook) hook.original.call(source,null);
    }
    s.sourceView=null;s.sourceSelected=null;
    if (s.abort) { s.abort.abort(); s.abort = null; metrics.cancellations++; }
    s.sequence++; s.popupGeneration = (s.popupGeneration || 0) + 1; s.win.clearTimeout(s.pendingShow); s.pendingShow=null; s.inside=false; s.mode=null; s.card?.remove(); s.card=null; s.doc.documentElement.classList.remove('citation-preview-open');
  }
  function beginSession(s,mode,view) {
    close(s,{clearNative:!(view && view===s.sourceView)}); s.mode=mode; s.sourceView=view;s.sourceSelected=view?._selectedOverlay;
    if(mode==='hover') watchHoverExit(s,view);
  }
  async function request(s, url, signal) {
    if (signal.aborted) { const error = new Error('Citation request cancelled before start.'); error.name = 'AbortError'; throw error; }
    metrics.requests++;
    let cancel;
    const onAbort = () => cancel?.();
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await Zotero.HTTP.request('GET', url, {
        responseType: 'text', anon: true, timeout: 12000,
        errorDelayMax: 0, noRetryOnThrottle: true,
        cancellerReceiver(received) { cancel = received; if (signal.aborted) cancel(); }
      });
      checkAbort(signal);
      return { text: async () => response.responseText, json: async () => JSON.parse(response.responseText) };
    } catch (cause) {
      if (signal.aborted) { const error = new Error('Citation request cancelled.', { cause }); error.name = 'AbortError'; throw error; }
      throw cause;
    } finally { signal.removeEventListener('abort', onAbort); }
  }
  function checkAbort(signal) {
    if (signal.aborted) { const error = new Error('Citation request cancelled.'); error.name='AbortError'; throw error; }
  }
  function pdfDocument(view) { return view._iframeWindow.PDFViewerApplication.pdfDocument; }
  async function pageData(s, view, index, signal) {
    checkAbort(signal);
    if (!s.pdfPages) s.pdfPages=new Map();
    if (!s.pdfPages.has(index)) {
      if(s.pdfPages.size>=8) s.pdfPages.delete(s.pdfPages.keys().next().value);
      metrics.pdfPageReads++;
      const pending=pdfDocument(view).getPageData(Cu.cloneInto({pageIndex:index},view._iframeWindow)).catch(error=>{s.pdfPages.delete(index);throw error;});
      s.pdfPages.set(index,pending);
    }
    const data=Cu.waiveXrays(await s.pdfPages.get(index)); checkAbort(signal); return data;
  }
  async function internalCitation(s, view, overlay, signal) {
    const doc=pdfDocument(view);
    const page=Cu.waiveXrays(await doc.getPage(overlay.position.pageIndex+1)); checkAbort(signal);
    const annotations=Cu.waiveXrays(await page.getAnnotations()); checkAbort(signal);
    const rect=overlay.position.rects[0];
    const matches=annotations.filter(a=>a.rect && a.rect.every((x,i)=>Math.abs(x-rect[i])<.5));
    if(matches.length!==1 || typeof matches[0].dest!=='string' || !/^cite\.[\w.:-]+$/.test(matches[0].dest)) return null;
    const annotation=matches[0];
    const source=await pageData(s,view,overlay.position.pageIndex,signal);
    const number=CitationCore.markerNumber(source.chars,rect);
    return {label:`引用 [${number}] · ${annotation.dest.slice(5)}`,citation:{view,dest:annotation.dest,number}};
  }
  async function rawCitation(s, entry, signal) {
    if(entry.raw) return entry.raw;
    const started=s.win.performance.now();
    try {
      const {view,dest,number}=entry.citation;
      const position=Cu.waiveXrays(await view._getPositionFromDestination(dest)); checkAbort(signal);
      if(!Number.isInteger(position?.pageIndex) || position.pageIndex<0 || !Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new Error('PDF named destination must return a valid pageIndex/x/y position.');
      const target=await pageData(s,view,position.pageIndex,signal);
      const raw=CitationCore.extractNumberedReference(target.chars,[position.x,position.y],number);
      entry.raw=raw; return raw;
    } finally { metrics.maxPdfResolveMs=Math.max(metrics.maxPdfResolveMs,s.win.performance.now()-started); }
  }
  async function openInternal(s, view, popup, generation, mode) {
    s.abort?.abort();
    const abort=s.abort=new s.win.AbortController();
    try {
      const entry=await internalCitation(s,view,popup,abort.signal);
      if(entry && running && generation===s.popupGeneration) show(s,[entry],mode,view);
      else if(!entry && generation===s.popupGeneration) close(s);
    } catch(error) {
      if(error.name!=='AbortError' && generation===s.popupGeneration) { report(error); show(s,[{label:'引用解析失败',error:error.message}],mode,view); }
    }
  }
  async function resolve(s, raw, signal) {
    if (cache.has(raw)) { metrics.cacheHits++; return cache.get(raw); }
    let result;
    const doi = raw.match(/\b10\.\d{4,9}\/[^\s<>]+/i)?.[0].replace(/[.,;:)]+$/, '');
    const arxiv = raw.match(/(?:arxiv\s*[.:]?\s*|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5}(?:v\d+)?)/i);
    if (arxiv) {
      const response = await request(s, 'https://export.arxiv.org/api/query?id_list=' + arxiv[1], signal);
      const xml = new s.win.DOMParser().parseFromString(await response.text(), 'application/xml');
      const entry = xml.querySelector('entry');
      if (!entry || entry.querySelector('id')?.textContent.match(/\/(\d{4}\.\d{4,5})(?:v\d+)?$/)?.[1] !== arxiv[1].replace(/v\d+$/, '')) throw new Error('arXiv did not return the cited identifier ' + arxiv[1]);
      result = { title: entry.querySelector('title')?.textContent.replace(/\s+/g, ' ').trim(), authors: [...entry.querySelectorAll('author > name')].map(x => x.textContent).join(', '), abstract: entry.querySelector('summary')?.textContent.replace(/\s+/g, ' ').trim(), source: 'arXiv · ' + arxiv[1], url: 'https://arxiv.org/abs/' + arxiv[1] };
    } else {
      const response = await request(s, doi ? 'https://api.crossref.org/works/' + encodeURIComponent(doi) : 'https://api.crossref.org/works?rows=5&query.bibliographic=' + encodeURIComponent(raw.slice(0, 1000)) + '&select=title,author,DOI,abstract,published,type,publisher', signal);
      const data = await response.json();
      const matches = doi ? [data.message].filter(work => work.DOI?.toLowerCase() === doi.toLowerCase() && CitationCore.validateCarrier(raw,work)) : data.message.items.filter(work => CitationCore.validate(raw, work));
      if (!matches.length) throw new Error('未找到标题、作者、年份及文献载体一致的记录。未显示猜测结果。');
      if (new Set(matches.map(work => work.DOI.toLowerCase())).size > 1) throw new Error('多个记录符合该引用，无法唯一确认。请核对原始引用中的 DOI 或 arXiv 编号。');
      const work = matches[0];
      result = { title: work.title[0], authors: work.author.map(a => [a.given, a.family].filter(Boolean).join(' ')).join(', '), abstract: '', source: 'Crossref · ' + work.DOI, url: 'https://doi.org/' + work.DOI };
      if (work.abstract) {
        result.abstract = new s.win.DOMParser().parseFromString('<body>' + work.abstract + '</body>', 'text/html').body.textContent;
      } else {
        const oa = await request(s, 'https://api.openalex.org/works/https://doi.org/' + encodeURIComponent(work.DOI), signal);
        const record = await oa.json();
        result.abstract = CitationCore.invertedAbstract(record.abstract_inverted_index);
        result.source += ' · 摘要：OpenAlex';
      }
    }
    if (!result.title || !result.authors) throw new Error('Metadata source omitted the required title or authors.');
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(raw, result);
    return result;
  }
  async function load(s, entry, body, originalText) {
    s.abort?.abort();
    const sequence = ++s.sequence;
    const abort = s.abort = new s.win.AbortController();
    const timer = s.win.setTimeout(() => abort.abort(), 12000);
    body.replaceChildren(); text(s.doc, 'p', '正在核对引用及获取摘要…', body);
    try {
      if(entry.error) throw new Error(entry.error);
      const raw=await rawCitation(s,entry,abort.signal);
      if(sequence!==s.sequence) return;
      originalText.textContent=raw;
      const result = await resolve(s, raw, abort.signal);
      if (sequence !== s.sequence) return;
      body.replaceChildren();
      text(s.doc, 'h2', result.title, body);
      text(s.doc, 'p', result.authors, body).className = 'cp-authors';
      text(s.doc, 'p', result.abstract || '来源未提供摘要。', body).className = 'cp-abstract';
      const source = text(s.doc, 'button', result.source + ' ↗', body);
      source.onclick = () => Zotero.launchURL(result.url);
    } catch (error) {
      if (sequence !== s.sequence) return;
      body.replaceChildren();
      text(s.doc, 'p', error.name === 'AbortError' ? '查询超时或已取消。点击引用重试。' : '引用查询失败：' + error.message, body);
      if (error.name !== 'AbortError') report(error);
    } finally { s.win.clearTimeout(timer); if (sequence === s.sequence) s.abort = null; }
  }
  function show(s, references, mode='explicit', view) {
    const started = s.win.performance.now();
    try {
    beginSession(s,mode,view);
    const refs = references.map(ref => ref.citation || ref.error ? ref : {raw:CitationCore.referenceText(ref),label:CitationCore.referenceText(ref)}).filter(ref=>ref.label);
    if (!refs.length) return;
    const card = s.card = text(s.doc, 'section', '');
    card.className = 'cp-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', '引用论文摘要');
    card.onpointerenter=()=>{s.inside=true;cancelClose(s);};
    card.onpointerleave=()=>{s.inside=false;scheduleClose(s);};
    card.onkeydown=()=>{s.mode='explicit';cancelClose(s);};
    card.onfocusin=()=>{if(s.keyboardInput){s.mode='explicit';cancelClose(s);}};
    const header = text(s.doc, 'div', '', card); header.className = 'cp-header';
    text(s.doc, 'strong', '引用论文', header);
    const dismiss = text(s.doc, 'button', '关闭 ×', header); dismiss.onclick = () => close(s);
    const label = text(s.doc, 'label', `选择引用（${refs.length}）`, card);
    label.className = 'cp-picker';
    const picker = text(s.doc, 'select', '', label); picker.setAttribute('aria-label', '选择引用论文');
    refs.forEach((raw, index) => {
      const option = text(s.doc, 'option', `${index + 1}. ${raw.label.slice(0, 160)}${raw.label.length > 160 ? '…' : ''}`, picker);
      option.value = String(index);
    });
    const body = text(s.doc, 'div', '', card); body.setAttribute('aria-live', 'polite');
    const original = text(s.doc, 'details', '', card);
    text(s.doc, 'summary', '原始参考文献', original);
    const originalText = text(s.doc, 'p', refs[0].raw || refs[0].label, original); originalText.className = 'cp-original';
    picker.onchange = () => { const raw = refs[Number(picker.value)]; originalText.textContent = raw.raw || raw.label; load(s, raw, body, originalText); };
    s.doc.body.append(card); s.doc.documentElement.classList.add('citation-preview-open');
    load(s, refs[0], body, originalText);
    } finally {
      const elapsed = s.win.performance.now() - started;
      metrics.showCalls++; metrics.totalShowMs += elapsed; metrics.maxShowMs = Math.max(metrics.maxShowMs, elapsed);
    }
  }
  function hookView(s, view) {
    if(!view || typeof view._onSetOverlayPopup!=='function' || s.hooks.some(h=>h.view===view && h.wrapped===view._onSetOverlayPopup)) return;
    const reader=s.reader, doc=s.doc;
      const original = view._onSetOverlayPopup;
      const wrapped = function (popup) {
        const result = original.apply(this, arguments);
        const start = s.win.performance.now();
        if (popup && (['citation','reference'].includes(popup.type) && popup.references?.length || popup.type==='internal-link' && popup.source==='annotation')) {
          const mode=hook.activation;
          if(mode==='hover' && !hook.sourceHovered){metrics.hookCalls++;metrics.maxHookMs=Math.max(metrics.maxHookMs,s.win.performance.now()-start);return result;}
          beginSession(s,mode,view);
          const generation=s.popupGeneration;
          s.pendingShow=s.win.setTimeout(()=>{
            s.pendingShow=null;
            if(!running || !states.has(reader) || generation!==s.popupGeneration) return;
            if(popup.type==='internal-link') openInternal(s,view,popup,generation,mode);
            else show(s,popup.references,mode,view);
          },0);
        } else if(!popup) {
          if(s.pendingShow && !s.card) close(s);
          else scheduleClose(s);
        }
        metrics.hookCalls++; metrics.maxHookMs = Math.max(metrics.maxHookMs, s.win.performance.now() - start);
        return result;
      };
      view._onSetOverlayPopup = wrapped;
      const hook={view,original,wrapped,activation:'explicit',sourceHovered:false}; s.hooks.push(hook);
      if(typeof view._getSelectableOverlay==='function') {
        hook.originalHit=view._getSelectableOverlay;
        hook.hit=function(){
          const overlay=hook.originalHit.apply(this,arguments);
          const source=s.sourceView===view ? s.sourceSelected : view._selectedOverlay;
          if(hook.activation==='hover' && source) {
            hook.sourceHovered=overlay===source;
            if(s.mode==='hover' && s.sourceView===view) {
              if(hook.sourceHovered) cancelClose(s); else scheduleClose(s);
            }
          }
          return overlay;
        };
        view._getSelectableOverlay=hook.hit;
      }
      const delayer=view._overlayPopupDelayer;
      if(delayer) {
        hook.delayer=delayer;hook.originalOpen=delayer.open;hook.originalClose=delayer.close;
        hook.open=function(){hook.activation='hover';hook.sourceHovered=true;s.keyboardInput=false;cancelClose(s);return hook.originalOpen.apply(this,arguments);};
        hook.close=function(){hook.sourceHovered=false;const result=hook.originalClose.apply(this,arguments);scheduleClose(s);return result;};
        delayer.open=hook.open;delayer.close=hook.close;
      }
      const bind=()=>{
        if(!running || !s.hooks.includes(hook)) return;
        const target=view._iframeWindow?.document;
        if(!target) return;
        hook.keyTarget=target;
        hook.key=event=>{s.keyboardInput=true;if(event.key==='Enter'||event.key===' '||event.key==='Space')hook.activation='explicit';if(event.key==='Escape'){hook.sourceHovered=false;if(s.card||s.abort||s.pendingShow)close(s);}};
        hook.pointer=()=>{s.keyboardInput=false;};
        target.addEventListener('keydown',hook.key,true);target.addEventListener('pointerdown',hook.pointer,true);
        hook.exitTarget=target.body;hook.exit=()=>{hook.sourceHovered=false;scheduleClose(s);};
        hook.exitTarget.addEventListener('pointerleave',hook.exit);
      };
      if(view.initializedPromise) view.initializedPromise.then(bind).catch(report); else bind();
    }
  function unhookView(h) {
    if(h.view._onSetOverlayPopup===h.wrapped) h.view._onSetOverlayPopup=h.original;
    if(h.hit && h.view._getSelectableOverlay===h.hit) h.view._getSelectableOverlay=h.originalHit;
    if(h.delayer && h.delayer.open===h.open) h.delayer.open=h.originalOpen;
    if(h.delayer && h.delayer.close===h.close) h.delayer.close=h.originalClose;
    if(h.exitTarget)h.exitTarget.removeEventListener('pointerleave',h.exit);
    if(h.keyTarget){h.keyTarget.removeEventListener('keydown',h.key,true);h.keyTarget.removeEventListener('pointerdown',h.pointer,true);}
  }
  function attach(reader, doc) {
    if (!running) return;
    const internal = reader._internalReader;
    const previous=states.get(reader);
    if(previous && previous.internal===internal && previous.doc===doc) {
      for(const view of [internal?._primaryView,internal?._secondaryView]) hookView(previous,view);
      return previous;
    }
    if(previous) dispose(previous,{keepToolbar:previous.doc===doc});
    if (!internal?._primaryView?._onSetOverlayPopup) return;
    const s = { reader, doc, win: doc.defaultView, sequence: 0, hooks: [], inside: false };
    const style = text(doc, 'style', `
.cp-card{position:fixed;right:24px;top:76px;width:min(540px,calc(100vw - 48px));max-height:calc(100vh - 110px);overflow:auto;z-index:2147483646;background:var(--material-background,#fff);color:var(--fill-primary,#222);border:1px solid #999;border-radius:12px;box-shadow:0 8px 32px #0003;padding:18px;font:14px/1.6 system-ui;text-align:left}
.cp-card h2{font-size:19px;line-height:1.35;margin:14px 0 8px}.cp-card p{margin:9px 0}.cp-card button{cursor:pointer;font:inherit;color:inherit;background:transparent;border:1px solid #aaa;border-radius:5px;padding:5px 9px}.cp-header{display:flex;justify-content:space-between;align-items:center}.cp-reference{display:block;width:100%;text-align:left;font-size:11px!important;line-height:1.4!important;max-height:65px;overflow:auto;margin-top:7px}.cp-picker{display:block;margin-top:12px;font-size:12px}.cp-picker select{display:block;width:100%;margin-top:4px;font:inherit;padding:6px;color:inherit;background:var(--material-background,#fff)}.cp-original{font-size:12px}.cp-card details{margin-top:12px}.cp-authors{color:var(--fill-secondary);font-size:12px;max-height:4.8em;overflow:auto}.cp-abstract{white-space:pre-wrap}.citation-preview-open .reference-popup,.citation-preview-open .citation-popup{visibility:hidden}`);
    doc.head.append(style); s.style = style;
    for (const view of [internal._primaryView, internal._secondaryView]) hookView(s,view);
    s.internal=internal;
    if(typeof internal._createView==='function') {
      s.originalCreateView=internal._createView;
      s.createView=function() {
        const oldView=arguments[2]?.sdt ? null : this[arguments[0]?'_primaryView':'_secondaryView'];
        if(oldView) {
          close(s);
          for(const h of s.hooks.filter(h=>h.view===oldView)) unhookView(h);
          s.hooks=s.hooks.filter(h=>h.view!==oldView);
        }
        if(arguments[0] && !arguments[2]?.sdt) s.pdfPages?.clear();
        const view=s.originalCreateView.apply(this,arguments); hookView(s,view); return view;
      };
      internal._createView=s.createView;
    }
    s.key=event=>{s.keyboardInput=true;if(event.key==='Escape' && (s.card||s.abort||s.pendingShow))close(s);else if(s.card?.contains(event.target)){s.mode='explicit';cancelClose(s);}};
    s.pointerInput=()=>{s.keyboardInput=false;};
    doc.addEventListener('pointerdown',s.pointerInput,true);
    doc.addEventListener('keydown', s.key, true);
    s.unload = () => dispose(s);
    s.win.addEventListener('unload', s.unload, { once: true });
    states.set(reader, s); return s;
  }
  function dispose(s, {keepToolbar=false}={}) {
    close(s); s.win.clearTimeout(s.pendingClose);
    for (const h of s.hooks) unhookView(h);
    s.hooks=[];
    if(s.internal?._createView===s.createView) s.internal._createView=s.originalCreateView;
    s.pdfPages?.clear();
    s.style.remove(); s.doc.removeEventListener('keydown', s.key, true);s.doc.removeEventListener('pointerdown',s.pointerInput,true);
    s.win.removeEventListener('unload', s.unload);
    if(!keepToolbar) for (const button of s.doc.querySelectorAll('button.cp-toolbar')) button.remove();
    states.delete(s.reader);
  }
  function toolbar(event) {
    const { reader, doc, append } = event;
    const button = text(doc, 'button', '引用摘要');
    button.className = 'cp-toolbar';
    button.title = '查看当前可见页面的引用论文；悬停正文引用也可打开';
    button.onclick = async () => {
      const s = attach(reader, doc);
      if (!s) { Zotero.alert(Zotero.getMainWindow(), '引用摘要', '阅读器尚未就绪，或此版本不支持引用解析。'); return; }
      const view = reader._internalReader._primaryView;
      const visible = view._iframeWindow.PDFViewerApplication.pdfViewer._getVisiblePages().views;
      const refs = [];
      for (const page of visible) for (const overlay of view._pdfPages[page.id - 1]?.overlays || []) {
        if (overlay.type === 'citation') for (const ref of overlay.references || []) {
          if (!refs.some(x => CitationCore.referenceText(x) === CitationCore.referenceText(ref))) refs.push(ref);
        }
      }
      // Only a deliberate toolbar action inspects visible-page annotation destinations.
      const abort=new s.win.AbortController();
      s.abort?.abort(); s.abort=abort;
      try {
        for(const page of visible) {
          const sourcePage=Cu.waiveXrays(await pdfDocument(view).getPage(page.id)); checkAbort(abort.signal);
          const annotations=Cu.waiveXrays(await sourcePage.getAnnotations()); checkAbort(abort.signal);
          for(const annotation of annotations) {
            const overlays=view._processedPageOverlays?.[page.id-1] || view._pdfPages[page.id-1]?.overlays || [];
            if(overlays.some(o=>o.type==='citation' && o.position.rects.some(r=>r[0]<annotation.rect[2] && r[2]>annotation.rect[0] && r[1]<annotation.rect[3] && r[3]>annotation.rect[1]))) continue;
            if(typeof annotation.dest!=='string' || !/^cite\.[\w.:-]+$/.test(annotation.dest)) continue;
            const source=await pageData(s,view,page.id-1,abort.signal);
            const number=CitationCore.markerNumber(source.chars,annotation.rect);
            if(!refs.some(ref=>ref.citation?.dest===annotation.dest)) refs.push({label:`引用 [${number}] · ${annotation.dest.slice(5)}`,citation:{view,dest:annotation.dest,number}});
          }
        }
      } catch(error) { if(error.name!=='AbortError') { report(error); show(s,[{label:'引用解析失败',error:error.message}]); } return; }
      if (!refs.length) { Zotero.alert(Zotero.getMainWindow(), '引用摘要', '当前可见页没有已解析引用或明确 cite.* 目标的编号引用链接。'); return; }
      show(s, refs);
    };
    append(button);
    reader._initPromise.then(() => attach(reader, doc)).catch(report);
  }
  return {
    version: '0.1.9',
    build: 'native-http-cite-target-hover-lifecycle',
    metrics,
    debugHooks() {
      return [...states.values()].map(s=>({itemID:s.reader.itemID,internalCurrent:s.internal===s.reader._internalReader,primaryHooked:s.hooks.some(h=>h.view===s.reader._internalReader?._primaryView && h.view._onSetOverlayPopup===h.wrapped),createViewHooked:s.internal?._createView===s.createView,hookedViewCount:s.hooks.length,focused:s.reader._internalReader?._primaryView?._focusedObject?.object?.type,selected:s.reader._internalReader?._primaryView?._selectedOverlay?.type}));
    },
    measureResponsiveness({ durationMs = 5000, intervalMs = 50 } = {}) {
      if (!running) throw new Error('Citation Preview is disabled.');
      if (!Number.isFinite(durationMs) || durationMs < 100 || durationMs > 60000 || !Number.isFinite(intervalMs) || intervalMs < 10 || intervalMs > durationMs) throw new Error('Invalid measurement duration/interval.');
      const win = Zotero.getMainWindow();
      return new Promise((resolve, reject) => {
        const samples = []; const start = win.performance.now(); let expected = start + intervalMs; let timer;
        const cancel = () => { win.clearTimeout(timer); measurements.delete(cancel); reject(new Error('Responsiveness measurement cancelled because Citation Preview was disabled.')); };
        measurements.add(cancel);
        const tick = () => {
          const now = win.performance.now(); samples.push(Math.max(0, now - expected));
          if (now - start >= durationMs) {
            measurements.delete(cancel); const sorted = samples.slice().sort((a,b) => a-b);
            resolve({ elapsedMs: now-start, samples: samples.length, meanDelayMs: samples.reduce((a,b)=>a+b,0)/samples.length, maxDelayMs: sorted[sorted.length-1], p95DelayMs: sorted[Math.floor((sorted.length-1)*.95)], metrics: { ...metrics } });
          } else { expected = now + intervalMs; timer = win.setTimeout(tick, intervalMs); }
        };
        timer = win.setTimeout(tick, intervalMs);
      });
    },
    start() {
      running = true;
      Zotero.Reader.registerEventListener('renderToolbar', toolbar, ID);
      for (const reader of Zotero.Reader._readers) {
        const doc = reader._iframeWindow?.document;
        if (doc) { attach(reader, doc); const host = doc.querySelector('.toolbar'); if (host) toolbar({ reader, doc, append: node => host.append(node) }); }
      }
    },
    stop() {
      running = false;
      for (const cancel of measurements) cancel();
      Zotero.Reader.unregisterEventListener('renderToolbar', toolbar);
      for (const s of states.values()) dispose(s);
      states.clear(); cache.clear();
    }
  };
})();
