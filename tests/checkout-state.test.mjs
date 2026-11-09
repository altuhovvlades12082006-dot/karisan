import test from 'node:test';import assert from 'node:assert/strict';
import {deliveryAvailability,checkoutMessages,loadCheckoutData} from '../public/checkout-state.js';
test('unavailable saved carrier falls back to configured Nova',()=>{
 assert.deepEqual(deliveryAvailability({nova:true,ukr:false},'ukr'),{available:{nova:true,ukr:false},selected:'nova'});
});
test('Ukrposhta-only configuration works and valid preference is retained',()=>{
 assert.equal(deliveryAvailability({ukr:true},'nova').selected,'ukr');
 assert.equal(deliveryAvailability({nova:true,ukr:true},'ukr').selected,'ukr');
});
test('missing and malformed configuration cannot enable delivery',()=>{
 for(const value of [undefined,null,{}, {nova:'false',ukr:1}])assert.equal(deliveryAvailability(value).selected,null);
});
test('checkout failure and retry copy exists for all storefront languages',()=>{
 for(const lang of ['uk','ru','en'])for(const key of ['loading','failed','retry','none','unavailable'])assert.ok(checkoutMessages[lang][key]);
});
test('checkout loads fresh catalogue/config with bounded requests, without enabling absent carriers',async()=>{
 const calls=[];const data=await loadCheckoutData(async(path,options)=>{calls.push(path);assert.equal(options.cache,'no-store');assert.ok(options.signal);return Response.json(path==='/api/catalog'?[{id:'fixture'}]:{orders:false,delivery:{nova:true,ukr:'true'}});});
 assert.equal(calls.length,2);assert.equal(data.orderAllowed,false);assert.deepEqual(data.config,{nova:true,ukr:false});
});
test('network, HTTP and malformed checkout responses reject instead of silently continuing',async()=>{
 await assert.rejects(()=>loadCheckoutData(async()=>{throw Error('offline')}));
 await assert.rejects(()=>loadCheckoutData(async()=>new Response('',{status:503})));
 await assert.rejects(()=>loadCheckoutData(async path=>Response.json(path==='/api/catalog'?[]:{orders:'true',delivery:{nova:true}})));
});
