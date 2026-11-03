import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePhone,phoneCountries,countryCodes} from '../public/phone.js';
import {validateCheckout} from '../lib/order-validation.mjs';
test('Ukraine is the default; country names localize without an external widget',()=>{
  for(const lang of ['uk','ru','en'])assert.equal(phoneCountries(lang)[0].id,'UA');
  assert.ok(Object.keys(countryCodes).length>=240);assert.equal(countryCodes.CZ,'420');assert.equal(countryCodes.US,'1');
});
test('international and Ukrainian input normalize consistently',()=>{
  for(const [input,expected] of [['067 000 00 01','+380670000001'],['+380 (067) 000-00-01','+380670000001'],['380670000001','+380670000001'],['+420 777 123 456','+420777123456'],['0044 7700 900123','+447700900123'],['+1 (202) 555-0123','+12025550123'],['+39 06 6982 0000','+390669820000'],['+61 412 345 678','+61412345678']])assert.equal(normalizePhone(input),expected);
});
test('malformed, missing, overlong and unsupported-code input is rejected',()=>{
  for(const input of [null,123,'+380','+0001234567','+999123456789','+420callme','++420777123456','+380123','+1234567890123456','+420777123456 ext 2'])assert.throws(()=>normalizePhone(input));
});
test('server accepts international contact while keeping delivery Ukrainian',()=>{
  const b={key:'a'.repeat(64),consent:true,customer:{name:'Test customer',phone:'+420777123456'},delivery:{carrier:'nova',city:'Київ',branch:'1'},payment:'cod',items:[{product:'p',variant:'v',qty:1,expectedAmount:100}]};
  const r=validateCheckout(b);assert.equal(r.customer.phone,'+420777123456');assert.equal(r.delivery.country,'UA');
});
