const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.textContent='';}
 append(el){this.children.push(el);el.parent=this;}
 replaceChildren(){this.children=[];}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 setAttribute(){}
 contains(el){return this===el||this.children.some(x=>x.contains(el));}
}
const contents=el=>[el.textContent,...el.children.map(contents)].join(' ');
test('resolved arXiv card shows source title/authors/abstract and reuses bounded cache', async()=>{
 let requests=0;
 const doc={createElement:tag=>new Element(tag),head:new Element('head'),body:new Element('body'),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){},documentElement:{classList:{add(){},remove(){}}}};
 class DOMParser {parseFromString(){return {querySelector:()=>({querySelector:key=>({textContent:{id:'http://arxiv.org/abs/2405.12399v2',title:'Diffusion for World Modeling: Visual Details Matter in Atari',summary:'A published source abstract.'}[key]}),querySelectorAll:()=>[{textContent:'Eloi Alonso'}]})};}}
 doc.defaultView={performance,setTimeout,clearTimeout,AbortController,DOMParser,addEventListener(){},removeEventListener(){},};
 const view={_onSetOverlayPopup(){}};
 const reader={_internalReader:{_primaryView:view},_iframeWindow:{document:doc}};
 const Zotero={HTTP:{async request(method,url,options){assert.equal(method,'GET');assert.match(url,/id_list=2405.12399$/);assert.equal(options.timeout,12000);assert.equal(options.anon,true);requests++;return {responseText:'<feed/>'};}},Reader:{_readers:[reader],registerEventListener(){},unregisterEventListener(){}},logError:error=>{throw error;}};
 const unwrapped=new WeakMap();
 const context={Zotero,Cu:{waiveXrays:value=>unwrapped.get(value)||value,cloneInto:value=>value},CitationCore:require('../core.js')};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../preview.js'),'utf8'),context);
 const addon=context.CitationPreview;addon.start();
 const popup={type:'citation',references:[{chars:[{c:'Alonso et al. 2024. arXiv:2405.12399'}]}]};
 view._onSetOverlayPopup(popup);await new Promise(r=>setTimeout(r,15));
 assert.match(contents(doc.body),/Diffusion for World Modeling/);assert.match(contents(doc.body),/Eloi Alonso/);assert.match(contents(doc.body),/A published source abstract/);assert.match(contents(doc.body),/arXiv · 2405.12399/);
 view._onSetOverlayPopup(popup);await new Promise(r=>setTimeout(r,15));
 assert.equal(requests,1);assert.equal(addon.metrics.cacheHits,1);assert.equal(addon.metrics.showCalls,2);assert.ok(addon.metrics.maxShowMs>=0);
 const requestsBefore=requests; let pageReads=0,annotationReads=0;
 class PDFPageProxy { async getAnnotations(){annotationReads++;return [{rect:[1,2,3,4],dest:'section.2'}];} }
 const pageWrapper={};unwrapped.set(pageWrapper,new PDFPageProxy());
 assert.equal(typeof pageWrapper.getAnnotations,'undefined');
 view._iframeWindow={PDFViewerApplication:{pdfDocument:{async getPage(){return pageWrapper;},getPageData(){pageReads++;}}}};
 view._onSetOverlayPopup({type:'internal-link',source:'annotation',position:{pageIndex:2,rects:[[1,2,3,4]]}});
 await new Promise(r=>setTimeout(r,15));
 assert.equal(requests,requestsBefore,'Ordinary non-cite internal links never query metadata');
 assert.equal(annotationReads,1,'Awaited cross-realm page is explicitly unwrapped before calling prototype methods');
 assert.equal(pageReads,0,'Ordinary internal links do not read target or source text');
 assert.equal(doc.body.children.length,0,'Previous citation card cannot cover an unrelated link preview');
 let cancelled=0;
 Zotero.HTTP.request=(method,url,options)=>new Promise((resolve,reject)=>options.cancellerReceiver(()=>{cancelled++;reject(new Error('Native HTTP cancellation'));}));
 view._onSetOverlayPopup({type:'citation',references:[{chars:[{c:'arXiv:2506.18095'}]}]});
 await new Promise(r=>setTimeout(r,15));
 addon.stop();await new Promise(r=>setTimeout(r,0));
 assert.equal(cancelled,1,'Closing calls the real HTTP canceller callback');
 assert.equal(doc.body.children.length,0);
});
