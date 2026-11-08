import test from 'node:test';
import assert from 'node:assert/strict';
import {mapOrder,readSupabaseOrders,updateSupabaseCRM,supabaseAccepting} from '../lib/supabase-crm.mjs';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_test'};
test('CRM maps decimal prices into integer kopecks',()=>{
  const o=mapOrder({order_number:'KS-test',total:'31.50',payment_status:'pending',order_items:[{unit_price:'15.75'}]});
  assert.equal(o.amount,3150);assert.equal(o.paid,0);assert.equal(o.items[0].unit_amount,1575);
});
test('CRM actions available while public checkout stays closed by default',async()=>{
  const result=await readSupabaseOrders(env,new URL('https://shop.test/api/admin/crm'),async()=>Response.json([]));
  assert.deepEqual(result,{orders:[],counts:[],accepting:false,readOnly:false});
});
test('invalid order IDs do not query the database',async()=>{
  assert.deepEqual(await readSupabaseOrders(env,new URL('https://shop.test/?view=order&id=invalid'),()=>{throw Error('must not fetch');}),{missing:true});
});
test('customers and stock use server-only Supabase access, not old D1 data',async()=>{
  for(const view of ['customers','stock'])assert.deepEqual(await readSupabaseOrders(env,new URL('https://shop.test/?view='+view),async url=>{
    assert.ok(url.includes(view==='stock'?'/stock_movements?':'/rpc/server_crm_customers'));return Response.json([]);
  }),[]);
});
test('queries stay bounded and sanitized',async()=>{
  await readSupabaseOrders(env,new URL('https://shop.test/?page=-1&q=%25),status.eq.cancelled'),async url=>{
    if(url.includes('/rpc/'))return Response.json([]);
    const u=new URL(url);assert.equal(u.searchParams.get('limit'),'100');assert.equal(u.searchParams.get('offset'),'0');
    assert.ok(!u.searchParams.get('or').includes('status.eq'));return Response.json([]);
  });
});
test('public launch requires runtime approval and the independent database switch',async()=>{
  assert.equal(await supabaseAccepting(env,()=>{throw Error('must not call');}),false);
  await assert.rejects(()=>updateSupabaseCRM(env,{action:'settings',accepting:true,ready:true}),/не дозволено/);
  assert.equal(await supabaseAccepting({...env,SUPABASE_CHECKOUT_ENABLED:'true'},async()=>Response.json([{value:{orders_enabled:false}}])),false);
  assert.equal(await supabaseAccepting({...env,SUPABASE_CHECKOUT_ENABLED:'true'},async()=>Response.json([{value:{orders_enabled:true}}])),true);
});
test('order action carries expected version and operation UUID then reloads durable state',async()=>{
  const id='11111111-1111-4111-8111-111111111111',operation='22222222-2222-4222-8222-222222222222';let calls=0;
  const result=await updateSupabaseCRM(env,{id,operation,version:3,action:'processing'},async(url,options)=>{
    calls++;if(url.includes('/rpc/server_crm_action')){assert.deepEqual(JSON.parse(options.body).payload,{id,operation,version:3,action:'processing'});return Response.json({ok:true});}
    return Response.json([{id,status:'processing',version:4,total:'10.00',paid:0,order_items:[],crm_actions:[{kind:'processing'}]}]);
  });assert.equal(calls,2);assert.equal(result.version,4);assert.equal(result.history[0].kind,'processing');
});
test('customer optimistic conflict cannot silently succeed',async()=>{
  await assert.rejects(()=>updateSupabaseCRM(env,{action:'customer',id:'a'.repeat(64),version:2,name:'QA',email:'',notes:''},async()=>Response.json([])),/вже змінено/);
});
