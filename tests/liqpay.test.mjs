import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {signature,createSandboxCheckout,verifySandboxCallback,amountInKopecks} from '../integrations/liqpay.mjs';
const config={mode:'sandbox',version:7,publicKey:'sandbox_fixture',privateKey:'fixture-only-not-a-real-key',webhookUrl:'https://example.test/api/payments/liqpay',resultUrl:'https://example.test/'};
const order={id:'fixture-order',amount:12345,currency:'UAH',payment:'card',paymentStatus:'pending'};
function callback(patch={},c=config){const value={public_key:c.publicKey,version:c.version,action:'pay',currency:'UAH',order_id:order.id,payment_id:123,status:'sandbox',amount:'123.45',...patch};const data=Buffer.from(JSON.stringify(value)).toString('base64');return [data,signature(data,c.privateKey,c.version),c];}
test('LiqPay v7 and legacy v3 signatures use explicitly configured algorithms',()=>{
  assert.equal(signature('fixture','key',7),createHash('sha3-256').update('keyfixturekey').digest('base64'));
  assert.equal(signature('fixture','key',3),createHash('sha1').update('keyfixturekey').digest('base64'));
  assert.throws(()=>signature('fixture','key',8));
});
test('sandbox checkout binds stored kopecks, order ID and HTTPS callback',()=>{
  const result=createSandboxCheckout(order,config),p=JSON.parse(Buffer.from(result.data,'base64'));
  assert.equal(p.amount,'123.45');assert.equal(p.order_id,order.id);assert.equal(p.version,7);
  assert.equal(result.signature,signature(result.data,config.privateKey,7));
});
test('real payment credentials and mode cannot activate online payment',()=>{
  assert.throws(()=>createSandboxCheckout(order,{...config,mode:'live'}));
  assert.throws(()=>createSandboxCheckout(order,{...config,publicKey:'i_live'}));
  assert.throws(()=>createSandboxCheckout(order,{...config,version:undefined}));
});
test('rejects unreserved/non-card/paid orders and insecure callback URL',()=>{
  for(const change of [{amount:0},{amount:1.1},{payment:'cod'},{paymentStatus:'paid'},{currency:'USD'},{id:'../x'}])assert.throws(()=>createSandboxCheckout({...order,...change},config));
  assert.throws(()=>createSandboxCheckout(order,{...config,webhookUrl:'http://example.test/'}));
});
test('verifies signed sandbox facts without declaring order paid',()=>{
  const result=verifySandboxCallback(...callback());assert.equal(result.amount,12345);assert.equal(result.sandbox,true);assert.equal(result.paymentId,'123');
  assert.equal(verifySandboxCallback(...callback({status:'processing'})).status,'processing');
});
test('rejects modified data, wrong signature/key/version/currency and oversized input',()=>{
  const [data,sig]=callback();assert.throws(()=>verifySandboxCallback(data,sig.replace(/^./,sig[0]==='A'?'B':'A'),config));
  assert.throws(()=>verifySandboxCallback(data+'AAAA',sig,config));
  for(const patch of [{public_key:'other'},{version:3},{currency:'USD'},{action:'refund'},{payment_id:null},{status:'unknown'}])assert.throws(()=>verifySandboxCallback(...callback(patch)));
  assert.throws(()=>verifySandboxCallback('A'.repeat(24004),sig,config));
});
test('money parsing never rounds malicious fractions/exponents into a valid payment',()=>{
  assert.equal(amountInKopecks('0.01'),1);assert.equal(amountInKopecks('123.4'),12340);
  for(const x of ['-1','1.001','1e2','NaN','Infinity','0','1000001',null])assert.throws(()=>amountInKopecks(x));
});
