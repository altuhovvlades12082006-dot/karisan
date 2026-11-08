-- Additive CRM migration, after 006 and 008. Never enables checkout.
begin;
create table public.store_customers (
  id text primary key, phone text not null unique, name text not null,
  email text not null default '', notes text not null default '', version integer not null default 1,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.orders add column customer_id text references public.store_customers(id);
alter table public.orders add column version integer not null default 1;
alter table public.orders add column stock_state text not null default 'reserved' check(stock_state in ('reserved','sold','released'));
alter table public.orders add column paid bigint not null default 0 check(paid>=0);
alter table public.orders add column refunded bigint not null default 0 check(refunded>=0 and refunded<=paid);
alter table public.orders add column tracking text not null default '';
alter table public.orders add column notes text not null default '';
alter table public.orders add column country text not null default 'ZZ';
alter table public.orders add column source text not null default 'direct';
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check check(status in ('new','processing','shipped','completed','cancelled','returned'));
alter table public.order_items add column returned integer not null default 0 check(returned>=0 and returned<=quantity);
-- Preserve older payment facts. Closed historical stock requires explicit review.
update public.orders set paid=round(total*100) where payment_status='paid';
update public.orders set stock_state=case when status='cancelled' then 'released' when status in ('shipped','completed') then 'sold' else 'reserved' end;
create table public.crm_actions (
  id uuid primary key,order_id uuid not null references public.orders(id),kind text not null,
  request_hash text not null,details jsonb not null default '{}',created_at timestamptz not null default now()
);
create table public.order_transactions (
  id uuid primary key,order_id uuid not null references public.orders(id),type text not null check(type in ('payment','refund')),
  amount bigint not null check(amount>0),method text not null check(method in ('cod','bank')),reference text not null,
  created_at timestamptz not null default now()
);
create unique index crm_receipt_once on public.order_transactions(type,method,reference);
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),product_id text not null,variant_id text not null,
  order_id uuid references public.orders(id),reservation_key text,name text not null,delta integer not null,reason text not null,
  created_at timestamptz not null default now()
);
create index crm_orders_created on public.orders(created_at desc,id);
create index crm_actions_order on public.crm_actions(order_id,created_at);
create index crm_transactions_order on public.order_transactions(order_id,created_at);
create index crm_stock_created on public.stock_movements(created_at desc,id);
alter table public.store_customers enable row level security;
alter table public.crm_actions enable row level security;
alter table public.order_transactions enable row level security;
alter table public.stock_movements enable row level security;
revoke all on public.store_customers,public.crm_actions,public.order_transactions,public.stock_movements from public,anon,authenticated;
grant select,insert,update on public.store_customers,public.crm_actions,public.order_transactions,public.stock_movements to service_role;

create function public.server_audit_stock() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare difference integer; reason_value text; order_value uuid;
begin
  difference:=new.stock-case when tg_op='INSERT' then 0 else old.stock end;
  if difference=0 then return new; end if;
  reason_value:=coalesce(nullif(current_setting('karisan.stock_reason',true),''),'adjustment');
  order_value:=nullif(current_setting('karisan.order_id',true),'')::uuid;
  insert into public.stock_movements(product_id,variant_id,order_id,reservation_key,name,delta,reason)
    select new.product_id,new.id,order_value,nullif(current_setting('karisan.reservation_key',true),''),coalesce(names->>'uk',id),difference,reason_value from public.products where id=new.product_id;
  return new;
end $$;
create trigger crm_stock_audit after insert or update of stock on public.product_variants for each row execute function public.server_audit_stock();
revoke all on function public.server_audit_stock() from public,anon,authenticated;

