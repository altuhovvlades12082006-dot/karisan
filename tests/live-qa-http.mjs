// Real HTTP -> Nova verification -> transactional Supabase -> actual admin API.
// Start live-qa-server first. Only its QA products/orders are touched.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
if(!process.argv.includes('--run-supabase'))throw Error('Explicit --run-supabase required');
const base='http://127.0.0.1:5174',main='http://127.0.0.1:5173';
const info=await(await fetch(base+'/qa-info')).json();
const data=async response=>{assert.equal(response.status,200,await response.clone().text());return response.json();};
const cities=await data(await fetch(base+'/api/delivery?carrier=nova&action=cities&q='+encodeURIComponent('Київ'))),city=cities.cities.find(c=>c.name==='Київ');assert.ok(city);
const branches=await data(await fetch(base+'/api/delivery?carrier=nova&cityRef='+city.id+'&type=branch&q=1')),branch=branches.branches[0];assert.ok(branch);
const lockers=await data(await fetch(base+'/api/delivery?carrier=nova&cityRef='+city.id+'&type=postomat&q='+encodeURIComponent('Поштомат')));assert.ok(lockers.branches.length);
const body=()=>({key:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),consent:true,customer:{name:'QA HTTP перевірка',phone:'+380670000001',email:''},delivery:{carrier:'nova',city:city.name,branch:branch.label,cityRef:city.id,branchRef:branch.id,branchNumber:branch.number,type:branch.type},payment:'cod',items:[{product:info.products[1],variant:info.products[1]+'-size',qty:1,expectedAmount:1234}]});
const req=(path,payload,cookie)=>fetch(base+path,{method:payload?'POST':'GET',headers:{origin:base,...(payload?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:payload?JSON.stringify(payload):undefined});
assert.equal((await req('/api/orders',{...body(),items:[{...body().items[0],expectedAmount:1}]})).status,409);
const first=body(),second=body();const results=await Promise.all([req('/api/orders',first),req('/api/orders',second)]);
assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const winner=results[0].status===200?0:1,receipt=await results[winner].json(),original=winner?second:first;
assert.ok(receipt.number.startsWith('QA-'));assert.equal((await data(await req('/api/orders',original))).id,receipt.id);
assert.equal((await req('/api/orders',{...original,comment:'changed'})).status,409);
assert.equal((await data(await fetch(main+'/api/commerce'))).orders,false);
const publicProducts=await data(await fetch(main+'/api/catalog'));assert.ok(!publicProducts.some(p=>info.products.includes(p.id)));
const settings=readFileSync('.dev.vars','utf8'),email=settings.split('\n').find(l=>l.startsWith('ADMIN_LOGIN_EMAIL=')).split('=').slice(1).join('=').trim().replace(/^"|"$/g,'');
process.stdin.setRawMode?.(true);process.stdin.resume();console.log('Delivery/race/retry checks passed. Ready for admin password on hidden stdin.');
let password=await new Promise(resolve=>{let value='';const read=chunk=>{value+=chunk.toString();if(/[\r\n]/.test(value)){process.stdin.off('data',read);process.stdin.setRawMode?.(false);process.stdin.pause();resolve(value.trim());}};process.stdin.on('data',read);});
const login=await req('/api/admin/session',{email,password});password='';await data(login);const cookie=login.headers.getSetCookie()[0].split(';')[0];
try{
  let order=await data(await req('/api/admin/crm?view=order&id='+receipt.id,undefined,cookie));
  assert.equal(order.data.delivery.branchRef,branch.id);assert.equal(order.is_test,true);assert.equal(order.amount,1234);
  assert.equal((await data(await req('/api/admin/crm?view=orders',undefined,cookie))).orders.some(o=>o.id===receipt.id),true);
  const cancelled={id:order.id,version:order.version,operation:crypto.randomUUID(),action:'cancelled'};
  order=await data(await req('/api/admin/crm',cancelled,cookie));await data(await req('/api/admin/crm',cancelled,cookie));assert.equal(order.status,'cancelled');
  const products=await data(await req('/api/catalog'));assert.equal(products.find(p=>p.id===info.products[1]).variants[0].stock,1);
  const stats=await data(await req('/api/admin/statistics',undefined,cookie));assert.equal(stats.commerce.total,0);assert.equal(stats.commerce.gross,0);
  assert.equal((await req('/api/admin/crm',{action:'settings',accepting:true,ready:true},cookie)).status,403);
  console.log('PASS: real Nova cities/branches/lockers; server price rejection; simultaneous last-unit buyers; stable retry; real persisted QA order in admin; cancellation replay restores once; production catalogue/statistics/gate unchanged.');
}finally{await fetch(base+'/api/admin/session',{method:'DELETE',headers:{origin:base,cookie}});}
