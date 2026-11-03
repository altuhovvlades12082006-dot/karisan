-- Review and apply after 007. Does not enable checkout or alter existing orders.
begin;
alter table public.order_items add column if not exists pillow text not null default '';

create or replace function public.create_storefront_order(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  existing public.orders;
  created public.orders;
  item jsonb;
  variant public.product_variants;
  product public.products;
  product_key text;
  qty integer;
  calculated numeric(12,2):=0;
  fingerprint text;
  order_key text:=payload->>'idempotency_key';
begin
  if order_key is null or order_key !~ '^[a-f0-9]{64}$' then raise exception 'invalid_idempotency_key'; end if;
  fingerprint:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(order_key,0));
  select * into existing from public.orders where idempotency_key=order_key;
  if found then
    if existing.request_hash is distinct from fingerprint then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('id',existing.id,'order_number',existing.order_number,'total',existing.total);
  end if;
  if not exists(select 1 from public.store_settings where id='checkout' and value->'orders_enabled'='true'::jsonb) then
    raise exception 'orders_disabled';
  end if;
  if coalesce(payload->>'payment_method','cod')<>'cod' then raise exception 'card_not_enabled'; end if;
  if coalesce(payload->>'consent','')<>'true'
     or coalesce(length(trim(payload->>'customer_name')),0) not between 3 and 100
     or coalesce(payload->>'phone','') !~ '^\+[1-9][0-9]{6,14}$'
     or coalesce(length(payload->>'customer_email'),0)>254
     or coalesce(payload->>'carrier','') not in ('nova','ukr')
     or coalesce(length(trim(payload->>'city')),0) not between 1 and 100
     or coalesce(length(trim(payload->>'branch')),0) not between 1 and 200
     or (payload->>'carrier'='ukr' and coalesce(payload->>'postcode','') !~ '^[0-9]{5}$')
  then raise exception 'invalid_customer_or_delivery'; end if;
  -- Only a server-verified carrier selection may reach this service-only RPC.
  if payload->>'delivery_verified' is distinct from 'true' then raise exception 'delivery_not_verified'; end if;
  if payload->>'carrier'='nova' and (
    coalesce(payload->>'city_id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or coalesce(payload->>'branch_id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or coalesce(payload->>'delivery_type','') not in ('branch','postomat')
  ) then raise exception 'invalid_delivery_reference'; end if;
  if payload->>'carrier'='ukr' and coalesce(payload->>'branch_id','') !~ '^[0-9]{1,12}$' then raise exception 'invalid_delivery_reference'; end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'invalid_items'; end if;
  if jsonb_array_length(payload->'items') not between 1 and 25 then raise exception 'invalid_items'; end if;
  -- Match catalogue-save lock order: product advisory lock, product row, variants.
  for product_key in select distinct x->>'product_id' from jsonb_array_elements(payload->'items') x order by 1 loop
    if product_key is null then raise exception 'product_unavailable'; end if;
    perform pg_advisory_xact_lock(hashtextextended('catalog:'||product_key,0));
    perform id from public.products where id=product_key for update;
  end loop;
  perform v.id from public.product_variants v
    where v.id in (select x->>'variant_id' from jsonb_array_elements(payload->'items') x)
    order by v.id for update;
  insert into public.orders(order_number,customer_name,customer_email,phone,carrier,city,branch,postcode,payment_method,comment,idempotency_key,request_hash,delivery_reference)
  values('KS-'||gen_random_uuid()::text,trim(payload->>'customer_name'),nullif(payload->>'customer_email',''),
    payload->>'phone',payload->>'carrier',payload->>'city',payload->>'branch',nullif(payload->>'postcode',''),'cod',
    left(coalesce(payload->>'comment',''),500),order_key,fingerprint,
    jsonb_build_object('branch_id',payload->>'branch_id','city_id',payload->>'city_id',
      'branch_number',payload->>'branch_number','type',payload->>'delivery_type','verified',true)) returning * into created;
  for item in select * from jsonb_array_elements(payload->'items') loop
    if jsonb_typeof(item->'quantity') is distinct from 'number'
       or coalesce(item->>'quantity','') !~ '^[0-9]{1,3}$'
       or coalesce(item->>'expected_amount','') !~ '^[0-9]{1,9}$'
    then raise exception 'invalid_quantity_or_price'; end if;
    qty:=(item->>'quantity')::integer;
    if qty not between 1 and 100 then raise exception 'invalid_quantity'; end if;
    select * into variant from public.product_variants where id=item->>'variant_id' and is_active for update;
    if not found or variant.stock<qty then raise exception 'out_of_stock'; end if;
    if variant.product_id is distinct from item->>'product_id' then raise exception 'product_unavailable'; end if;
    select * into product from public.products where id=variant.product_id and is_active;
    if not found then raise exception 'product_unavailable'; end if;
    if variant.price is null or variant.price<=0 or variant.price*100<>(item->>'expected_amount')::bigint then raise exception 'price_changed'; end if;
    if (jsonb_array_length(variant.pillow_sizes)>0 and not variant.pillow_sizes ? coalesce(item->>'pillow',''))
       or (jsonb_array_length(variant.pillow_sizes)=0 and coalesce(item->>'pillow','')<>'') then
      raise exception 'invalid_pillow';
    end if;
    calculated:=calculated+variant.price*qty;
    if calculated>1000000 then raise exception 'order_too_large'; end if;
    insert into public.order_items(order_id,product_id,variant_id,product_name,variant_name,sku,quantity,unit_price,line_total,pillow)
    values(created.id,product.id,variant.id,coalesce(product.names->>'uk','Товар'),coalesce(variant.names->>'uk',''),variant.sku,qty,variant.price,variant.price*qty,coalesce(item->>'pillow',''));
    update public.product_variants set stock=stock-qty where id=variant.id;
  end loop;
  -- A previously opened admin product form must not overwrite reserved stock.
  update public.products set version=version+1,updated_at=now()
    where id in (select x->>'product_id' from jsonb_array_elements(payload->'items') x);
  update public.orders set subtotal=calculated,total=calculated where id=created.id;
  return jsonb_build_object('id',created.id,'order_number',created.order_number,'total',calculated);
end $$;
revoke all on function public.create_storefront_order(jsonb) from public,anon,authenticated;
grant execute on function public.create_storefront_order(jsonb) to service_role;
commit;
