import test from 'node:test';import assert from 'node:assert/strict';
import {novaCities,novaBranches,novaQuote,verifyNovaSelection} from '../integrations/nova-poshta.mjs';
import {validateCheckout,orderSnapshot} from '../lib/order-validation.mjs';
import {DatabaseSync} from 'node:sqlite';
const city='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222',locker='33333333-3333-4333-8333-333333333333',sender='44444444-4444-4444-8444-444444444444';
const env={NOVA_POSHTA_API_KEY:'fixture-only',NOVA_POSHTA_SENDER_CITY_REF:sender};
const points=[{Ref:branch,CityRef:city,Number:'1',CityDescription:'Київ',Description:'Відділення №1',CategoryOfWarehouse:'Branch',WarehouseStatus:'Working'},{Ref:locker,CityRef:city,Number:'100',CityDescription:'Київ',Description:'Поштомат №100',CategoryOfWarehouse:'Postomat',WarehouseStatus:'Working'}];
const selection={carrier:'nova',country:'UA',city:'forged city',branch:'forged label',cityRef:city,branchRef:branch,branchNumber:'1',type:'branch'};
const mock=data=>async(url,options)=>{assert.equal(url,'https://api.novaposhta.ua/v2.0/json/');assert.equal(JSON.parse(options.body).apiKey,'fixture-only');return Response.json({success:true,data});};
test('cities keep canonical Ref and paginate without exposing the server key',async()=>{
  const r=await novaCities(env,{q:'Ки',page:2},async(url,opts)=>{const b=JSON.parse(opts.body);assert.equal(b.calledMethod,'getCities');assert.equal(b.methodProperties.Page,'2');return Response.json({success:true,data:[{Ref:city,Description:'Київ',AreaDescription:'Київська'}]});});
  assert.equal(r.cities[0].id,city);assert.equal(r.hasMore,false);assert.ok(!JSON.stringify(r).includes('fixture-only'));
});
test('warehouse and locker selection are separated, refs retained and closed/wrong-city points excluded',async()=>{
  const fetcher=mock([...points,{...points[0],CityRef:sender},{...points[0],WarehouseStatus:'Closed'}]);
  assert.deepEqual((await novaBranches(env,{cityRef:city,type:'branch'},fetcher)).branches.map(x=>x.id),[branch]);
  assert.deepEqual((await novaBranches(env,{cityRef:city,type:'postomat'},fetcher)).branches.map(x=>x.id),[locker]);
});
test('pagination uses raw page size even if type filter removes every result',async()=>{
  const r=await novaBranches(env,{cityRef:city,type:'postomat',page:3},mock(Array.from({length:200},()=>points[0])));
  assert.equal(r.hasMore,true);assert.equal(r.page,3);assert.equal(r.branches.length,0);
});
test('invalid refs/type/page and absent key are rejected before contacting carrier',async()=>{
  const no=()=>{throw Error('must not fetch');};
  for(const body of [{cityRef:'wrong'},{cityRef:city,page:0},{cityRef:city,page:501},{cityRef:city,type:'unknown'}])await assert.rejects(()=>novaBranches(env,body,no),e=>['invalid_page','invalid_selection'].includes(e.message));
  await assert.rejects(()=>novaCities({}, {q:'Київ'},no),e=>e.message==='not_configured');
});
test('server rejects forged branch Ref/type and replaces client text with carrier labels',async()=>{
  const r=await verifyNovaSelection(env,selection,mock(points));assert.equal(r.branchRef,branch);assert.equal(r.branch,'Київ · Відділення №1');assert.equal(r.city,'Київ');assert.equal(r.verified,true);
  for(const change of [{branchRef:sender},{cityRef:sender},{type:'postomat'},{branchNumber:'2'}])await assert.rejects(()=>verifyNovaSelection(env,{...selection,...change},mock(points)));
});
test('quote uses server sender city, kopecks and returns an estimate, not a charged fee',async()=>{
  const q=await novaQuote(env,{...selection,chargeableWeightKg:2.5,declaredAmount:78500,CitySender:'forged'},async(url,opts)=>{
    const b=JSON.parse(opts.body);if(b.calledMethod==='getWarehouses')return Response.json({success:true,data:points});
    assert.equal(b.calledMethod,'getDocumentPrice');assert.equal(b.methodProperties.CitySender,sender);assert.equal(b.methodProperties.Cost,'785.00');assert.equal(b.methodProperties.Weight,'2.5');return Response.json({success:true,data:[{Cost:'95.50'}]});
  });assert.equal(q.amount,9550);assert.equal(q.estimate,true);assert.equal(q.includesCodFee,false);
});
test('quotes refuse missing origin and guessed/invalid parcel values',async()=>{
  const no=()=>{throw Error('must not fetch');};
  await assert.rejects(()=>novaQuote({...env,NOVA_POSHTA_SENDER_CITY_REF:''},{},no),/sender_not_configured/);
  for(const change of [{chargeableWeightKg:0},{chargeableWeightKg:'2'},{declaredAmount:1.2},{declaredAmount:0}])await assert.rejects(()=>novaQuote(env,{...selection,chargeableWeightKg:2,declaredAmount:50000,...change},no));
});
test('provider failures never return raw upstream details or keys',async()=>{
  await assert.rejects(()=>novaCities(env,{q:'Київ'},async()=>Response.json({success:false,errors:['fixture-only secret']})),e=>e.message==='carrier_unavailable');
});
test('validated canonical refs survive actual SQLite JSON order snapshot storage (not full D1 checkout E2E)',async()=>{
  const d=await verifyNovaSelection(env,selection,mock(points));
  const b=validateCheckout({key:'a'.repeat(64),consent:true,customer:{name:'Fixture test',phone:'+380670000001'},delivery:d,payment:'cod',items:[{product:'p',variant:'v',qty:1,expectedAmount:100}]});
  const db=new DatabaseSync(':memory:');try{db.exec('CREATE TABLE orders(data TEXT NOT NULL)');db.prepare('INSERT INTO orders(data) VALUES (?)').run(JSON.stringify(orderSnapshot(b)));const row=db.prepare("SELECT json_extract(data,'$.delivery.branchRef') AS ref,json_extract(data,'$.delivery.cityRef') AS city FROM orders").get();assert.equal(row.ref,branch);assert.equal(row.city,city);}finally{db.close();}
});
