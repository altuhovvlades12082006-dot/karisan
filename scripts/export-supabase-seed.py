#!/usr/bin/env python3
"""Convert dist/products.json into a repeatable Supabase SQL seed."""
import json, pathlib

root=pathlib.Path(__file__).resolve().parents[1]
products=json.loads((root/'dist/products.json').read_text())
def q(value): return "'"+json.dumps(value,ensure_ascii=False,separators=(',',':')).replace("'","''")+"'::jsonb"
def s(value): return "null" if value is None else "'"+str(value).replace("'","''")+"'"
lines=['begin;']
for n,p in enumerate(products):
    names={k:p.get(k,'') for k in ('uk','ru','en')}
    desc={'uk':p.get('sourceDescription',''),'ru':p.get('sourceDescription',''),'en':''}
    lines.append(f"insert into public.products(id,names,description,material,category_slug,base_price,image_url,source_image_url,source_url,is_new,is_children,is_active,sort_order) values ({s(p['id'])},{q(names)},{q(desc)},{q(p.get('material',{}))},{s(p.get('category'))},{float(p.get('price') or 0)},{s(p.get('image'))},{s(p.get('imageUrl'))},{s(p.get('url'))},{str(bool(p.get('new'))).lower()},{str(bool(p.get('children'))).lower()},true,{n}) on conflict(id) do update set names=excluded.names,description=excluded.description,material=excluded.material,category_slug=excluded.category_slug,base_price=excluded.base_price,image_url=excluded.image_url,source_image_url=excluded.source_image_url,source_url=excluded.source_url,is_new=excluded.is_new,is_children=excluded.is_children,sort_order=excluded.sort_order;")
    for v in p.get('variants',[]):
        vn={k:v.get(k,'') for k in ('uk','ru','en')}
        lines.append(f"insert into public.product_variants(id,product_id,names,sku,price,stock,pillow_sizes,is_active) values ({s(v['id'])},{s(p['id'])},{q(vn)},{s(v.get('sku'))},{float(v.get('price') or 0)},{int(v.get('stock') or 0)},{q(v.get('pillowSizes',[]))},true) on conflict(id) do update set product_id=excluded.product_id,names=excluded.names,sku=excluded.sku,price=excluded.price,stock=excluded.stock,pillow_sizes=excluded.pillow_sizes;")
lines.append('commit;')
out=root/'supabase/seed.sql';out.write_text('\n'.join(lines)+'\n');print(out)
