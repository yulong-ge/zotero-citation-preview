const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {performance}=require('node:perf_hooks');
const fixture=require('./rlvr-ref-fixture.json');
class Element{constructor(tag){this.tag=tag;this.children=[];this.textContent='';}append(el){this.children.push(el);el.parent=this;}replaceChildren(){this.children=[];}remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}setAttribute(){}contains(el){return this===el||this.children.some(x=>x.contains(el));}}
const contents=el=>[el.textContent,...el.children.map(contents)].join(' ');
test('named citation crosses PDF worker with reader-realm parameters and exact target boundary',async()=>{
 const errors=[],owned=new WeakSet(),wrappers=new WeakMap();let pageReads=0,requests=0;
 const doc={createElement:tag=>new Element(tag),head:new Element('head'),body:new Element('body'),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){},documentElement:{classList:{add(){},remove(){}}}};
 doc.defaultView={performance,setTimeout,clearTimeout,AbortController,DOMParser:class{parseFromString(){return {body:{textContent:'Metadata abstract from the mocked publisher.'}};}},addEventListener(){},removeEventListener(){}};
 const view={_onSetOverlayPopup(){},async _getPositionFromDestination(dest){assert.equal(dest,'cite.alonso2024diffusion');return {pageIndex:12,x:fixture.point[0],y:fixture.point[1]};}};
 const pdfWindow=view._iframeWindow={PDFViewerApplication:{}};
 const pageWrapper={};wrappers.set(pageWrapper,{async getAnnotations(){return [{rect:[1,2,3,4],dest:'cite.alonso2024diffusion'}];}});
 pdfWindow.PDFViewerApplication.pdfDocument={async getPage(n){assert.equal(n,3);return pageWrapper;},async getPageData(params){assert.ok(owned.has(params),'PDF worker requires an object cloned into the reader realm');pageReads++;return params.pageIndex===2?{chars:[{c:'2',rect:[1,2,3,4]}]}:{chars:fixture.chars};}};
 const reader={itemID:1,_internalReader:{_primaryView:view},_iframeWindow:{document:doc}};
 const Zotero={HTTP:{async request(method,url){requests++;assert.match(url,/api.crossref.org/);return {responseText:JSON.stringify({message:{items:[{title:['Diffusion for World Modeling: Visual Details Matter in Atari'],author:[{given:'Eloi',family:'Alonso'}],published:{'date-parts':[[2024]]},DOI:'10.52202/079017-1873',abstract:'<p>metadata</p>'}]}})};}},Reader:{_readers:[reader],registerEventListener(){},unregisterEventListener(){}},logError:e=>errors.push(e)};
 const Cu={waiveXrays:value=>wrappers.get(value)||value,cloneInto(value,target){assert.equal(target,pdfWindow);const copy=structuredClone(value);owned.add(copy);return copy;}};
 const context={Zotero,Cu,CitationCore:require('../core.js')};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../preview.js'),'utf8'),context);const addon=context.CitationPreview;addon.start();
 view._onSetOverlayPopup({type:'internal-link',source:'annotation',position:{pageIndex:2,rects:[[1,2,3,4]]}});
 await new Promise(r=>setTimeout(r,30));
 assert.equal(errors.length,0,errors.map(e=>e.message).join(';'));assert.equal(pageReads,2);assert.equal(requests,1);assert.match(contents(doc.body),/Diffusion for World Modeling/);assert.doesNotMatch(contents(doc.body),/Kevin Black/);
 view._getPositionFromDestination=async()=>({pageIndex:12,rects:[fixture.point]});
 view._onSetOverlayPopup({type:'internal-link',source:'annotation',position:{pageIndex:2,rects:[[1,2,3,4]]}});
 await new Promise(r=>setTimeout(r,20));
 assert.match(contents(doc.body),/valid pageIndex\/x\/y/);assert.equal(requests,1,'Invalid destination shape does not query metadata');
 addon.stop();
});
