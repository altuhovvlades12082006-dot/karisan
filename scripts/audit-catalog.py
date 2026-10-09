import urllib.request, json, re, concurrent.futures
from bs4 import BeautifulSoup
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CATS={'bedding':'postelnoe-bele-20/','towels':'polotentsa-18/','duvets':'odeyala-25/','protectors':'namatrasniki-57/','covers':'pokryivala-17/','pillows':'podushki-59/'}
def scan(pair):
 cat,path=pair; pending=['https://kari-san.ua/ua/'+path];seen=set();items={}
 while pending:
  url=pending.pop(0)
  if url in seen:continue
  seen.add(url)
  s=BeautifulSoup(urllib.request.urlopen(url,timeout=30).read(),'html.parser')
  for a in s.select('.pagination a[href]'):
   u=a['href']
   if u not in seen and u not in pending and '/'+path in u:pending.append(u)
  for p in s.select('.product-thumb'):
   a=p.select_one('a.name');img=p.select_one('.image img')
   if not a or not img:continue
   name=a.get_text(' ',strip=True);variants=[]
   for v in p.select('.product-proposition'):
    label=v.select_one('.proposition-name');price=v.select_one('.proposition-price');qty=v.select_one('input.qty');button=v.select_one('.bt-add-proposition')
    if not all([label,price,qty,button]):continue
    vid=re.search(r"\('([0-9]+)'\)",button.get('onclick',''))
    if not vid:continue
    variants.append({'id':vid[1],'uk':re.split('Доступно:',label.get_text(' ',strip=True))[0].strip(),'price':float(re.sub(r'[^\d.]','',price.get_text())),'stock':int(qty.get('max','0'))})
   u=a['href'].replace('/ua/','/')
   items[u]={'url':u,'uk':name,'category':cat,'imageUrl':img.get('data-src') or img.get('src'),'variants':variants,'new':bool(p.select_one('.new-prod'))}
 return {'category':cat,'pages':len(seen),'items':list(items.values())}
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: result=list(pool.map(scan,CATS.items()))
 target=ROOT/'source-cache/catalog-audit-20261009.json';target.parent.mkdir(exist_ok=True);target.write_text(json.dumps(result,ensure_ascii=False,indent=2))
 print([(x['category'],x['pages'],len(x['items'])) for x in result])
 print('CHILDREN',[(p['uk'],p['url']) for x in result for p in x['items'] if re.search('дит|дет',p['uk'],re.I)])
