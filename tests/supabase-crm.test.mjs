import test from 'node:test';
import assert from 'node:assert/strict';
import {mapOrder,readSupabaseOrders} from '../lib/supabase-crm.mjs';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test'};
test('CRM maps decimal prices into integer kopecks',()=>{
  const o=mapOrder({order_number:'KS-test',total:'31.50',payment_status:'pending',order_items:[{unit_price:'15.75'}]});
  assert.equal(o.amount,3150);assert.equal(o.paid,0);assert.equal(o.items[0].unit_amount,1575);
});
test('CRM is read-only and does not accept orders',async()=>{
  const result=await readSupabaseOrders(env,new URL('https://shop.test/api/admin/crm'),async()=>Response.json([]));
  assert.deepEqual(result,{orders:[],counts:[],accepting:false,readOnly:true});
});
test('invalid order IDs do not query the database',async()=>{
  assert.deepEqual(await readSupabaseOrders(env,new URL('https://shop.test/?view=order&id=invalid'),()=>{throw Error('must not fetch');}),{missing:true});
});
test('private customer and stock views remain blocked',async()=>{
  assert.equal(await readSupabaseOrders(env,new URL('https://shop.test/?view=customers')),null);
});
test('queries stay bounded and sanitized',async()=>{
  await readSupabaseOrders(env,new URL('https://shop.test/?page=-1&q=%25),status.eq.cancelled'),async url=>{
    const u=new URL(url);assert.equal(u.searchParams.get('limit'),'100');assert.equal(u.searchParams.get('offset'),'0');
    assert.ok(!u.searchParams.get('or').includes('status.eq'));return Response.json([]);
  });
});
