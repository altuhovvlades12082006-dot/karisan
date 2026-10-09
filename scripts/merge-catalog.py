import json,re,hashlib,urllib.request,concurrent.futures,datetime,io
from pathlib import Path
from bs4 import BeautifulSoup
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
old=json.loads((ROOT/'dist/products.json').read_text()); byurl={p['url']:p for p in old}
rows=[p for c in json.loads((ROOT/'source-cache/catalog-audit-20261009.json').read_text()) for p in c['items']]
stamp=datetime.datetime.now(datetime.timezone.utc).isoformat()
def enrich(p):
 previous=byurl.get(p['url'],{});result={**previous,**p};result['id']=previous.get('id') or hashlib.sha1(p['url'].encode()).hexdigest()[:10]
 # Retain catalog IDs and exact option IDs so existing carts still resolve.
 if p['category']=='bedding':
  n=p['uk'].lower();result['category']='washed' if 'бавовна' in n else 'stripe' if 'страйп' in n else 'satin' if 'сатин' in n else 'gold' if 'клас' in n else 'linen-new'
 result['children']=bool(re.search('дитяч|детск',p['uk'],re.I))
 variants=[];prior={v['id']:v for v in previous.get('variants',[])}
 for v in p['variants']:
  label=v['uk'];base=prior.get(v['id'],{})
  variants.append({**base,**v,'ru':base.get('ru',label),'en':base.get('en',label),'sku':base.get('sku',''),'pillowSizes':base.get('pillowSizes',[])})
 result['variants']=variants;result['ru']=previous.get('ru',p['uk']);result['en']=previous.get('en',p['uk']);result['updatedAt']=stamp
 if not previous:
  s=BeautifulSoup(urllib.request.urlopen(p['url'].replace('kari-san.ua/','kari-san.ua/ua/'),timeout=30).read(),'html.parser')
  desc=s.select_one('#tab-description');text=desc.get_text(' ',strip=True) if desc else ''
  result['sourceDescription']=text;result['material']={lang:text or 'Інформацію про склад уточнюйте в магазині.' for lang in ['uk','ru','en']}
  # Only options confirmed by the product page, never inferred from fabric type.
  current=s.select_one('#input-quantity');sku=s.select_one('#product .attribute_groups');labels=[x.get_text(' ',strip=True) for x in s.select('#product .radio label')]
  vid=re.search(r'-(\d+)/?$',p['url'])
  for v in variants:
   if vid and v['id']==vid[1]:v['sku']=sku.get_text(' ',strip=True).split(':')[-1].strip() if sku else '';v['pillowSizes']=labels
 result['price']=min((v['price'] for v in variants),default=None)
 if not variants:
  # Keep an unavailable product visible without offering an unverified price.
  result['variants']=[{'id':'unavailable-'+result['id'],'uk':'Стандарт','ru':'Стандарт','en':'Standard','price':None,'stock':0,'sku':'','pillowSizes':[]}]
 image=previous.get('image');dest=ROOT/'dist/assets'/('product-'+result['id']+'.webp')
 if not image or not (ROOT/'dist'/image).exists():
  u=p['imageUrl']
  if not u:
   page=BeautifulSoup(urllib.request.urlopen(p['url'],timeout=30).read(),'html.parser');node=page.select_one('meta[property="og:image"]') or page.select_one('.thumbnails a[href]')
   u=node.get('content') or node.get('href') if node else None
  if not u:raise ValueError('Missing source image: '+p['url'])
  original=re.sub(r'-\d+x\d+(?=\.[^.]+$)','',u.replace('/image/cache/','/image/'))
  try:data=urllib.request.urlopen(original,timeout=30).read()
  except Exception:data=urllib.request.urlopen(u,timeout=30).read()
  im=Image.open(io.BytesIO(data));im.thumbnail((800,800));im.convert('RGB').save(dest,'WEBP',quality=85);image='assets/'+dest.name
 result['image']=image
 return result
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:result=list(pool.map(enrich,rows))
# Different source URLs sometimes repeat the exact same purchasable variants.
unique={}
for p in result:
 key=tuple(sorted(v['id'] for v in p['variants']))
 if key not in unique:unique[key]=p
result=list(unique.values())
assert len({p['id'] for p in result})==len(result)
assert all((ROOT/'dist'/p['image']).exists() for p in result)
(ROOT/'dist/products.json').write_text(json.dumps(result,ensure_ascii=False))
print('Products:',len(result),'variants:',sum(len(p['variants']) for p in result),'children:',sum(p['children'] for p in result),'source cards:',len(rows))
