// Isolated browser QA. No real carrier requests, secrets, orders or DB writes.
// Start explicitly: node tests/nova-ui-fixture.mjs --fixture
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {renderStorefront} from '../lib/storefront-seo.mjs';
import {novaCities,novaBranches,novaQuote,verifyNovaSelection} from '../integrations/nova-poshta.mjs';
import {validateCheckout,orderSnapshot} from '../lib/order-validation.mjs';
import {DatabaseSync} from 'node:sqlite';
if(!process.argv.includes('--fixture'))throw Error('Explicit --fixture required');
const root=resolve('public'),seed=JSON.parse(readFileSync('data/catalog-seed.json','utf8')),template=readFileSync(root+'/index.html','utf8');
const city='11111111-1111-4111-8111-111111111111',branch='22222222-2222-4222-8222-222222222222',locker='33333333-3333-4333-8333-333333333333';
const env={NOVA_POSHTA_API_KEY:'fixture-only',NOVA_POSHTA_SENDER_CITY_REF:city};
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE orders(data TEXT NOT NULL)');
const fetcher=async(url,options)=>{const b=JSON.parse(options.body);let data=[];
  if(b.calledMethod==='getCities')data=[{Ref:city,Description:'Тестове місто',AreaDescription:'QA'}];
  if(b.calledMethod==='getWarehouses')data=[{Ref:branch,CityRef:city,Number:'1',CityDescription:'Тестове місто',Description:'Відділення №1',CategoryOfWarehouse:'Branch'},{Ref:locker,CityRef:city,Number:'100',CityDescription:'Тестове місто',Description:'Поштомат №100',CategoryOfWarehouse:'Postomat'}];
  if(b.calledMethod==='getDocumentPrice')data=[{Cost:'95.50'}];return Response.json({success:true,data});};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.svg':'image/svg+xml'};
createServer(async(req,res)=>{const u=new URL(req.url,'http://127.0.0.1:5174');const json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body));};
  try{
    if(u.pathname==='/api/catalog')return json(seed);
    if(u.pathname==='/api/commerce')return json({delivery:{nova:true,ukr:false},orders:true,payments:{cod:true,card:false}});
    if(u.pathname==='/api/events')return json({ok:true});
    if(u.pathname==='/api/delivery'){
      if(req.method==='POST'){let text='';for await(const chunk of req){text+=chunk;if(text.length>3000)return json({},413);}return json(await novaQuote(env,JSON.parse(text),fetcher));}
      const p=Object.fromEntries(u.searchParams);return json(p.action==='cities'?await novaCities(env,p,fetcher):await novaBranches(env,p,fetcher));
    }
    if(u.pathname==='/api/orders'){
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>18000)return json({},413);}
      const b=validateCheckout(JSON.parse(raw));b.delivery=await verifyNovaSelection(env,b.delivery,fetcher);
      db.prepare('INSERT INTO orders(data) VALUES (?)').run(JSON.stringify(orderSnapshot(b)));
      return json({number:'QA-FIXTURE-NOT-A-REAL-ORDER',amount:13600});
    }
    if(u.pathname==='/fixture-result')return json(db.prepare("SELECT json_extract(data,'$.delivery.branchRef') AS branchRef,json_extract(data,'$.delivery.cityRef') AS cityRef,json_extract(data,'$.delivery.type') AS type FROM orders ORDER BY rowid DESC LIMIT 1").get()||{});
    if(u.pathname==='/'||u.pathname.startsWith('/category/')||u.pathname.startsWith('/item/')){
      const category=u.pathname.startsWith('/category/')?u.pathname.split('/')[2]:undefined,product=u.pathname.startsWith('/item/')?seed.find(p=>p.id===u.pathname.split('/')[2]):undefined;
      res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(renderStorefront(template,{origin:u.origin,category,product,products:seed}).replace('<body','<body data-fixture="true"').replace('</body>','<div style="position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#fff2ca;color:#222;padding:8px;text-align:center;font:12px sans-serif">QA · Тестові міста, відділення й замовлення · без реального API та бази магазину</div></body>'));
    }
    const path=resolve(root,'.'+decodeURIComponent(u.pathname));if(!path.startsWith(root+'/'))return json({},403);res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream'});res.end(readFileSync(path));
  }catch{if(!res.headersSent)json({error:'Fixture unavailable'},404);else res.end();}
}).listen(5174,'127.0.0.1',()=>console.log('FIXTURE ONLY http://127.0.0.1:5174/category/children — no live APIs or DB'));
