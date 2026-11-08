-- Real PostgreSQL lifecycle QA; ALL fixtures/settings/stock changes roll back.
begin;
insert into public.products(id,names,base_price,version) values('qa-crm-rollback','{"uk":"QA CRM rollback only"}',10,1);
insert into public.product_variants(id,product_id,names,price,stock,pillow_sizes)
values('qa-crm-variant','qa-crm-rollback','{"uk":"QA size"}',10,2,'[]');
insert into public.store_settings(id,value) values('checkout','{"orders_enabled":true}') on conflict(id) do update set value=excluded.value;
do $$
declare
  p jsonb:=jsonb_build_object('idempotency_key',repeat('c',64),'consent',true,'customer_name','QA rollback',
    'phone','+420777123456','customer_email','qa@example.invalid','carrier','nova','city','QA','branch','QA locker','delivery_verified',true,
    'city_id','11111111-1111-4111-8111-111111111111','branch_id','22222222-2222-4222-8222-222222222222',
    'delivery_type','postomat','branch_number','123','payment_method','cod','country','CZ','source','social',
    'items',jsonb_build_array(jsonb_build_object('product_id','qa-crm-rollback','variant_id','qa-crm-variant','quantity',1,'expected_amount',1000,'pillow','')));
  r jsonb; action jsonb; oid uuid; item_id uuid; result jsonb; stats jsonb;
begin
  r:=public.create_storefront_order(p);oid:=(r->>'id')::uuid;
  if not exists(select 1 from public.orders where id=oid and customer_id is not null and country='CZ' and source='social') then raise exception 'QA customer attribution failed'; end if;
  if (select count(*) from public.stock_movements where order_id=oid and reason='reserve' and delta=-1)<>1 then raise exception 'QA reserve audit failed'; end if;
  perform public.create_storefront_order(p);
  if (select count(*) from public.crm_actions where order_id=oid)<>1 then raise exception 'QA duplicate creation audit'; end if;
  action:=jsonb_build_object('id',oid,'version',1,'operation',gen_random_uuid(),'action','cancelled');
  perform public.server_crm_action(action);result:=public.server_crm_action(action);
  if result->>'duplicate'<>'true' or (select stock from public.product_variants where id='qa-crm-variant')<>2 then raise exception 'QA cancel replay failed'; end if;
  if (select count(*) from public.stock_movements where order_id=oid and reason='release')<>1 then raise exception 'QA release audit failed'; end if;
  begin
    perform public.server_crm_action(action||'{"action":"note","notes":"changed"}');raise exception 'QA expected operation conflict';
  exception when others then if sqlerrm<>'operation_conflict' then raise; end if; end;
  r:=public.create_storefront_order(jsonb_set(p,'{idempotency_key}',to_jsonb(repeat('d',64))));oid:=(r->>'id')::uuid;
  action:=jsonb_build_object('id',oid,'version',1,'operation',gen_random_uuid(),'action','processing');
  perform public.server_crm_action(action);
  begin
    perform public.server_crm_action(action||jsonb_build_object('operation',gen_random_uuid()));raise exception 'QA expected stale version';
  exception when others then if sqlerrm<>'order_conflict' then raise; end if; end;
  perform public.server_crm_action(jsonb_build_object('id',oid,'version',2,'operation',gen_random_uuid(),'action','shipped','tracking','QA-NOT-A-REAL-TTN'));
  if (select stock from public.product_variants where id='qa-crm-variant')<>1 then raise exception 'QA shipping double deduction'; end if;
  begin
    perform public.server_crm_action(jsonb_build_object('id',oid,'version',3,'operation',gen_random_uuid(),'action','completed'));raise exception 'QA unpaid completion allowed';
  exception when others then if sqlerrm<>'invalid_transition' then raise; end if; end;
  action:=jsonb_build_object('id',oid,'version',3,'operation',gen_random_uuid(),'action','payment','amount',1000,'method','cod','reference','QA-ROLLBACK-RECEIPT');
  perform public.server_crm_action(action);perform public.server_crm_action(action);
  if (select paid from public.orders where id=oid)<>1000 then raise exception 'QA payment duplicate'; end if;
  perform public.server_crm_action(jsonb_build_object('id',oid,'version',4,'operation',gen_random_uuid(),'action','completed'));
  perform public.server_crm_action(jsonb_build_object('id',oid,'version',5,'operation',gen_random_uuid(),'action','refund','amount',400,'method','bank','reference','QA-RETURN-A'));
  perform public.server_crm_action(jsonb_build_object('id',oid,'version',6,'operation',gen_random_uuid(),'action','refund','amount',600,'method','bank','reference','QA-RETURN-B'));
  begin
    perform public.server_crm_action(jsonb_build_object('id',oid,'version',7,'operation',gen_random_uuid(),'action','refund','amount',1,'method','bank','reference','QA-OVER-REFUND'));raise exception 'QA overrefund allowed';
  exception when others then if sqlerrm<>'invalid_amount' then raise; end if; end;
  select id into item_id from public.order_items where order_id=oid;
  action:=jsonb_build_object('id',oid,'version',7,'operation',gen_random_uuid(),'action','restock','items',jsonb_build_array(jsonb_build_object('id',item_id,'qty',1)));
  perform public.server_crm_action(action);perform public.server_crm_action(action);
  if (select stock from public.product_variants where id='qa-crm-variant')<>2 then raise exception 'QA restock replay failed'; end if;
  if not exists(select 1 from public.orders where id=oid and status='returned' and paid=1000 and refunded=1000 and version=8) then raise exception 'QA final state failed'; end if;
  if not exists(select 1 from public.order_items where id=item_id and returned=1) then raise exception 'QA returned quantity failed'; end if;
  if (select count(*) from public.order_transactions where order_id=oid)<>3 then raise exception 'QA financial ledger failed'; end if;
  if (select count(*) from public.stock_movements where order_id=oid and reason='restock')<>1 then raise exception 'QA restock audit failed'; end if;
  stats:=public.server_commerce_statistics((now() at time zone 'Europe/Kyiv')::date,(now() at time zone 'Europe/Kyiv')::date);
  if (stats->>'gross')::bigint<1000 or (stats->>'refunds')::bigint<1000 then raise exception 'QA statistics missing receipt'; end if;
  if has_function_privilege('anon','public.server_crm_action(jsonb)','EXECUTE') or has_function_privilege('authenticated','public.server_crm_action(jsonb)','EXECUTE') then raise exception 'QA unsafe RPC grant'; end if;
  if has_table_privilege('anon','public.store_customers','SELECT') then raise exception 'QA unsafe customer grant'; end if;
  p:=jsonb_set(p,'{idempotency_key}',to_jsonb(repeat('e',64)))||jsonb_build_object('client_request_hash',repeat('f',64));
  r:=public.create_storefront_order(p);oid:=(r->>'id')::uuid;
  result:=public.create_storefront_order(p||'{"city":"Carrier label changed","country":"UA"}');
  if r<>result then raise exception 'QA stable retry receipt failed'; end if;
  begin
    perform public.create_storefront_order(p||jsonb_build_object('client_request_hash',repeat('b',64)));raise exception 'QA altered retry allowed';
  exception when others then if sqlerrm<>'idempotency_conflict' then raise; end if; end;
end $$;
rollback;
select 'PASS: CRM cancel/replay, stale version, shipping, payment/refunds, restock, audit, statistics, restricted grants; fixtures rolled back' as result;
