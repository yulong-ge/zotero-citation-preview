const {test}=require('node:test');
const assert=require('node:assert/strict');
const {environment,reference,tick}=require('./dom-fixture.cjs');
for(const failure of [false,true])test(`placement follows loading and async ${failure?'failure':'success'} size`,async()=>{
 let complete;
 const e=environment({request:()=>new Promise(resolve=>complete=resolve)});
 e.addon.start();
 const host=e.popup({type:'citation',rect:[480,300,520,320],references:[reference]});
 host.parentNode.getBoundingClientRect=()=>({width:1000,height:800});
 Object.defineProperty(host,'offsetWidth',{get:()=>host.querySelector('h2')?420:host.textContent.includes('引用查询失败')?360:200});
 Object.defineProperty(host,'offsetHeight',{get:()=>host.querySelector('h2')?280:100});
 host.classList.toggle=()=>{};
 await tick();
 assert.equal(host.style.transform,'translate(400px, 330px)','loading card must be anchored before async completion');
 complete({responseText:JSON.stringify({message:{items:failure?[]:[{title:['Diffusion for World Modeling: Visual Details Matter in Atari'],author:[{given:'Eloi',family:'Alonso'}],published:{'date-parts':[[2024]]},DOI:'10.52202/079017-1873',abstract:'<p>Fixture abstract.</p>',type:'proceedings-article'}]}})});
 await tick();await tick();
 assert.equal(host.style.transform,failure?'translate(320px, 330px)':'translate(290px, 330px)');
 e.addon.stop();
});
