// Opt-in, loopback-only integration harness. REAL Nova lookup + REAL Supabase.
// Only the local harness gate is simulated; SQL QA transactions restore the real
// disabled gate before committing. No real shipment, payment or customer order.
import {createServer} from 'node:http';
import {readFileSync,createReadStream,statSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {renderStorefront} from '../lib/storefront-seo.mjs';
import {supabaseClient,saveSupabaseProduct,mapProduct,CommerceError} from '../lib/supabase-catalog.mjs';
import {createSupabaseOrder} from '../lib/supabase-checkout.mjs';
import {readSupabaseOrders,crmRPC} from '../lib/supabase-crm.mjs';
if(!process.argv.includes('--run-supabase'))throw Error('Explicit --run-supabase required');
const env=Object.fromEntries(readFileSync('.dev.vars','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')];}));
const base='http://127.0.0.1:5174',upstream='http://127.0.0.1:5173',call=supabaseClient(env),root=resolve('public');
const run=crypto.randomUUID().slice(0,8),ids=['browser','race'].map(kind=>'qa-launch-'+run+'-'+kind);
const template=readFileSync(root+'/index.html','utf8');
const source=(await(await call('/rest/v1/products?select=*,product_variants(*)&is_active=eq.true&is_test=eq.false&limit=1')).json())[0];
for(let n=0;n<ids.length;n++){
  const product=mapProduct(source).product;product.id=ids[n];product.uk='QA · '+(n?'Остання одиниця':'Перевірка покупки');product.ru=product.uk;product.en=product.uk;product.category='pillows';product.children=false;
  product.variants=[{id:ids[n]+'-size',uk:'QA 50x70',ru:'QA',en:'QA',sku:ids[n],price:12.34,stock:n?1:2,pillowSizes:[]}];
  let row=await saveSupabaseProduct(env,{product,version:0,archived:true});
  await call('/rest/v1/products?id=eq.'+product.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{"is_test":true}'});
  await saveSupabaseProduct(env,{...row,archived:false});
}
const qaEnv={...env,SUPABASE_CHECKOUT_ENABLED:'true'};
const scopedFetcher=async(url,options={})=>{
  if(url.startsWith(env.SUPABASE_URL+'/rest/v1/')){
    const u=new URL(url);
    if(u.pathname==='/rest/v1/store_settings')return Response.json([{value:{orders_enabled:true}}]); // harness configuration, never database state
    if(u.pathname==='/rest/v1/rpc/create_storefront_order'){
      const body=JSON.parse(options.body);body.payload.is_test=true;options={...options,body:JSON.stringify(body)};
    }
    if(u.pathname==='/rest/v1/orders'&&u.searchParams.has('is_test')){u.searchParams.set('is_test','eq.true');u.searchParams.set('comment','like.QA '+run+'*');}
    if(u.pathname==='/rest/v1/rpc/server_crm_counts'){
      const rows=await(await call('/rest/v1/orders?select=status&is_test=eq.true&comment=like.QA%20'+run+'*')).json(),counts=new Map();
      for(const row of rows)counts.set(row.status,(counts.get(row.status)||0)+1);return Response.json([...counts].map(([status,total])=>({status,total})));
    }
    return fetch(u,options);
  }
  return fetch(url,options);
};
const qaProducts=async()=>{const rows=await(await call('/rest/v1/products?select=*,product_variants(*)&is_test=eq.true&id=in.('+ids.join(',')+')&order=id.asc')).json();return rows.map(row=>mapProduct(row).product);};
const isQAOrder=async id=>/^[a-f0-9-]{36}$/.test(id||'')&&(await(await call('/rest/v1/orders?select=id&id=eq.'+id+'&is_test=eq.true&comment=like.QA%20'+run+'*')).json()).length===1;
const proxy=async(req,path,body)=>{
  const headers={...(req.headers.cookie?{cookie:req.headers.cookie}:{}),origin:upstream,...(body?{'content-type':'application/json'}:{})};
  return fetch(upstream+path,{method:req.method,headers,body});
};
const readBody=async req=>{let text='';for await(const c of req){text+=c;if(Buffer.byteLength(text)>18000)throw Error('Body too large');}return text;};
const notice='<div style="position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#fff2ca;color:#222;padding:8px;text-align:center;font:12px sans-serif">QA · Справжній API Нової пошти та тестові записи Supabase · НЕ реальне замовлення</div>';
const mime={'.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp4':'video/mp4'};
let closing=false;const attempts=new Map();
const server=createServer(async(req,res)=>{
  const u=new URL(req.url,base);const json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-robots-tag':'noindex'});res.end(JSON.stringify(body));};
  const forward=async response=>{res.writeHead(response.status,{'content-type':response.headers.get('content-type')||'application/json',...(response.headers.get('set-cookie')?{'set-cookie':response.headers.get('set-cookie')}:{})});res.end(Buffer.from(await response.arrayBuffer()));};
  try{
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==base)return json({error:'Invalid origin'},403);
    if(u.pathname==='/api/catalog')return json(await qaProducts());
    if(u.pathname==='/api/commerce')return json({delivery:{nova:true,ukr:false},orders:true,payments:{cod:true,card:false}});
    if(u.pathname==='/api/events')return json({ok:true,ignored:'QA traffic'});
    if(u.pathname==='/api/delivery')return forward(await fetch(upstream+u.pathname+u.search));
    if(u.pathname==='/api/orders'){
      const minute=Math.floor(Date.now()/900000),count=(attempts.get(minute)||0)+1;attempts.set(minute,count);if(count>30)return json({error:'Too many QA requests'},429);
      const raw=JSON.parse(await readBody(req));
      if(!Array.isArray(raw.items)||raw.items.some(x=>!ids.includes(x.product)))return json({error:'QA products only'},400);
      raw.customer.email='qa@example.invalid';raw.comment='QA '+run+' '+(raw.comment||'');
      return json(await createSupabaseOrder(qaEnv,raw,'ZZ',scopedFetcher));
    }
    if(u.pathname.startsWith('/api/admin/')){
      if(u.pathname==='/api/admin/session')return forward(await proxy(req,u.pathname,req.method==='POST'?await readBody(req):undefined));
      const session=await fetch(upstream+'/api/admin/session',{headers:{cookie:req.headers.cookie||''}});
      if(!(await session.json()).admin)return json({error:'Admin login required'},401);
      if(u.pathname==='/api/admin/crm'){
        if(req.method==='POST'){
          const text=await readBody(req),body=JSON.parse(text);
          if(!await isQAOrder(body.id))return json({error:'QA orders only; settings/customer changes forbidden'},403);
          return forward(await proxy(req,u.pathname,text));
        }
        if(u.searchParams.get('view')==='order'&&!await isQAOrder(u.searchParams.get('id')))return json({error:'QA orders only'},403);
        if(!['orders','order'].includes(u.searchParams.get('view')||'orders'))return json([]);
        return json(await readSupabaseOrders(qaEnv,u,scopedFetcher));
      }
      if(req.method!=='GET')return json({error:'Read only outside QA order actions'},403);
      return forward(await proxy(req,u.pathname+u.search));
    }
    if(u.pathname==='/qa-info')return json({run,products:ids,scope:'QA only; real public gate stays false'});
    if(u.pathname==='/admin'){res.writeHead(200,{'content-type':'text/html','x-robots-tag':'noindex'});return res.end(readFileSync(root+'/admin.html','utf8').replace('</body>',notice+'</body>'));}
    if(u.pathname==='/'||u.pathname.startsWith('/category/')||u.pathname.startsWith('/item/')){
      const products=await qaProducts(),product=products.find(p=>p.id===u.pathname.split('/')[2]);
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','x-robots-tag':'noindex'});
      return res.end(renderStorefront(template,{origin:base,products,category:product?undefined:'pillows',product}).replace('</body>',notice+'</body>'));
    }
    const path=resolve(root,'.'+decodeURIComponent(u.pathname));if(!path.startsWith(root+'/'))return json({},403);
    const stat=statSync(path);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','content-length':stat.size});
    if(req.method==='HEAD')return res.end();createReadStream(path).pipe(res);
  }catch(e){console.log('QA request rejected:',e.name,e.message);if(!res.headersSent)json({error:e instanceof CommerceError?e.message:'QA request failed'},e instanceof CommerceError?e.status:400);else res.end();}
});
async function cleanup(){if(closing)return;closing=true;server.close();
  try{
    const rows=await(await call('/rest/v1/orders?select=id,version,status&is_test=eq.true&comment=like.QA%20'+run+'*')).json();
    for(const row of rows)if(['new','processing'].includes(row.status))await crmRPC(env,'server_crm_action',{payload:{id:row.id,version:row.version,operation:crypto.randomUUID(),action:'cancelled'}});
    for(const id of ids)await call('/rest/v1/products?id=eq.'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{"is_active":false}'});
    console.log('QA pending orders cancelled; QA products archived. No records deleted.');
  }catch{console.log('QA cleanup needs review; run '+run);process.exitCode=1;}
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await cleanup();process.exit(process.exitCode||0);});
server.listen(5174,'127.0.0.1',()=>console.log('QA ONLY '+base+'/category/pillows — real Nova and Supabase; products '+ids.join(', ')));
