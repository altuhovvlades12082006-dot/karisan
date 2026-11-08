-- A successful order can be retried even if carrier labels/country later change.
begin;
alter table public.orders add column client_request_hash text;
create or replace function public.create_storefront_order(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt jsonb; cid text; oid uuid; existed boolean; prior public.orders;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(payload->>'idempotency_key',''),0));
  select * into prior from public.orders where idempotency_key=payload->>'idempotency_key';
  existed:=found;
  if existed and prior.client_request_hash is not null then
    if prior.client_request_hash is distinct from payload->>'client_request_hash' then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('id',prior.id,'order_number',prior.order_number,'total',prior.total);
  end if;
  if payload ? 'client_request_hash' and coalesce(payload->>'client_request_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'invalid_idempotency_key'; end if;
  perform set_config('karisan.stock_reason','reserve',true);
  perform set_config('karisan.reservation_key',payload->>'idempotency_key',true);
  receipt:=public.server_reserve_order_v8(payload);
  if existed then
    perform set_config('karisan.stock_reason','',true);perform set_config('karisan.reservation_key','',true);return receipt;
  end if;
  oid:=(receipt->>'id')::uuid;
  cid:=encode(sha256(convert_to('customer:'||(payload->>'phone'),'UTF8')),'hex');
  insert into public.store_customers(id,phone,name,email) values(cid,payload->>'phone',trim(payload->>'customer_name'),coalesce(payload->>'customer_email','')) on conflict(phone) do nothing;
  update public.orders set customer_id=cid,client_request_hash=payload->>'client_request_hash',
    country=case when coalesce(payload->>'country','') ~ '^[A-Z]{2}$' then payload->>'country' else 'ZZ' end,
    source=case when payload->>'source' in ('direct','search','social','other') then payload->>'source' else 'direct' end where id=oid;
  update public.stock_movements set order_id=oid where order_id is null and reason='reserve'
    and reservation_key=payload->>'idempotency_key' and variant_id in (select variant_id from public.order_items where order_id=oid);
  insert into public.crm_actions(id,order_id,kind,request_hash) values(oid,oid,'created',payload->>'idempotency_key');
  perform set_config('karisan.stock_reason','',true);perform set_config('karisan.reservation_key','',true);
  return receipt;
end $$;
revoke all on function public.create_storefront_order(jsonb) from public,anon,authenticated;
grant execute on function public.create_storefront_order(jsonb) to service_role;
commit;
