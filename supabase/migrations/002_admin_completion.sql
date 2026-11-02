-- Run AFTER 001_commerce.sql. Changes preserve the existing catalogue and orders.
begin;
alter table public.products add column if not exists image_urls jsonb not null default '[]'::jsonb;

-- Public visitors cannot read variants of unpublished products.
drop policy if exists "public reads active variants" on public.product_variants;
create policy "public reads active variants" on public.product_variants for select using (
  public.is_admin() or (is_active and exists (
    select 1 from public.products p where p.id=product_id and p.is_active
  ))
);

-- Authenticated browser sessions can save product + all variants atomically.
-- Existing variants are never deleted, preserving references from historical orders.
create or replace function public.admin_save_product(payload jsonb)
returns text language plpgsql security invoker set search_path=public
as $$
declare
  target_product_id text := payload->>'id';
  v jsonb;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if coalesce(length(target_product_id),0)=0 or coalesce(length(payload->'names'->>'uk'),0)=0
     or coalesce(jsonb_typeof(payload->'variants'),'null')<>'array'
     or jsonb_array_length(payload->'variants')=0 then raise exception 'invalid_product'; end if;
  insert into public.products(id,names,description,category_slug,base_price,image_url,image_urls,is_active,is_new)
  values(target_product_id,payload->'names',coalesce(payload->'description','{}'),payload->>'category_slug',
    (payload->>'base_price')::numeric,payload->>'image_url',coalesce(payload->'image_urls','[]'),
    (payload->>'is_active')::boolean,(payload->>'is_new')::boolean)
  on conflict(id) do update set names=excluded.names,description=excluded.description,
    category_slug=excluded.category_slug,base_price=excluded.base_price,image_url=excluded.image_url,
    image_urls=excluded.image_urls,is_active=excluded.is_active,is_new=excluded.is_new;
  -- Serialize edits to this product and reject variant IDs belonging to other products.
  perform 1 from public.products p where p.id=target_product_id for update;
  for v in select * from jsonb_array_elements(payload->'variants') loop
    if exists(select 1 from public.product_variants pv where pv.id=v->>'id' and pv.product_id<>target_product_id) then
      raise exception 'variant_belongs_to_another_product';
    end if;
    if coalesce(length(v->>'id'),0)=0 or coalesce(length(v->'names'->>'uk'),0)=0 then raise exception 'invalid_variant'; end if;
    insert into public.product_variants(id,product_id,names,sku,price,stock,pillow_sizes,is_active)
    values(v->>'id',target_product_id,v->'names',nullif(v->>'sku',''),(v->>'price')::numeric,
      (v->>'stock')::integer,coalesce(v->'pillow_sizes','[]'),coalesce((v->>'is_active')::boolean,true))
    on conflict(id) do update set names=excluded.names,sku=excluded.sku,price=excluded.price,
      stock=excluded.stock,pillow_sizes=excluded.pillow_sizes,is_active=excluded.is_active;
  end loop;
  return target_product_id;
end $$;
revoke all on function public.admin_save_product(jsonb) from public, anon;
grant execute on function public.admin_save_product(jsonb) to authenticated;

-- Public product images; uploads are restricted to authorised admins.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "admin uploads product images" on storage.objects;
create policy "admin uploads product images" on storage.objects for insert to authenticated
with check(bucket_id='product-images' and public.is_admin() and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "read product images" on storage.objects;
create policy "read product images" on storage.objects for select to anon,authenticated using(bucket_id='product-images');

-- Explicit grants are needed on projects whose default privileges are restrictive.
grant usage on schema public to anon,authenticated;
grant select on public.categories,public.products,public.product_variants,public.promotions,public.store_settings to anon;
grant select on public.admin_profiles to authenticated;
grant select,insert,update,delete on public.categories,public.products,public.product_variants,public.orders,public.order_items,public.promotions,public.store_settings to authenticated;
-- Orders may only be inserted by the existing secured checkout RPC or an admin.
revoke all on function public.create_storefront_order(jsonb) from public;
grant execute on function public.create_storefront_order(jsonb) to anon,authenticated;
commit;
