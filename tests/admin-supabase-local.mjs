// Explicit local integration test. Password arrives over hidden stdin, never argv.
// Creates a clearly marked zero-stock QA product, tests CRUD, then archives it.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {supabaseProducts} from '../lib/supabase-catalog.mjs';
if(!process.argv.includes('--run-supabase'))throw Error('Explicit --run-supabase required');
const base='http://127.0.0.1:5173';
const env=Object.fromEntries(readFileSync(new URL('../.dev.vars',import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')];}));
process.stdin.setRawMode?.(true);process.stdin.resume();
console.log('Ready for admin password on hidden stdin.');
let password=await new Promise(resolve=>{let value='';const read=chunk=>{value+=chunk.toString();if(/[\r\n]/.test(value)){process.stdin.off('data',read);process.stdin.setRawMode?.(false);process.stdin.pause();resolve(value.trim());}};process.stdin.on('data',read);});
const login=await fetch(base+'/api/admin/session',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({email:env.ADMIN_LOGIN_EMAIL,password})});password='';
assert.equal(login.status,200,'login must succeed');
const cookie=login.headers.getSetCookie()[0].split(';')[0];
const req=(path,body,auth=true,origin=base)=>fetch(base+path,{method:body?'POST':'GET',headers:{origin,...(auth?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
const data=async response=>{assert.equal(response.status,200,'request failed: '+await response.clone().text());return response.json();};
let row;const id='qa-admin-'+crypto.randomUUID();
try{
  assert.equal((await data(await req('/api/admin/session'))).admin,true);
  for(const path of ['/api/admin/products','/api/admin/crm','/api/admin/statistics','/api/admin/readiness'])assert.equal((await req(path,undefined,false)).status,401);
  assert.equal((await req('/api/admin/crm',{action:'settings',accepting:false},true,'https://untrusted.invalid')).status,403);
  const rows=await data(await req('/api/admin/products'));
  const source=structuredClone(rows.find(x=>!x.archived).product);
  source.id=id;source.uk='QA — тест адмінки (архів)';source.ru=source.uk;source.en='QA admin archive';
  source.variants=[{id:'qa-size-'+crypto.randomUUID(),uk:'QA 50x70',ru:'QA',en:'QA',sku:'QA-admin',price:12.34,stock:0,pillowSizes:[]}];
  row=await data(await req('/api/admin/products',{product:source,version:0,archived:true}));
  row.product.variants[0].price=23.45;row.product.variants[0].stock=3;
  row.product.variants.push({...row.product.variants[0],id:'qa-size-'+crypto.randomUUID(),uk:'QA 70x70',stock:0});
  row=await data(await req('/api/admin/products',row));
  const stored=(await supabaseProducts(env,true)).find(x=>x.product.id===id);
  assert.equal(stored.product.variants.length,2);assert.equal(stored.product.variants[0].price,23.45);assert.equal(stored.product.variants[0].stock,3);
  assert.equal((await req('/api/admin/products',{...row,version:1})).status,409);
  // Public visibility test: zero stock throughout the brief active phase.
  row.product.variants.forEach(v=>v.stock=0);row.archived=false;
  row=await data(await req('/api/admin/products',row));
  const visible=(await data(await req('/api/catalog',undefined,false))).find(x=>x.id===id);
  assert.equal(visible.variants[0].price,23.45);assert.equal(visible.variants.length,2);assert.ok(visible.variants.every(v=>v.stock===0));
  const photo=readFileSync(new URL('../public/assets/poster-mobile.webp',import.meta.url));
  const upload=await fetch(base+'/api/admin/upload',{method:'POST',headers:{origin:base,cookie,'content-type':'image/webp'},body:photo});
  const image=await data(upload);row.product.image=image.image;row=await data(await req('/api/admin/products',row));
  const media=await fetch(base+image.image);assert.equal(media.status,200);assert.deepEqual(Buffer.from(await media.arrayBuffer()),photo);
  for(const view of ['orders','customers','stock']){
    const result=await data(await req('/api/admin/crm?view='+view));
    if(view==='orders')assert.equal(result.readOnly,false);else assert.ok(Array.isArray(result));
  }
  const stats=await data(await req('/api/admin/statistics'));assert.equal(stats.sales.source,'supabase-crm');assert.equal(stats.sales.manualEnabled,false);assert.ok(Array.isArray(stats.traffic.countries));
  assert.equal((await req('/api/admin/crm',{action:'settings',accepting:true,ready:true})).status,409);
  assert.equal((await data(await req('/api/commerce',undefined,false))).orders,false);
  assert.equal((await req('/api/orders',{},false)).status,503);
  console.log('PASS: login, guarded APIs/CSRF, real admin product create/update/sizes/photo, Supabase readback, public visibility, stale edit rejected, CRM views/statistics, launch remains closed.');
}finally{
  if(row){const fresh=(await supabaseProducts(env,true)).find(x=>x.product.id===id);await data(await req('/api/admin/products',{...fresh,archived:true}));assert.ok(!(await data(await req('/api/catalog',undefined,false))).some(x=>x.id===id));console.log('QA product archived; photo retained with archived product.');}
  const logout=await fetch(base+'/api/admin/session',{method:'DELETE',headers:{origin:base,cookie}});assert.equal(logout.status,200);
  assert.equal((await req('/api/admin/products')).status,401);console.log('PASS: logout invalidates session.');
}
