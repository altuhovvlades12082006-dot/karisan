-- Apply 001, 002 and 003 together on staging, never 001 alone.
-- No catalogue seed, deletion, activation or destructive schema migration.
begin;
alter table public.orders add column if not exists idempotency_key text;
alter table public.orders add column if not exists request_hash text;
alter table public.orders add column if not exists payment_status text not null default 'pending';
alter table public.orders add column if not exists delivery_status text not null default 'unfulfilled';
alter table public.orders add column if not exists delivery_reference jsonb not null default '{}'::jsonb;
create unique index if not exists orders_idempotency_key on public.orders(idempotency_key);

-- A raw anonymous RPC bypasses the server's rate limits and carrier validation.
revoke all on function public.create_storefront_order(jsonb) from public,anon,authenticated;
-- Do not expose arbitrary future private settings through a SELECT-all policy.
drop policy if exists "public reads settings" on public.store_settings;
-- The existing public catalogue does not require internal promotion codes.
drop policy if exists "public reads active promos" on public.promotions;

create or replace function public.create_storefront_order(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  existing public.orders;
  created public.orders;
  item jsonb;
  variant public.product_variants;
  product public.products;
  qty integer;
  calculated numeric(12,2):=0;
  fingerprint text;
  order_key text:=payload->>'idempotency_key';
begin
  if order_key is null or order_key !~ '^[a-f0-9]{64}$' then raise exception 'invalid_idempotency_key'; end if;
  fingerprint:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  -- Serialize only identical keys; conflicting requests cannot reserve stock twice.
  perform pg_advisory_xact_lock(hashtextextended(order_key,0));
  select * into existing from public.orders where idempotency_key=order_key;
  if found then
    if existing.request_hash is distinct from fingerprint then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('id',existing.id,'order_number',existing.order_number,'total',existing.total);
  end if;
  -- Deliberately opt-in on the server. Payment remains COD-only until a separate release.
  if not exists(select 1 from public.store_settings where id='checkout' and value->'orders_enabled'='true'::jsonb) then
    raise exception 'orders_disabled';
  end if;
  if coalesce(payload->>'payment_method','cod')<>'cod' then raise exception 'card_not_enabled'; end if;
  if coalesce(payload->>'consent','')<>'true'
     or coalesce(length(trim(payload->>'customer_name')),0) not between 3 and 100
     or coalesce(payload->>'phone','') !~ '^\+380[3-9][0-9]{8}$'
     or coalesce(length(payload->>'customer_email'),0)>254
     or coalesce(payload->>'carrier','') not in ('nova','ukr')
     or coalesce(length(trim(payload->>'city')),0) not between 1 and 100
     or coalesce(length(trim(payload->>'branch')),0) not between 1 and 200
     or (payload->>'carrier'='ukr' and coalesce(payload->>'postcode','') !~ '^[0-9]{5}$')
  then raise exception 'invalid_customer_or_delivery'; end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(payload->'items') not between 1 and 25 then raise exception 'invalid_items'; end if;
  -- Fixed lock order prevents reversed baskets deadlocking on variant stock.
  perform v.id from public.product_variants v
    where v.id in (select x->>'variant_id' from jsonb_array_elements(payload->'items') x)
    order by v.id for update;
  insert into public.orders(order_number,customer_name,customer_email,phone,carrier,city,branch,postcode,payment_method,comment,idempotency_key,request_hash,delivery_reference)
  values('KS-'||gen_random_uuid()::text,trim(payload->>'customer_name'),nullif(payload->>'customer_email',''),
    payload->>'phone',payload->>'carrier',payload->>'city',payload->>'branch',nullif(payload->>'postcode',''),'cod',
    left(coalesce(payload->>'comment',''),500),order_key,fingerprint,
    jsonb_build_object('branch_id',payload->>'branch_id','city_id',payload->>'city_id')) returning * into created;
  for item in select * from jsonb_array_elements(payload->'items') loop
    -- Explicit NULL/type checks: SQL NULL does not satisfy `qty < 1`.
    if jsonb_typeof(item->'quantity') is distinct from 'number'
       or coalesce(item->>'quantity','') !~ '^[0-9]{1,3}$'
       or coalesce(item->>'expected_amount','') !~ '^[0-9]{1,9}$'
    then raise exception 'invalid_quantity_or_price'; end if;
    qty:=(item->>'quantity')::integer;
    if qty not between 1 and 100 then raise exception 'invalid_quantity'; end if;
    select * into variant from public.product_variants where id=item->>'variant_id' and is_active for update;
    if not found or variant.stock<qty then raise exception 'out_of_stock'; end if;
    select * into product from public.products where id=variant.product_id and is_active;
    if not found then raise exception 'product_unavailable'; end if;
    if variant.price<=0 or variant.price*100<>(item->>'expected_amount')::bigint then raise exception 'price_changed'; end if;
    calculated:=calculated+variant.price*qty;
    if calculated>1000000 then raise exception 'order_too_large'; end if;
    insert into public.order_items(order_id,product_id,variant_id,product_name,variant_name,sku,quantity,unit_price,line_total)
    values(created.id,product.id,variant.id,coalesce(product.names->>'uk','Товар'),coalesce(variant.names->>'uk',''),variant.sku,qty,variant.price,variant.price*qty);
    update public.product_variants set stock=stock-qty where id=variant.id;
  end loop;
  update public.orders set subtotal=calculated,total=calculated where id=created.id;
  return jsonb_build_object('id',created.id,'order_number',created.order_number,'total',calculated);
end $$;
revoke all on function public.create_storefront_order(jsonb) from public,anon,authenticated;
grant execute on function public.create_storefront_order(jsonb) to service_role;
-- No automatic order acceptance, merchant activation or data backfill.
insert into public.store_settings(id,value) values('checkout','{"orders_enabled":false}') on conflict(id) do nothing;
commit;
