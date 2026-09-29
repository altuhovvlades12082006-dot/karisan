import json,urllib.request,re,concurrent.futures,hashlib,datetime
from pathlib import Path
from bs4 import BeautifulSoup
root=Path(__file__).resolve().parents[1];cache=root/'source-cache';cache.mkdir(exist_ok=True)
products=json.loads((root/'dist/products.json').read_text())
def soup(url):
 file=cache/(hashlib.sha1(url.encode()).hexdigest()+'.html')
 if not file.exists():file.write_bytes(urllib.request.urlopen(url,timeout=30).read())
 return BeautifulSoup(file.read_bytes(),'html.parser')
def parse(p):
 s=soup(p['url']);options=s.select('#input-related_product_union option');urls=[(o.get('value'),o.get_text(' ',strip=True)) for o in options] or [(p['url'],'')]
 variants=[]
 for url,label in urls:
  v=s if url==p['url'] else soup(url);block=v.select_one('#product');price=block.select_one('.price') if block else None;pt=price.get_text(' ',strip=True) if price else '';match=re.search(r'([\d\s]+(?:[.,]\d+)?)\s*UAH',pt);q=v.select_one('#input-quantity');stock=int(q.get('data-max','0')) if q else None
  sku='';at=v.select_one('#product .attribute_groups');
  if at:sku=at.get_text(' ',strip=True).split(':')[-1].strip()
  variants.append({'id':re.search(r'-(\d+)/?$',url).group(1) if re.search(r'-(\d+)/?$',url) else hashlib.sha1(url.encode()).hexdigest()[:8],'ru':label or 'Стандарт','price':float(match[1].replace(' ','').replace(',','.')) if match else None,'stock':stock,'sku':sku,'pillowSizes':[x.get_text(' ',strip=True) for x in v.select('#product .radio label')]})
 d=s.select_one('#tab-description');desc=d.get_text(' ',strip=True) if d else ''
 p['variants']=variants;p['sourceDescription']=desc;p['updatedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();return p
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:out=list(ex.map(parse,products))
(root/'dist/products.json').write_text(json.dumps(out,ensure_ascii=False))
seen=set()
for p in out:
 d=p['sourceDescription'][:500]
 if d not in seen: print(p['category'],p['id'],d);seen.add(d)
print('TOTAL',len(out),'variants',sum(len(p['variants']) for p in out))
