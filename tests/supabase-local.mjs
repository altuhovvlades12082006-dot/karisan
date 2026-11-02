// Opt-in integration checks: real configured Supabase + local preview only.
// Creates one clearly named QA product/image and archives the product afterwards.
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {supabaseProducts,saveSupabaseProduct,supabaseClient,CatalogConflict} from '../lib/supabase-catalog.mjs';
import {validateProduct} from '../lib/catalog-validation.mjs';
if(!process.argv.includes('--run-supabase'))throw Error('Explicit --run-supabase is required');
const env=Object.fromEntries(readFileSync(new URL('../.dev.vars',import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim()];}));
const base='http://127.0.0.1:5173',id='qa-'+crypto.randomUUID(),key=crypto.randomUUID()+'.webp';
assert.equal((await fetch(base+'/api/admin/products')).status,401);
const image=readFileSync(new URL('../public/assets/poster-mobile.webp',import.meta.url));
await supabaseClient(env)('/storage/v1/object/product-images/'+key,{method:'POST',headers:{'Content-Type':'image/webp','x-upsert':'false'},body:image});
const media=await fetch(base+'/media/'+key);assert.equal(media.status,200);assert.deepEqual(Buffer.from(await media.arrayBuffer()),image);
const product=validateProduct({id,uk:'QA — перевірка Supabase (архівувати)',ru:'QA Supabase',en:'QA Supabase',category:'pillows',image:'/media/'+key,material:{uk:'Тестовий запис'},variants:[{id:'size-'+crypto.randomUUID(),uk:'QA розмір',sku:'QA',price:19.99,stock:0,pillowSizes:[]}]});
let row;try{
  row=await saveSupabaseProduct(env,{product,version:0,archived:false});assert.equal(row.version,1);
  assert.equal((await supabaseProducts(env,true)).find(r=>r.product.id===id).product.uk,product.uk);
  row.product.variants[0].price=29.99;row.product.variants[0].stock=3;row.product=validateProduct(row.product);
  row=await saveSupabaseProduct(env,row);assert.equal(row.version,2);
  const response=await fetch(base+'/api/catalog');assert.equal(response.status,200);
  const visible=(await response.json()).find(p=>p.id===id);assert.equal(visible.variants[0].price,29.99);assert.equal(visible.variants[0].stock,3);
  await assert.rejects(()=>saveSupabaseProduct(env,{...row,version:1}),CatalogConflict);
  const commerce=await (await fetch(base+'/api/commerce')).json();assert.equal(commerce.orders,false);
  assert.equal((await fetch(base+'/api/orders',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{}'})).status,503);
}finally{if(row){await saveSupabaseProduct(env,{...row,archived:true});}}
assert.ok(!(await (await fetch(base+'/api/catalog')).json()).some(p=>p.id===id));
console.log('PASS: real Supabase create/read/update, local storefront sees changed price/stock, stale edit rejected, archive hidden, photo upload/readback, private admin API, orders fail closed. QA product/image retained in archive.');
