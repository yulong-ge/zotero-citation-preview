const {test}=require('node:test');const assert=require('node:assert/strict');const {environment,reference,tick}=require('./dom-fixture.cjs');
test('same reference reuses metadata cache but never recreates a native popup',async()=>{
 const e=environment();e.addon.start();const first=e.popup({type:'citation',references:[reference]});await tick();await tick();e.close(first);await tick();assert.equal(e.doc.querySelector('.view-popup'),null);
 const second=e.popup({type:'citation',references:[reference]});await tick();await tick();assert.equal(e.urls.length,1);assert.equal(e.addon.metrics.cacheHits,1);assert.match(second.textContent,/Real source abstract fixture/);e.addon.stop();
});
test('a rejected metadata match remains an explicit error within the original native popup',async()=>{
 const e=environment({request:async()=>({responseText:JSON.stringify({message:{items:[]}})})});e.addon.start();const host=e.popup({type:'citation',references:[reference]});await tick();await tick();assert.match(host.textContent,/未找到标题、作者、年份及文献载体一致/);assert.equal(e.errors.length,1);assert.equal(host.isConnected,true);e.addon.stop();
});
test('changing reference cancels the old request; late completion cannot overwrite the selected reference',async()=>{
 const pending=[],cancelled=[];
 const e=environment({request:(method,url,options)=>new Promise(resolve=>{pending.push(resolve);options.cancellerReceiver(()=>cancelled.push(url));})});e.addon.start();
 const second={chars:[...'[3] Kevin Black et al. Diffusion Policy for Robot Learning. 2023.'].map(c=>({c}))};
 const host=e.popup({type:'citation',references:[reference,second]});await tick();const select=host.querySelector('select');select.value='1';select.onchange();await tick();assert.equal(pending.length,2);assert.equal(cancelled.length,1);
 pending[0]({responseText:JSON.stringify({message:{items:[]}})});await tick();
 e.close(host);await tick();assert.equal(cancelled.length,2,'late completion must not erase the newer request cancellation handle');
 pending[1]({responseText:JSON.stringify({message:{items:[]}})});await tick();assert.equal(e.errors.length,0);assert.equal(e.doc.querySelector('.view-popup'),null);e.addon.stop();
});
