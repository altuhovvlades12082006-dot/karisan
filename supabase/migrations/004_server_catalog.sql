-- Existing catalogue shape; server-only writes, optimistic edits, no data deletion.
begin;
alter table public.products add column if not exists version integer not null default 1;
alter table public.products alter column base_price drop not null;
alter table public.product_variants alter column price drop not null;
revoke insert,update,delete on public.products,public.product_variants from authenticated;
revoke all on function public.admin_save_product(jsonb) from public,anon,authenticated;
create or replace function public.server_save_catalog_product(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p jsonb:=payload->'product';
  wanted integer:=(payload->>'version')::integer;
  archived boolean:=(payload->>'archived')::boolean;
  current_version integer;
  v jsonb;
begin
  if wanted is null or wanted<0 or archived is null or coalesce(p->>'id','') !~ '^[a-zA-Z0-9_-]{1,60}$'
    or jsonb_typeof(p->'variants') is distinct from 'array' then raise exception 'invalid_product'; end if;
  if jsonb_array_length(p->'variants') not between 1 and 50 then raise exception 'invalid_variants'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalog:'||(p->>'id'),0));
  select version into current_version from public.products where id=p->>'id' for update;
  if (found and current_version<>wanted) or (not found and wanted<>0) then raise exception 'catalog_conflict'; end if;
  if exists(select 1 from public.order_items i where i.product_id=p->>'id'
    and not exists(select 1 from jsonb_array_elements(p->'variants') x where x->>'id'=i.variant_id)) then
    raise exception 'ordered_variant_required';
  end if;
  insert into public.products(id,names,description,material,category_slug,base_price,image_url,is_new,is_children,is_active,version)
  values(p->>'id',jsonb_build_object('uk',p->>'uk','ru',p->>'ru','en',p->>'en'),jsonb_build_object('uk',p->>'sourceDescription'),
    p->'material',p->>'category',(p->>'price')::numeric,p->>'image',(p->>'new')::boolean,(p->>'children')::boolean,not archived,wanted+1)
  on conflict(id) do update set names=excluded.names,description=excluded.description,material=excluded.material,
    category_slug=excluded.category_slug,base_price=excluded.base_price,image_url=excluded.image_url,is_new=excluded.is_new,
    is_children=excluded.is_children,is_active=excluded.is_active,version=excluded.version;
  update public.product_variants set is_active=false where product_id=p->>'id';
  for v in select * from jsonb_array_elements(p->'variants') loop
    if exists(select 1 from public.product_variants where id=v->>'id' and product_id<>p->>'id') then raise exception 'variant_owner_conflict'; end if;
    insert into public.product_variants(id,product_id,names,sku,price,stock,pillow_sizes,is_active)
    values(v->>'id',p->>'id',jsonb_build_object('uk',v->>'uk','ru',v->>'ru','en',v->>'en'),nullif(v->>'sku',''),
      (v->>'price')::numeric,(v->>'stock')::integer,v->'pillowSizes',true)
    on conflict(id) do update set names=excluded.names,sku=excluded.sku,price=excluded.price,
      stock=excluded.stock,pillow_sizes=excluded.pillow_sizes,is_active=true;
  end loop;
  return jsonb_build_object('product',p,'version',wanted+1,'archived',archived);
end $$;
revoke all on function public.server_save_catalog_product(jsonb) from public,anon,authenticated;
grant execute on function public.server_save_catalog_product(jsonb) to service_role;
commit;
