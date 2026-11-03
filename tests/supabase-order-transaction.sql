-- Run in the SQL editor after 006 and 008. Every fixture and gate change rolls back.
-- No other connection can see this transaction's enabled checkout or QA product.
begin;
insert into public.products(id,names,base_price,version) values('qa-transaction-only','{"uk":"QA rollback only"}',10,1);
insert into public.product_variants(id,product_id,names,price,stock,pillow_sizes)
values('qa-transaction-variant','qa-transaction-only','{"uk":"QA"}',10,2,'["50x70"]');
insert into public.store_settings(id,value) values('checkout','{"orders_enabled":true}')
on conflict(id) do update set value=excluded.value;
do $$
declare
  p jsonb:=jsonb_build_object('idempotency_key',repeat('a',64),'consent',true,'customer_name','QA rollback',
    'phone','+420777123456','carrier','nova','city','QA city','branch','QA locker','delivery_verified',true,
    'city_id','11111111-1111-4111-8111-111111111111','branch_id','22222222-2222-4222-8222-222222222222',
    'delivery_type','postomat','branch_number','123','payment_method','cod',
    'items',jsonb_build_array(jsonb_build_object('product_id','qa-transaction-only','variant_id','qa-transaction-variant','quantity',1,'expected_amount',1000,'pillow','50x70')));
  r jsonb;
  again jsonb;
  payment jsonb;
begin
  begin
    perform public.create_storefront_order(jsonb_set(p,'{items,0,expected_amount}','1'));
    raise exception 'QA expected price rejection';
  exception when others then if sqlerrm<>'price_changed' then raise; end if; end;
  begin
    perform public.create_storefront_order(jsonb_set(p,'{items,0,pillow}','"70x70"'));
    raise exception 'QA expected pillow rejection';
  exception when others then if sqlerrm<>'invalid_pillow' then raise; end if; end;
  begin
    perform public.create_storefront_order(jsonb_set(p,'{delivery_verified}','false'));
    raise exception 'QA expected delivery rejection';
  exception when others then if sqlerrm<>'delivery_not_verified' then raise; end if; end;
  update public.product_variants set price=null where id='qa-transaction-variant';
  begin
    perform public.create_storefront_order(p);
    raise exception 'QA expected null price rejection';
  exception when others then if sqlerrm<>'price_changed' then raise; end if; end;
  update public.product_variants set price=10 where id='qa-transaction-variant';
  r:=public.create_storefront_order(p);
  again:=public.create_storefront_order(p);
  if r<>again or (r->>'total')::numeric<>10 then raise exception 'QA receipt/idempotency failed'; end if;
  if (select stock from public.product_variants where id='qa-transaction-variant')<>1 then raise exception 'QA duplicate stock deduction'; end if;
  if (select version from public.products where id='qa-transaction-only')<>2 then raise exception 'QA product version not bumped'; end if;
  if not exists(select 1 from public.orders where id=(r->>'id')::uuid and delivery_reference->>'branch_id'=p->>'branch_id' and delivery_reference->>'type'='postomat') then raise exception 'QA delivery snapshot lost'; end if;
  if not exists(select 1 from public.order_items where order_id=(r->>'id')::uuid and pillow='50x70') then raise exception 'QA pillow snapshot lost'; end if;
  begin
    perform public.create_storefront_order(jsonb_set(p,'{comment}','"different"'));
    raise exception 'QA expected idempotency conflict';
  exception when others then if sqlerrm<>'idempotency_conflict' then raise; end if; end;
  begin
    perform public.create_storefront_order(jsonb_set(jsonb_set(p,'{idempotency_key}',to_jsonb(repeat('b',64))),'{items,0,quantity}','2'));
    raise exception 'QA expected stock rejection';
  exception when others then if sqlerrm<>'out_of_stock' then raise; end if; end;
  -- Database ledger test only, not a real provider callback or HTTPS test.
  update public.orders set payment_method='card' where id=(r->>'id')::uuid;
  payment:=jsonb_build_object('sandbox',true,'currency','UAH','paymentId','999000123456789',
    'status','sandbox','amount',1000,'orderId',r->>'id');
  perform public.server_record_sandbox_payment(payment);
  again:=public.server_record_sandbox_payment(payment);
  if again->>'duplicate'<>'true' then raise exception 'QA payment duplicate failed'; end if;
  if (select count(*) from public.sandbox_payment_events where order_id=(r->>'id')::uuid)<>1 then raise exception 'QA duplicate payment event'; end if;
  begin
    perform public.server_record_sandbox_payment(jsonb_set(payment,'{amount}','1'));
    raise exception 'QA expected payment amount rejection';
  exception when others then if sqlerrm<>'payment_mismatch' then raise; end if; end;
  perform public.server_record_sandbox_payment(jsonb_set(payment,'{status}','"processing"'));
  if not exists(select 1 from public.orders where id=(r->>'id')::uuid and sandbox_payment_status='paid' and payment_status='pending') then raise exception 'QA sandbox isolation/downgrade failed'; end if;
end $$;
rollback;
select 'PASS: rollback-only order safety and sandbox ledger deduplication/amount/isolation checks' as result;