-- Keep the proven reservation function private behind an audited wrapper.
alter function public.create_storefront_order(jsonb) rename to server_reserve_order_v8;
revoke all on function public.server_reserve_order_v8(jsonb) from public,anon,authenticated,service_role;
create function public.create_storefront_order(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt jsonb; cid text; oid uuid; existed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(payload->>'idempotency_key',''),0));
  select exists(select 1 from public.orders where idempotency_key=payload->>'idempotency_key') into existed;
  perform set_config('karisan.stock_reason','reserve',true);
  perform set_config('karisan.reservation_key',payload->>'idempotency_key',true);
  receipt:=public.server_reserve_order_v8(payload);
  if existed then
    perform set_config('karisan.stock_reason','',true);perform set_config('karisan.reservation_key','',true);
    return receipt;
  end if;
  oid:=(receipt->>'id')::uuid;
  cid:=encode(sha256(convert_to('customer:'||(payload->>'phone'),'UTF8')),'hex');
  insert into public.store_customers(id,phone,name,email) values(cid,payload->>'phone',trim(payload->>'customer_name'),coalesce(payload->>'customer_email','')) on conflict(phone) do nothing;
  update public.orders set customer_id=cid,
    country=case when coalesce(payload->>'country','') ~ '^[A-Z]{2}$' then payload->>'country' else 'ZZ' end,
    source=case when payload->>'source' in ('direct','search','social','other') then payload->>'source' else 'direct' end where id=oid;
  -- The reserve trigger ran before the order UUID existed. Link by unique reservation key.
  update public.stock_movements set order_id=oid where order_id is null and reason='reserve'
    and reservation_key=payload->>'idempotency_key'
    and variant_id in (select variant_id from public.order_items where order_id=oid);
  insert into public.crm_actions(id,order_id,kind,request_hash) values(oid,oid,'created',payload->>'idempotency_key');
  perform set_config('karisan.stock_reason','',true);
  perform set_config('karisan.reservation_key','',true);
  return receipt;
end $$;

