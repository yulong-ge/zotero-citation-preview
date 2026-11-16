const {test}=require('node:test');const assert=require('node:assert/strict');
const fixture=require('./rlvr-ref-fixture.json');const {environment,tick}=require('./dom-fixture.cjs');
function pdf(e,{destination='cite.alonso2024diffusion',position={pageIndex:12,x:fixture.point[0],y:fixture.point[1]}}={}){
 const wrappers=new WeakMap(),owned=new WeakSet();let reads=0;
 const pageWrapper={};wrappers.set(pageWrapper,{getAnnotations:async()=>[{rect:[1,2,3,4],dest:destination}]});
 const pdfWindow=e.view._iframeWindow={PDFViewerApplication:{}};
 pdfWindow.PDFViewerApplication.pdfDocument={getPage:async n=>{assert.equal(n,3);return pageWrapper;},getPageData:async params=>{assert.ok(owned.has(params),'PDF worker parameters must belong to the reader realm');reads++;return params.pageIndex===2?{chars:[{c:'2',rect:[1,2,3,4]}]}:{chars:fixture.chars};}};
 e.view._getPositionFromDestination=async()=>position;
 e.Cu.waiveXrays=value=>wrappers.get(value)||value;
 e.Cu.cloneInto=(value,target)=>{assert.equal(target,pdfWindow);const clone=structuredClone(value);owned.add(clone);return clone;};
 return {get reads(){return reads;}};
}
const overlay=()=>({type:'internal-link',source:'annotation',position:{pageIndex:2,rects:[[1,2,3,4]]}});
test('verified native cite preview uses waived PDF APIs, reader-realm worker parameters and exact numbered boundary',async()=>{
 const e=environment(),state=pdf(e);e.addon.start();const host=e.popup(overlay());await tick();await tick();
 assert.equal(e.errors.length,0);assert.equal(state.reads,2);assert.equal(e.urls.length,1);
 assert.equal(host.querySelector('.cp-native-metadata').getAttribute('data-cp-citation-verified'),'true');assert.match(host.textContent,/Diffusion for World Modeling/);assert.doesNotMatch(host.textContent,/Kevin Black/);
 e.close(host);await tick();const again=e.popup(overlay());await tick();await tick();assert.equal(e.urls.length,1);assert.equal(e.addon.metrics.cacheHits,1);assert.equal(state.reads,2);assert.ok(again.querySelector('.cp-native-metadata'));
 e.addon.stop();assert.equal(again.classList.contains('cp-reference-enhanced'),false);assert.ok(again.querySelector('.inner'));
});
test('ordinary chapter/figure native preview keeps all native DOM and performs no metadata requests or text reads',async()=>{
 const e=environment(),state=pdf(e,{destination:'figure.3'});e.addon.start();const params=overlay();params.rect=[480,300,520,320];const host=e.popup(params),inner=host.querySelector('.inner');
 host.style.transform='translate(123px, 456px)';host.parentNode.getBoundingClientRect=()=>({width:1000,height:800});Object.defineProperties(host,{offsetWidth:{value:200},offsetHeight:{value:100}});await tick();await tick();assert.equal(host.style.transform,'translate(123px, 456px)');
 assert.equal(e.urls.length,0);assert.equal(state.reads,0);assert.equal(host.querySelector('.cp-native-metadata'),null);assert.equal(host.classList.contains('cp-reference-enhanced'),false);assert.equal(inner.isConnected,true);assert.equal(e.errors.length,0);e.addon.stop();
});
test('invalid named-destination API shape produces an explicit native-popup error and no metadata request',async()=>{
 const e=environment();pdf(e,{position:{pageIndex:12,rects:[fixture.point]}});e.addon.start();const host=e.popup(overlay());await tick();await tick();
 assert.match(host.textContent,/valid pageIndex\/x\/y/);assert.equal(e.urls.length,0);assert.equal(e.errors.length,1);assert.equal(host.classList.contains('cp-reference-enhanced'),false);e.addon.stop();
});
test('a numbered-boundary mismatch preserves the native preview and never queries metadata',async()=>{
 const e=environment();pdf(e);const doc=e.view._iframeWindow.PDFViewerApplication.pdfDocument;const original=doc.getPageData;
 doc.getPageData=async params=>params.pageIndex===2?{chars:[{c:'9',rect:[1,2,3,4]}]}:original(params);
 e.addon.start();const host=e.popup(overlay());await tick();await tick();assert.equal(e.urls.length,0);assert.equal(e.errors.length,1);assert.match(host.textContent,/引用解析失败/);assert.equal(host.classList.contains('cp-reference-enhanced'),false);e.addon.stop();
});
test('native close during pending PDF text extraction cancels continuation before target-page or metadata work',async()=>{
 const e=environment();pdf(e);let complete;
 e.view._iframeWindow.PDFViewerApplication.pdfDocument.getPageData=()=>new Promise(resolve=>{complete=resolve;});
 e.addon.start();const host=e.popup(overlay());await tick();assert.equal(e.addon.metrics.pdfPageReads,1);
 e.close(host);await tick();assert.equal(e.addon.metrics.cancellations,1);
 complete({chars:[{c:'2',rect:[1,2,3,4]}]});await tick();
 assert.equal(e.urls.length,0);assert.equal(e.addon.metrics.pdfPageReads,1);assert.equal(e.doc.querySelector('.cp-native-metadata'),null);assert.equal(e.errors.length,0);e.addon.stop();
});
test('verified citation styling survives native React class rewrites and keeps its state on plugin-owned DOM',async()=>{
 const e=environment();pdf(e);e.addon.start();const host=e.popup(overlay());await tick();await tick();
 const metadata=host.querySelector('.cp-native-metadata');assert.equal(metadata.getAttribute('data-cp-citation-verified'),'true','verification state must be stored on our metadata node');
 assert.equal(host.classList.contains('cp-reference-enhanced'),false,'never add state classes to the React-owned popup');
 host.className='view-popup preview-popup page-popup-top-center';
 assert.equal(metadata.getAttribute('data-cp-citation-verified'),'true');
 assert.match(e.doc.head.textContent,/\.preview-popup:has\(> \.cp-native-metadata\[data-cp-named-citation\]\)\s*>\s*\.inner\{display:none\}/);
 e.addon.stop();assert.equal(host.className,'view-popup preview-popup page-popup-top-center');assert.equal(host.querySelector('.cp-native-metadata'),null);
});
test('verified preview has a stable bounded host and only its metadata owns scrolling',async()=>{
 const e=environment();pdf(e);e.addon.start();const host=e.popup(overlay());await tick();await tick();
 const css=e.doc.head.textContent;
 const style=css.match(/\.preview-popup:has\(> \.cp-native-metadata\[data-cp-named-citation\]\)\{([^}]+)\}/)[1];
 assert.doesNotMatch(style,/overflow:auto/,'the native host must not add a second scrollbar');
 assert.match(style,/height:min\(300px,40vh\)/);
 assert.match(css,/\.preview-popup>\.cp-native-metadata\[data-cp-named-citation\]\{height:100%;max-height:100%\}/);
 e.addon.stop();
});
test('content-realm reference arrays reject privileged object returns while primitive character maps remain valid',async()=>{
 const rejected=[];let characterMaps=0;
 function contentArray(items){return new Proxy(items,{get(target,key,receiver){
  if(key==='map')return callback=>contentArray(Array.prototype.map.call(target,(value,index)=>{const result=callback(value,index,receiver);if(result!==null&&(typeof result==='object'||typeof result==='function')){rejected.push(result);throw new Error('Permission denied to pass object to privileged code');}characterMaps++;return result;}));
  if(key==='filter')return callback=>contentArray(Array.prototype.filter.call(target,callback));
  return Reflect.get(target,key,receiver);
 }});}
 const e=environment();e.addon.start();
 const nativeReference={chars:contentArray(require('./dom-fixture.cjs').reference.chars)};
 const host=e.popup({type:'citation',references:contentArray([nativeReference])});await tick();await tick();
 assert.equal(rejected.length,0,'content Array.map must never receive a privileged entry object');assert.ok(characterMaps>0,'native char maps still cross only primitive strings');
 assert.equal(e.errors.length,0,e.errors.map(error=>error.message).join(';'));assert.equal(e.urls.length,1);assert.match(host.textContent,/Real source abstract fixture/);e.addon.stop();
});
test('failed named citations still use the compact card and hide empty original-reference disclosure',async()=>{
 const e=environment();pdf(e,{position:{pageIndex:12,x:0,y:9999}});e.addon.start();
 const host=e.popup(overlay());await tick();await tick();
 assert.match(host.textContent,/引用解析失败/);
 assert.equal(host.querySelector('.cp-native-metadata').getAttribute('data-cp-named-citation'),'true');
 assert.equal(host.querySelector('details').hidden,true);assert.equal(e.urls.length,0);e.addon.stop();
});
