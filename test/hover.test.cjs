const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {performance}=require('node:perf_hooks');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.listeners=new Map();this.textContent='';}
 append(el){this.children.push(el);el.parent=this;}
 replaceChildren(){this.children=[];}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 setAttribute(){} contains(el){return this===el||this.children.some(x=>x.contains(el));}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 dispatch(type,event={}){for(const fn of this.listeners.get(type)||[])fn(event);}
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function setup({http}={}){
 const body=new Element('body'),toolbar=new Element('toolbar'),frameBody=new Element('body'),frameDoc=new Element('document');frameDoc.body=frameBody;
 const doc=new Element('document');Object.assign(doc,{createElement:tag=>new Element(tag),head:new Element('head'),body,querySelector:selector=>selector==='.toolbar'?toolbar:null,querySelectorAll:()=>[],documentElement:{classList:{add(){},remove(){}}}});
 class DOMParser{parseFromString(){return {querySelector:()=>({querySelector:key=>({textContent:{id:'http://arxiv.org/abs/2405.12399v2',title:'Diffusion for World Modeling',summary:'Published abstract.'}[key]}),querySelectorAll:()=>[{textContent:'Eloi Alonso'}]})};}}
 doc.defaultView={performance,setTimeout,clearTimeout,AbortController,DOMParser,addEventListener(){},removeEventListener(){}};
 const popup={type:'citation',references:[{chars:[{c:'Alonso 2024 arXiv:2405.12399'}]}]};
 const nativePopups=[];
 const view={hitCalls:0,_getSelectableOverlay(){this.hitCalls++;return this.hitOverlay;},_onSetOverlayPopup(value){nativePopups.push(value);},initializedPromise:Promise.resolve(),_overlayPopupDelayer:{open(ref,callback){callback();},close(){}},_iframeWindow:{document:frameDoc,PDFViewerApplication:{pdfDocument:{async getPage(){return {async getAnnotations(){return [];}}}},pdfViewer:{_getVisiblePages:()=>({views:[{id:1}]})}}},_pdfPages:{0:{overlays:[popup]}}};
 const reader={itemID:1,_initPromise:Promise.resolve(),_internalReader:{_primaryView:view},_iframeWindow:{document:doc}};
 const errors=[];let requests=0;
 const Zotero={HTTP:{request(method,url,options){requests++;return http?http(options):Promise.resolve({responseText:'<feed/>'});}},Reader:{_readers:[reader],registerEventListener(){},unregisterEventListener(){}},logError:e=>errors.push(e)};
 const scope={Zotero,Cu:{waiveXrays:x=>x,cloneInto:x=>x},CitationCore:require('../core.js')};vm.createContext(scope);vm.runInContext(fs.readFileSync(require.resolve('../preview.js'),'utf8'),scope);const addon=scope.CitationPreview,originalOpen=view._overlayPopupDelayer.open,originalClose=view._overlayPopupDelayer.close;addon.start();
 return {addon,view,popup,body,toolbar,frameBody,frameDoc,doc,errors,nativePopups,originalOpen,originalClose,get requests(){return requests;},hover(){view._overlayPopupDelayer.open({},()=>view._onSetOverlayPopup(popup));}};
}
test('native hover close dismisses without waiting for popup(null)',async()=>{
 const h=setup();try{const selection={};h.view._selectedOverlay=selection;h.hover();await pause(15);assert.equal(h.body.children.length,1);assert.equal(h.view._selectedOverlay,selection,'Showing the card must not clear the active native hover selection');h.view._overlayPopupDelayer.close(()=>{});await pause(400);assert.equal(h.body.children.length,0);assert.equal(h.view._selectedOverlay,null);assert.equal(h.nativePopups.at(-1),null);}finally{h.addon.stop();assert.equal(h.view._overlayPopupDelayer.open,h.originalOpen);assert.equal(h.view._overlayPopupDelayer.close,h.originalClose);assert.equal(h.frameBody.listeners.get('pointerleave').size,0);assert.equal(h.frameDoc.listeners.has('pointermove'),false);}
});
test('moving into hover card retains it; leaving card schedules a new close',async()=>{
 const h=setup();try{h.hover();await pause(15);const card=h.body.children[0];h.frameBody.dispatch('pointerleave');assert.equal(typeof card.onpointerenter,'function');card.onpointerenter();await pause(400);assert.equal(h.body.children.length,1);h.doc.activeElement=card.children[1].children[0];h.doc.dispatch('pointerdown');card.onfocusin();card.onpointerleave();await pause(400);assert.equal(h.body.children.length,0);}finally{h.addon.stop();}
});
test('leaving aborts metadata; a late response cannot reopen a closed hover card',async()=>{
 let finish,cancelled=0;const h=setup({http:options=>new Promise(resolve=>{finish=resolve;options.cancellerReceiver(()=>cancelled++);})});
 try{h.hover();await pause(15);h.frameBody.dispatch('pointerleave');await pause(400);assert.equal(cancelled,1);assert.equal(h.body.children.length,0);finish({responseText:'<feed/>'});await pause(15);assert.equal(h.body.children.length,0);assert.equal(h.errors.length,0);}finally{h.addon.stop();}
});
test('leaving during PDF reference parsing prevents late card and network',async()=>{
 const h=setup();let finish;h.view._iframeWindow.PDFViewerApplication.pdfDocument={async getPage(){return {async getAnnotations(){return [{rect:[1,2,3,4],dest:'cite.alonso'}];}}},getPageData(){return new Promise(resolve=>finish=resolve);}};
 try{h.view._overlayPopupDelayer.open({},()=>h.view._onSetOverlayPopup({type:'internal-link',source:'annotation',position:{pageIndex:2,rects:[[1,2,3,4]]}}));await pause(15);h.frameBody.dispatch('pointerleave');await pause(400);finish({chars:[{c:'2',rect:[1,2,3,4]}]});await pause(15);assert.equal(h.body.children.length,0);assert.equal(h.requests,0);assert.equal(h.errors.length,0);}finally{h.addon.stop();}
});
test('keyboard and toolbar cards stay open until Escape or explicit close',async()=>{
 const h=setup();try{await pause(0);h.frameDoc.dispatch('keydown',{key:'Enter'});h.view._onSetOverlayPopup(h.popup);await pause(15);h.view._overlayPopupDelayer.close(()=>{});h.frameBody.dispatch('pointerleave');await pause(400);assert.equal(h.body.children.length,1);h.doc.dispatch('keydown',{key:'Escape'});assert.equal(h.body.children.length,0);await h.toolbar.children[0].onclick();await pause(15);h.frameBody.dispatch('pointerleave');await pause(400);assert.equal(h.body.children.length,1);h.body.children[0].children[0].children[1].onclick();assert.equal(h.body.children.length,0);}finally{h.addon.stop();}
});

test('late native preview callback after reference exit does not start a hover session',async()=>{
 const h=setup();let late;
 try{h.view._overlayPopupDelayer.open({},()=>{late=()=>h.view._onSetOverlayPopup(h.popup);});h.view._overlayPopupDelayer.close(()=>{});late();await pause(15);assert.equal(h.body.children.length,0);assert.equal(h.requests,0);}finally{h.addon.stop();}
});

test('returning to the same reference before timeout retains the hover without another open',async()=>{
 const h=setup();const selection={};h.view._selectedOverlay=selection;h.view.hitOverlay=selection;
 try{h.hover();await pause(15);h.view._overlayPopupDelayer.close(()=>{});await pause(200);assert.equal(h.view._getSelectableOverlay({}),selection);await pause(220);assert.equal(h.body.children.length,1);assert.equal(h.view.hitCalls,1,'Only the existing native hit test is executed');h.view.hitOverlay=null;h.view._getSelectableOverlay({});await pause(200);h.view._getSelectableOverlay({});await pause(200);assert.equal(h.body.children.length,0,'Repeated native misses do not postpone the original close deadline');assert.equal(h.view.hitCalls,3);}finally{h.addon.stop();}
});