create function public.server_crm_action(payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  o public.orders; prior public.crm_actions; i public.order_items; entry jsonb;
  oid uuid:=(payload->>'id')::uuid; operation_id uuid:=(payload->>'operation')::uuid;
  fingerprint text:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
  action_value text:=payload->>'action'; amount_value bigint; product_key text; qty integer;
  seen uuid[]:='{}'; tracking_value text; note_value text;
begin
  if oid is null or operation_id is null then raise exception 'invalid_action'; end if;
  perform pg_advisory_xact_lock(hashtextextended('crm:'||operation_id::text,0));
  select * into prior from public.crm_actions where id=operation_id;
  if found then
    if prior.order_id<>oid or prior.request_hash<>fingerprint then raise exception 'operation_conflict'; end if;
    return jsonb_build_object('ok',true,'duplicate',true);
  end if;
  select * into o from public.orders where id=oid for update;
  if not found then raise exception 'order_missing'; end if;
  if o.version is distinct from (payload->>'version')::integer then raise exception 'order_conflict'; end if;
  if action_value='processing' then
    if o.status<>'new' then raise exception 'invalid_transition'; end if; o.status:='processing';
  elsif action_value='shipped' then
    tracking_value:=trim(coalesce(payload->>'tracking',''));
    if o.status not in ('new','processing') or length(tracking_value) not between 1 and 60 then raise exception 'invalid_transition'; end if;
    o.status:='shipped';o.stock_state:='sold';o.tracking:=tracking_value;
  elsif action_value='completed' then
    if o.status<>'shipped' or o.paid<round(o.total*100) then raise exception 'invalid_transition'; end if; o.status:='completed';
  elsif action_value='note' then
    note_value:=coalesce(payload->>'notes','');
    if length(note_value)>3000 then raise exception 'invalid_action'; end if; o.notes:=trim(note_value);
  elsif action_value in ('payment','refund') then
    if coalesce(payload->>'amount','') !~ '^[0-9]{1,9}$' then raise exception 'invalid_amount'; end if;
    amount_value:=(payload->>'amount')::bigint;
    if amount_value<1 or coalesce(payload->>'method','') not in ('cod','bank') or coalesce(length(trim(payload->>'reference')),0) not between 1 and 100 then raise exception 'invalid_receipt'; end if;
    if action_value='payment' then
      if o.status in ('cancelled','returned') or o.paid<>0 or amount_value<>round(o.total*100) then raise exception 'invalid_amount'; end if;
      o.paid:=o.paid+amount_value;
    else
      if amount_value>o.paid-o.refunded then raise exception 'invalid_amount'; end if; o.refunded:=o.refunded+amount_value;
    end if;
    insert into public.order_transactions(id,order_id,type,amount,method,reference) values(operation_id,oid,action_value,amount_value,payload->>'method',trim(payload->>'reference'));
  elsif action_value in ('cancelled','restock') then
    if action_value='cancelled' then
      if o.status not in ('new','processing') or o.stock_state<>'reserved' or o.paid>o.refunded then raise exception 'invalid_transition'; end if;
    else
      if o.status not in ('shipped','completed','returned') or o.stock_state<>'sold' then raise exception 'invalid_transition'; end if;
      if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'invalid_return'; end if;
      if jsonb_array_length(payload->'items') not between 1 and 25 then raise exception 'invalid_return'; end if;
      for entry in select * from jsonb_array_elements(payload->'items') loop
        if coalesce(entry->>'qty','') !~ '^[0-9]{1,3}$' then raise exception 'invalid_return'; end if;
        select * into i from public.order_items where id=(entry->>'id')::uuid and order_id=oid;
        qty:=(entry->>'qty')::integer;
        if not found or i.id=any(seen) or qty<1 or qty>i.quantity-i.returned then raise exception 'invalid_return'; end if;
        seen:=array_append(seen,i.id);
      end loop;
    end if;
    -- Same product-before-variant lock ordering as reservation/catalogue updates.
    for product_key in select distinct product_id from public.order_items where order_id=oid order by 1 loop
      perform pg_advisory_xact_lock(hashtextextended('catalog:'||product_key,0));
      perform id from public.products where id=product_key for update;
    end loop;
    perform v.id from public.product_variants v where v.id in (select variant_id from public.order_items where order_id=oid) order by v.id for update;
    perform set_config('karisan.stock_reason',case when action_value='cancelled' then 'release' else 'restock' end,true);
    perform set_config('karisan.order_id',oid::text,true);
    for i in select * from public.order_items where order_id=oid loop
      if action_value='cancelled' then qty:=i.quantity;
      else select (x->>'qty')::integer into qty from jsonb_array_elements(payload->'items') x where x->>'id'=i.id::text; end if;
      if coalesce(qty,0)>0 then
        update public.product_variants set stock=stock+qty where id=i.variant_id and product_id=i.product_id and stock+qty<=100000;
        if not found then raise exception 'variant_missing'; end if;
        if action_value='restock' then update public.order_items set returned=returned+qty where id=i.id; end if;
      end if;
    end loop;
    update public.products set version=version+1 where id in (select product_id from public.order_items where order_id=oid);
    if action_value='cancelled' then o.status:='cancelled';o.stock_state:='released';
    elsif not exists(select 1 from public.order_items where order_id=oid and returned<quantity) then o.status:='returned'; end if;
    perform set_config('karisan.stock_reason','',true);perform set_config('karisan.order_id','',true);
  else raise exception 'invalid_action'; end if;
  update public.orders set status=o.status,stock_state=o.stock_state,paid=o.paid,refunded=o.refunded,
    tracking=o.tracking,notes=o.notes,version=version+1,
    payment_status=case when o.paid>0 and o.refunded=o.paid then 'refunded' when o.paid>0 then 'paid' else 'pending' end,
    delivery_status=case when o.status in ('shipped','completed') then 'shipped' when o.status='returned' then 'returned' else delivery_status end where id=oid;
  insert into public.crm_actions(id,order_id,kind,request_hash,details) values(operation_id,oid,action_value,fingerprint,payload-'id'-'operation'-'version');
  return jsonb_build_object('ok',true,'duplicate',false);
end $$;

create function public.server_crm_customers(search_value text default '',page_value integer default 0) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(t),'[]'::jsonb) from (
    select c.*,count(o.id) as order_count,coalesce(sum(o.paid-o.refunded),0) as net,max(o.created_at) as last_order
    from public.store_customers c left join public.orders o on o.customer_id=c.id
    where strpos(lower(c.name||' '||c.phone||' '||c.email),lower(left(search_value,100)))>0
    group by c.id order by max(o.created_at) desc nulls last,c.id limit 100 offset least(100000,greatest(0,page_value))*100
  ) t;
$$;
create function public.server_crm_counts() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(t),'[]'::jsonb) from (select status,count(*) as total from public.orders group by status) t;
$$;
revoke all on function public.create_storefront_order(jsonb),public.server_crm_action(jsonb),public.server_crm_customers(text,integer),public.server_crm_counts() from public,anon,authenticated;
grant execute on function public.create_storefront_order(jsonb),public.server_crm_action(jsonb),public.server_crm_customers(text,integer),public.server_crm_counts() to service_role;
commit;
