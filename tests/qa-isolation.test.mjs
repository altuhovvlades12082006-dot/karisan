import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {orderPayload} from '../lib/supabase-checkout.mjs';
import {readSupabaseOrders} from '../lib/supabase-crm.mjs';
test('public order serializer never forwards a client QA bypass flag',()=>{
  const checkout={is_test:true,customer:{name:'QA',email:'',phone:'+380670000001'},delivery:{carrier:'nova'},items:[],comment:''};
  assert.equal(orderPayload(checkout,{carrier:'nova',verified:true},'a'.repeat(64)).is_test,undefined);
});
test('default admin order listing excludes QA even with a user-supplied include_test parameter',async()=>{
  const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture'};
  await readSupabaseOrders(env,new URL('https://local/?include_test=true'),async url=>{
    if(url.includes('/orders?'))assert.equal(new URL(url).searchParams.get('is_test'),'eq.false');return Response.json([]);
  });
});
test('QA database gate is transaction-local, restricted to flagged products and restored',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/012_isolated_qa_orders.sql',import.meta.url),'utf8');
  for(const text of ['p.is_test<>testing','qa_disabled_when_live','set value=original_settings','is_test=testing','qa-customer:',"where not is_test",'from public,anon,authenticated'])assert.ok(sql.includes(text),text);
  assert.ok(sql.indexOf('set value=original_settings')<sql.indexOf("'created',payload->>'idempotency_key'"));
});
