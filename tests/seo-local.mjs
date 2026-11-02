// Read-only HTTP checks against a running local Worker. No orders or DB writes.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
const response=await fetch(base+'/api/catalog');assert.equal(response.status,200);
const products=await response.json(),p=products[0];assert.ok(p);
const item=await fetch(base+'/item/'+p.id),html=await item.text();assert.equal(item.status,200);
assert.ok(html.includes('rel="canonical" href="'+base+'/item/'+p.id+'"'));
assert.ok(html.includes('id="product-title"'));assert.ok(html.includes('class="detail-photo"'));
const graph=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])['@graph'];
const structured=graph.find(x=>x['@type']==='Product');assert.equal(structured.name,p.uk);
assert.equal(structured.offers.length,p.variants.filter(v=>typeof v.price==='number'&&v.price>0).length);
for(const path of ['/item/no-such-product','/category/not-a-category']){const r=await fetch(base+path);assert.equal(r.status,404);assert.equal(r.headers.get('x-robots-tag'),'noindex');}
for(const path of ['/product?id='+p.id,'/product.html?id='+p.id]){const r=await fetch(base+path,{redirect:'manual'});assert.equal(r.status,308);assert.equal(r.headers.get('location'),'/item/'+p.id);}
const category=await fetch(base+'/category/children');assert.equal(category.status,200);
assert.ok((await category.text()).includes('data-category="children"'));
const sitemap=await fetch(base+'/sitemap.xml');assert.equal(sitemap.status,200);const xml=await sitemap.text();
assert.ok(xml.includes(base+'/item/'+p.id));assert.ok(xml.includes(base+'/category/children'));assert.ok(!xml.includes('/admin'));
const robots=await fetch(base+'/robots.txt');assert.equal(robots.status,200);assert.ok((await robots.text()).includes('Sitemap: '+base+'/sitemap.xml'));
console.log('PASS: local server-rendered product/category, canonical/JSON-LD, missing item/category 404, legacy redirects, sitemap and robots');
