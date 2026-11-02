import test from 'node:test';
import assert from 'node:assert/strict';
import {signature} from '../integrations/liqpay.mjs';
import {liqpaySettings,sandboxPayment,recordSandboxCallback} from '../lib/liqpay-service.mjs';
import {readFileSync} from 'node:fs';
const id='11111111-1111-4111-8111-111111111111';
const env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture',PUBLIC_SITE_URL:'https://shop.example',LIQPAY_MODE:'sandbox',LIQPAY_API_VERSION:'7',LIQPAY_PUBLIC_KEY:'sandbox_fixture',LIQPAY_PRIVATE_KEY:'fixture-only'};
function signed(patch={}){
  const data=Buffer.from(JSON.stringify({public_key:env.LIQPAY_PUBLIC_KEY,version:7,action:'pay',currency:'UAH',order_id:id,payment_id:123,amount:'31.50',status:'sandbox',...patch})).toString('base64');
  return [data,signature(data,env.LIQPAY_PRIVATE_KEY,7)];
}
test('payment configuration refuses missing keys, live mode and insecure callbacks',()=>{
  for(const patch of [{LIQPAY_MODE:'live'},{LIQPAY_PUBLIC_KEY:'i_live'},{LIQPAY_PRIVATE_KEY:''},{PUBLIC_SITE_URL:'http://shop.example'},{PUBLIC_SITE_URL:'https://shop.example/path'},{LIQPAY_API_VERSION:''}])assert.throws(()=>liqpaySettings({...env,...patch}));
});
test('sandbox amount comes from persisted order, not request totals',async()=>{
  const checkout=await sandboxPayment(env,id,async(url,opts)=>{
    assert.equal(opts.headers.apikey,env.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(new URL(url).searchParams.get('id'),'eq.'+id);
    return Response.json([{id,total:'31.50',status:'new',payment_method:'card',payment_status:'pending',sandbox_payment_status:'pending',idempotency_key:'reserved-key'}]);
  });
  const p=JSON.parse(Buffer.from(checkout.data,'base64'));assert.equal(p.amount,'31.50');assert.equal(p.server_url,'https://shop.example/api/payments/liqpay');
});
test('closed, COD, paid and unreserved orders cannot start payment',async()=>{
  const row={id,total:31.50,status:'new',payment_method:'card',payment_status:'pending',idempotency_key:'key'};
  for(const patch of [{status:'cancelled'},{payment_method:'cod'},{payment_status:'paid'},{idempotency_key:null},{sandbox_payment_status:'paid'}])await assert.rejects(()=>sandboxPayment(env,id,async()=>Response.json([{...row,...patch}])));
});
test('verified callback sends only canonical facts to durable server RPC',async()=>{
  const [data,sig]=signed();let calls=0;
  const result=await recordSandboxCallback(env,data,sig,async(url,opts)=>{
    calls++;assert.ok(url.endsWith('/rpc/server_record_sandbox_payment'));
    assert.deepEqual(JSON.parse(opts.body).payload,{orderId:id,paymentId:'123',amount:3150,currency:'UAH',status:'sandbox',sandbox:true});
    return Response.json({ok:true,duplicate:false,sandbox:true});
  });assert.equal(calls,1);assert.equal(result.sandbox,true);
});
test('invalid signatures and wrong merchant or currency never reach the database',async()=>{
  const noFetch=()=>{throw Error('must not fetch');};
  const [data]=signed();await assert.rejects(()=>recordSandboxCallback(env,data,'wrong',noFetch));
  for(const patch of [{currency:'USD'},{public_key:'sandbox_other'},{amount:'1.001'}])await assert.rejects(()=>recordSandboxCallback(env,...signed(patch),noFetch));
});
test('SQL ledger guardrails are sandbox-only, durable and service-role restricted (static, not PostgreSQL execution)',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/006_sandbox_payments.sql',import.meta.url),'utf8');
  for(const pattern of [/primary key\(payment_id,status\)/,/pg_advisory_xact_lock/,/for update/,/o.total\*100<>amount_value/,/prior.order_id<>o.id/,/already_paid/,/revoke all on function.*from public,anon,authenticated/])assert.match(sql,pattern);
  assert.doesNotMatch(sql,/set payment_status|set stock|orders_enabled.*true|delete from|drop table/i);
});
