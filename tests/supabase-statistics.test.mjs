import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {supabaseStatistics} from '../lib/supabase-statistics.mjs';
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture'};
test('statistics combine local traffic with only Supabase receipts and current inventory',async()=>{
  const db={prepare(sql){return {bind(){return {sql};},sql};},async batch(queries){assert.equal(queries.length,8);assert.ok(queries.every(q=>!q.sql.includes('sales_ledger')));return [[],[{sessions:7}],[],[],[],[],[{country:'ZZ',sessions:7}],[{value:'fixture-date'}]].map(results=>({results}));}};
  const result=await supabaseStatistics(env,db,{start:'2026-11-01',end:'2026-11-07'},async(url,options)=>{
    if(url.includes('/rpc/')){assert.deepEqual(JSON.parse(options.body),{start_day:'2026-11-01',end_day:'2026-11-07'});return Response.json({gross:3000,refunds:700,paidOrders:2,refundReceipts:1,quantity:3,geography:[],top:[]});}
    assert.ok(url.includes('is_active=eq.true'));return Response.json([{id:'p',names:{uk:'QA'},is_active:true,base_price:10,product_variants:[{id:'v',is_active:true,price:10,stock:2}]}]);
  });
  assert.equal(result.sales.net,2300);assert.equal(result.sales.manualEnabled,false);assert.equal(result.sales.source,'supabase-crm');assert.equal(result.sales.checkoutConnected,false);assert.equal(result.traffic.sessions,7);assert.equal(result.inventory.lowStock[0].stock,2);
});
test('SQL aggregates payment and refund facts by Kyiv dates, never sandbox payment events',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/010_crm_statistics.sql',import.meta.url),'utf8');
  for(const value of ["at time zone 'Europe/Kyiv'",'public.order_transactions',"type='payment'","type='refund'",'from public,anon,authenticated'])assert.ok(sql.includes(value));
  assert.doesNotMatch(sql,/from public\.sandbox_payment_events|sales_ledger/i);
});
test('CRM SQL restricts writes, checks refunds and returns, uses product-first locks and never enables checkout',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/009_transactional_crm.sql',import.meta.url),'utf8');
  for(const value of ['o.version is distinct from','qty>i.quantity-i.returned','amount_value>o.paid-o.refunded','prior.request_hash<>fingerprint',"'catalog:'||product_key",'enable row level security','revoke all on function public.server_reserve_order_v8(jsonb)','create unique index crm_receipt_once'])assert.ok(sql.includes(value),value);
  assert.doesNotMatch(sql,/orders_enabled[^\n]*true|\b(?:delete from|truncate|drop table)\b/i);
});
