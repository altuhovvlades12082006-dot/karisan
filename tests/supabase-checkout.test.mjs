import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orderPayload} from '../lib/supabase-checkout.mjs';
import {mapOrder} from '../lib/supabase-crm.mjs';
const checkout={customer:{name:'QA',email:'',phone:'+380501234567'},delivery:{carrier:'nova'},comment:'',items:[{product:'p',variant:'v',qty:2,expectedAmount:1200,pillow:'50x70'}]};
test('verified Nova refs and pillow choice survive SQL payload and admin mapping',()=>{
  const p=orderPayload(checkout,{carrier:'nova',verified:true,city:'Київ',branch:'Поштомат',cityRef:'city-ref',branchRef:'office-ref',branchNumber:'123',type:'postomat'},'a'.repeat(64));
  assert.equal(p.branch_id,'office-ref');assert.equal(p.city_id,'city-ref');
  assert.deepEqual(p.items,[{product_id:'p',variant_id:'v',quantity:2,expected_amount:1200,pillow:'50x70'}]);
  const mapped=mapOrder({carrier:p.carrier,delivery_reference:{branch_id:p.branch_id,city_id:p.city_id,branch_number:p.branch_number,type:p.delivery_type}});
  assert.equal(mapped.data.delivery.branchRef,'office-ref');assert.equal(mapped.data.delivery.type,'postomat');
});
test('unverified or wrong-carrier selections cannot be serialized',()=>{
  assert.throws(()=>orderPayload(checkout,{carrier:'nova'},'key'));
  assert.throws(()=>orderPayload(checkout,{carrier:'ukr',verified:true},'key'));
});
test('Ukrposhta office ID is distinct from Nova Ref in admin',()=>{
  const p=orderPayload({...checkout,delivery:{carrier:'ukr'}},{carrier:'ukr',verified:true,branchId:'1234',postcode:'01001'},'key');
  assert.equal(p.branch_id,'1234');
  const mapped=mapOrder({carrier:'ukr',delivery_reference:{branch_id:p.branch_id}});
  assert.equal(mapped.data.delivery.branchId,'1234');assert.equal(mapped.data.delivery.branchRef,'');
});
// Static regression guards, NOT PostgreSQL execution or concurrency tests.
test('008 guards nullable price, product identity, stock version and service-only access',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/008_order_stock_safety.sql',import.meta.url),'utf8');
  for(const fragment of ['variant.price is null','variant.product_id is distinct from',"'catalog:'||product_key",'version=version+1','delivery_not_verified','idempotency_conflict','invalid_pillow','orders_disabled','card_not_enabled','from public,anon,authenticated'])assert.ok(sql.includes(fragment),fragment);
  assert.doesNotMatch(sql,/\b(?:delete from|truncate|drop table)\b/i);
  assert.ok(sql.indexOf("'catalog:'||product_key")<sql.indexOf('order by v.id for update'));
});
