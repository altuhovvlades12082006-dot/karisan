-- QA data separation. Does not enable real checkout. All QA writes are service-only.
begin;
alter table public.products add column is_test boolean not null default false;
alter table public.orders add column is_test boolean not null default false;
alter table public.store_customers add column is_test boolean not null default false;
alter table public.stock_movements add column is_test boolean not null default false;
alter table public.store_customers drop constraint store_customers_phone_key;
alter table public.store_customers add constraint customers_phone_scope unique(phone,is_test);
alter policy "public reads active products" on public.products using ((is_active and not is_test) or public.is_admin());
alter policy "public reads active variants" on public.product_variants using (
  is_active and exists(select 1 from public.products p where p.id=product_id and p.is_active and not p.is_test) or public.is_admin());

create or replace function public.create_storefront_order(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt jsonb; cid text; oid uuid; prior public.orders; existed boolean;
  testing boolean:=coalesce(payload->>'is_test','false')='true'; original_settings jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(payload->>'idempotency_key',''),0));
  select * into prior from public.orders where idempotency_key=payload->>'idempotency_key';existed:=found;
  if existed and prior.is_test<>testing then raise exception 'idempotency_conflict'; end if;
  if existed and prior.client_request_hash is not null then
    if prior.client_request_hash is distinct from payload->>'client_request_hash' then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('id',prior.id,'order_number',prior.order_number,'total',prior.total);
  end if;
  if payload ? 'client_request_hash' and coalesce(payload->>'client_request_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_idempotency_key'; end if;
  if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'invalid_items'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'items') x left join public.products p on p.id=x->>'product_id' where p.id is null or p.is_test<>testing) then raise exception 'product_unavailable'; end if;
  if testing then
    if payload->>'customer_email' is distinct from 'qa@example.invalid' or left(coalesce(payload->>'customer_name',''),3)<>'QA ' then raise exception 'invalid_customer_or_delivery'; end if;
    select value into original_settings from public.store_settings where id='checkout' for update;
    if original_settings is null or original_settings->>'orders_enabled' is distinct from 'false' then raise exception 'qa_disabled_when_live'; end if;
    -- Only this uncommitted transaction sees the temporary switch. Restored before return.
    update public.store_settings set value=jsonb_set(value,'{orders_enabled}','true') where id='checkout';
  end if;
  perform set_config('karisan.stock_reason','reserve',true);perform set_config('karisan.reservation_key',payload->>'idempotency_key',true);
  receipt:=public.server_reserve_order_v8(payload);
  if testing then update public.store_settings set value=original_settings where id='checkout'; end if;
  if existed then
    perform set_config('karisan.stock_reason','',true);perform set_config('karisan.reservation_key','',true);return receipt;
  end if;
  oid:=(receipt->>'id')::uuid;
  cid:=encode(sha256(convert_to((case when testing then 'qa-customer:' else 'customer:' end)||(payload->>'phone'),'UTF8')),'hex');
  insert into public.store_customers(id,phone,name,email,is_test) values(cid,payload->>'phone',trim(payload->>'customer_name'),coalesce(payload->>'customer_email',''),testing) on conflict(phone,is_test) do nothing;
  update public.orders set customer_id=cid,client_request_hash=payload->>'client_request_hash',is_test=testing,
    order_number=case when testing then 'QA-'||oid::text else order_number end,
    country=case when coalesce(payload->>'country','') ~ '^[A-Z]{2}$' then payload->>'country' else 'ZZ' end,
    source=case when payload->>'source' in ('direct','search','social','other') then payload->>'source' else 'direct' end where id=oid;
  update public.stock_movements set order_id=oid where order_id is null and reason='reserve'
    and reservation_key=payload->>'idempotency_key' and variant_id in (select variant_id from public.order_items where order_id=oid);
  insert into public.crm_actions(id,order_id,kind,request_hash) values(oid,oid,'created',payload->>'idempotency_key');
  perform set_config('karisan.stock_reason','',true);perform set_config('karisan.reservation_key','',true);
  select jsonb_build_object('id',id,'order_number',order_number,'total',total) into receipt from public.orders where id=oid;
  return receipt;
end $$;

-- Keep production customer/count/statistics aggregates free of QA data.
do $$ declare definition text;
begin
  select pg_get_functiondef('public.server_audit_stock()'::regprocedure) into definition;
  if strpos(definition,'order_id,reservation_key,name,delta,reason)')=0 then raise exception 'Unexpected stock audit function'; end if;
  definition:=replace(definition,'order_id,reservation_key,name,delta,reason)','order_id,reservation_key,name,delta,reason,is_test)');
  definition:=replace(definition,'difference,reason_value from public.products','difference,reason_value,is_test from public.products');
  execute definition;
  select pg_get_functiondef('public.server_crm_customers(text,integer)'::regprocedure) into definition;
  if strpos(definition,'where strpos(')=0 then raise exception 'Unexpected customer function'; end if;
  execute replace(definition,'where strpos(','where not c.is_test and strpos(');
  select pg_get_functiondef('public.server_crm_counts()'::regprocedure) into definition;
  if strpos(definition,'from public.orders group by status')=0 then raise exception 'Unexpected count function'; end if;
  execute replace(definition,'from public.orders group by status','from public.orders where not is_test group by status');
  select pg_get_functiondef('public.server_commerce_statistics(date,date)'::regprocedure) into definition;
  if strpos(definition,'from public.orders where created_at>=begins')=0 then raise exception 'Unexpected statistics function'; end if;
  definition:=replace(definition,'from public.orders where created_at>=begins','from public.orders where not is_test and created_at>=begins');
  definition:=replace(definition,'from public.order_transactions where created_at>=begins','from public.order_transactions where order_id in (select id from public.orders where not is_test) and created_at>=begins');
  definition:=replace(definition,$patch$from public.orders where status in ('new','processing')$patch$,$patch$from public.orders where not is_test and status in ('new','processing')$patch$);
  execute definition;
end $$;
revoke all on function public.create_storefront_order(jsonb) from public,anon,authenticated;
grant execute on function public.create_storefront_order(jsonb) to service_role;
commit;
