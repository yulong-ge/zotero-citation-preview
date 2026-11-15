const {test}=require('node:test');const assert=require('node:assert/strict');const {environment,reference,tick}=require('./dom-fixture.cjs');
test('plugin keeps the native popup alive until native DOM removal; no plugin hover timers or listeners exist',async()=>{
 const e=environment();e.addon.start();const host=e.popup({type:'citation',references:[reference]});await tick();await tick();
 assert.equal(host.onpointerenter,undefined);assert.equal(host.onpointerleave,undefined);assert.equal(host.onkeydown,undefined);
 assert.equal(host.isConnected,true);e.close(host);await tick();assert.equal(e.doc.querySelector('.cp-native-metadata'),null);e.addon.stop();
});
test('native popup replacement cancels pending metadata before enhancing the new popup',async()=>{
 const pending=[];let cancels=0;
 const e=environment({request:(method,url,options)=>new Promise(resolve=>{pending.push(resolve);options.cancellerReceiver(()=>cancels++);})});e.addon.start();
 const first=e.popup({type:'citation',references:[reference]});await tick();e.close(first);const second=e.popup({type:'reference',references:[reference]});await tick();assert.equal(cancels,1);assert.equal(pending.length,2);
 e.addon.stop();assert.equal(cancels,2);assert.equal(second.isConnected,true);assert.equal(second.querySelector('.cp-native-metadata'),null);
 for(const resolve of pending)resolve({responseText:JSON.stringify({message:{items:[]}})});await tick();assert.equal(e.errors.length,0);
});
