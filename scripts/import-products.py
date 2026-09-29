import urllib.request,json,re,concurrent.futures,hashlib
from pathlib import Path
from bs4 import BeautifulSoup
root=Path(__file__).resolve().parents[1]; assets=root/'dist/assets'
cats={'gold':'postelnoe-bele-20/postelnoe-bele-byaz/','satin':'postelnoe-bele-20/satin/','stripe':'postelnoe-bele-20/postelnoe-bele-stripe-satin/','bedding':'postelnoe-bele-20/','towels':'polotentsa-18/','duvets':'odeyala-25/','protectors':'namatrasniki-57/','covers':'pokryivala-17/','pillows':'podushki-59/'}
def fetch(pair):
 cat,path=pair;s=BeautifulSoup(urllib.request.urlopen('https://kari-san.ua/'+path,timeout=30).read(),'html.parser');out=[]
 for p in s.select('.product-thumb'):
  a=p.select_one('.name');img=p.select_one('.image img')
  if not a or not img:continue
  name=a.get_text(' ',strip=True);url=a['href'];im=img.get('data-src') or img.get('src') or img.get('data-original');prices=[]
  if not im:continue
  for q in p.select('.proposition-price'):
   n=re.sub(r'[^0-9.]','',q.get_text());
   if n:prices.append(float(n))
  actual=cat
  if cat=='bedding':
   if 'Варен' in name:actual='washed'
   else:continue
  out.append({'ru':name,'url':url,'imageUrl':im,'category':actual,'price':min(prices) if prices else None,'new':bool(p.select_one('.new-prod'))})
 return out
items=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
 for result in ex.map(fetch,cats.items()):items+=result
items=list({x['url']:x for x in items}.values())
ua=[('Постельное белье','Постільна білизна'),('Вареный хлопок','Варена бавовна'),('Полотенце махровое','Рушник махровий'),('Полотенце','Рушник'),('Одеяло','Ковдра'),('Покрывало','Покривало'),('Наматрасник','Наматрацник'),('Чехол на подушку','Чохол на подушку'),('с дополнительным наполнителем','з додатковим наповнювачем'),('Туристическая подушка','Туристична подушка'),('Холлофайбер','Холофайбер'),('Шерстипоновое','Вовняна'),('Классик','Класик')]
en=[('Постельное белье','Bed linen'),('Вареный хлопок','Washed cotton'),('Полотенце махровое','Terry towel'),('Полотенце','Towel'),('Одеяло Холлофайбер','Hollowfibre duvet'),('Одеяло Шерстипоновое','Wool-blend duvet'),('Одеяло','Duvet'),('Покрывало Шарпей','Sharpei bedspread'),('Покрывало','Bedspread'),('Наматрасник','Mattress protector'),('водонепроникний','Waterproof'),('водонепроницаемый','Waterproof'),('Чехол на подушку','Pillow cover'),('Туристическая подушка','Travel pillow'),('Подушка','Pillow'),('с дополнительным наполнителем','with extra filling'),('Классик','Classic'),('Страйп Сатин','Stripe satin'),('Сатин','Satin'),('Рогалик','Neck pillow')]
def translate(t,pairs):
 for a,b in pairs:t=t.replace(a,b)
 return t
for i,p in enumerate(items):
 p['id']=hashlib.sha1(p['url'].encode()).hexdigest()[:10];p['uk']=translate(p['ru'],ua);p['en']=translate(p['ru'],en)
def image(p):
 dest='product-'+p['id']+'.webp'
 if (assets/dest).exists():p['image']='assets/'+dest;return
 u=p['imageUrl'];original=re.sub(r'-\d+x\d+(?=\.[^.]+$)','',u.replace('/image/cache/','/image/'))
 try:data=urllib.request.urlopen(original,timeout=20).read()
 except:data=urllib.request.urlopen(u,timeout=20).read()
 from PIL import Image
 import io
 im=Image.open(io.BytesIO(data));im.thumbnail((800,800));dest='product-'+p['id']+'.webp';im.convert('RGB').save(assets/dest,'WEBP',quality=85);p['image']='assets/'+dest
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:list(ex.map(image,items))
(root/'dist/products.json').write_text(json.dumps(items,ensure_ascii=False))
print('Imported',len(items),'products')
print('English remaining Cyrillic:',[(p['id'],p['en']) for p in items if re.search('[а-яА-Я]',p['en'])])
