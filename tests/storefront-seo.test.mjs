import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderStorefront,siteOrigin,inCategory,missingPage} from '../lib/storefront-seo.mjs';
const template=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const product={id:'fixture',uk:'Подушка <test>',category:'pillows',image:'assets/fixture.webp',price:123.45,material:{uk:'Текстиль </script><script>alert(1)</script>'},variants:[{id:'v1',uk:'50×70',sku:'SKU-1',price:123.45,stock:2},{id:'v2',uk:'70×70',sku:'SKU-2',price:150,stock:0},{id:'v3',uk:'Без ціни',price:null,stock:0}]};
test('product server HTML contains escaped title, canonical, visible data and exact variant offers',()=>{
  const html=renderStorefront(template,{origin:'https://shop.example',product});
  assert.match(html,/<title>Подушка &lt;test&gt; — Kari-San<\/title>/);
  assert.match(html,/<link rel="canonical" href="https:\/\/shop.example\/item\/fixture">/);
  assert.match(html,/<base href="\/">/);assert.match(html,/<body class="product-page">/);
  assert.match(html,/class="detail-photo"/);assert.match(html,/id="product-title"/);
  assert.equal((html.match(/id="product-dialog"/g)||[]).length,1);
  const raw=html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1];
  assert.ok(!raw.includes('</script>'));
  const graph=JSON.parse(raw)['@graph'],p=graph.find(x=>x['@type']==='Product');
  assert.equal(p.offers.length,2);assert.equal(p.offers[0].price,'123.45');assert.equal(p.offers[0].priceCurrency,'UAH');
  assert.equal(p.offers[1].availability,'https://schema.org/OutOfStock');
  assert.equal(graph.find(x=>x['@type']==='BreadcrumbList').itemListElement.length,3);
  assert.doesNotMatch(html,/<meta name="robots" content="noindex"/);
});
test('category HTML contains crawlable links and only matching products',()=>{
  const html=renderStorefront(template,{origin:'https://shop.example',category:'pillows',products:[product,{...product,id:'other',uk:'Not in this category',category:'towels'}]});
  assert.match(html,/data-category="pillows"/);assert.match(html,/<h1 id="category-title">Подушки/);
  assert.match(html,/href="\/item\/fixture"/);assert.doesNotMatch(html,/Not in this category/);
  assert.equal((html.match(/id="collection-categories"/g)||[]).length,1);
});
test('home links and metadata are server-visible without client JavaScript',()=>{
  const html=renderStorefront(template,{origin:'https://shop.example',products:[product]});
  assert.match(html,/href="\/category\/children"/);assert.match(html,/href="\/item\/fixture"/);
  assert.match(html,/property="og:image" content="https:\/\/shop.example\/assets\/poster-desktop.webp"/);
});
test('canonical domain setting rejects credentials, insecure URLs and path/query injection',()=>{
  assert.equal(siteOrigin('http://localhost:5173/item/fixture','https://shop.example'),'https://shop.example');
  assert.equal(siteOrigin('http://localhost:5173/item/fixture'),'http://localhost:5173');
  for(const x of ['http://shop.example','https://user:pass@shop.example','https://shop.example/sub','https://shop.example/?x=1'])assert.throws(()=>siteOrigin('https://safe.example',x));
});
test('category matching preserves child/fabric/new filters and 404 content is noindex',()=>{
  assert.equal(inCategory({...product,children:true},'children'),true);
  assert.equal(inCategory({...product,category:'gold'},'bedding'),true);
  assert.equal(inCategory({...product,category:'gold',new:true},'linen-new'),true);
  assert.match(missingPage(),/noindex/);assert.match(missingPage(),/Сторінку не знайдено/);
});
test('client-rendered cards retain real crawlable item links and category pages skip video startup',()=>{
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.ok(app.includes('<a href="/item/${encodeURIComponent(p.id)}" data-product="${p.id}"'));
  assert.ok(app.includes('if(!isProductPage&&!isCategoryPage){route();initMedia()}'));
});
