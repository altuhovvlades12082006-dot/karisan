-- Sandbox ledger only. Does NOT enable orders, real card payments or change stock.
begin;
alter table public.orders add column if not exists sandbox_payment_status text not null default 'pending';
create table if not exists public.sandbox_payment_events (
  payment_id text not null,
  status text not null,
  order_id uuid not null references public.orders(id),
  amount bigint not null check(amount>0),
  created_at timestamptz not null default now(),
  primary key(payment_id,status)
);
alter table public.sandbox_payment_events enable row level security;
revoke all on public.sandbox_payment_events from public,anon,authenticated;
grant select,insert on public.sandbox_payment_events to service_role;

create or replace function public.server_record_sandbox_payment(payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  o public.orders;
  prior public.sandbox_payment_events;
  payment text:=payload->>'paymentId';
  state text:=payload->>'status';
  amount_value bigint;
begin
  if payload->>'sandbox' is distinct from 'true' or payload->>'currency' is distinct from 'UAH'
    or coalesce(payment,'') !~ '^[0-9]{1,30}$'
    or coalesce(state,'') not in ('success','sandbox','failure','error','processing','wait_accept','reversed')
    or coalesce(payload->>'amount','') !~ '^[0-9]{1,9}$' then raise exception 'invalid_payment'; end if;
  amount_value:=(payload->>'amount')::bigint;
  perform pg_advisory_xact_lock(hashtextextended('sandbox-payment:'||payment,0));
  select * into o from public.orders where id=(payload->>'orderId')::uuid for update;
  if not found or o.payment_method<>'card' or o.total*100<>amount_value or amount_value<1
    or o.idempotency_key is null then raise exception 'payment_mismatch'; end if;
  -- A provider payment ID can never migrate to another order or amount.
  select * into prior from public.sandbox_payment_events where payment_id=payment limit 1;
  if found and (prior.order_id<>o.id or prior.amount<>amount_value) then raise exception 'payment_mismatch'; end if;
  if exists(select 1 from public.sandbox_payment_events where payment_id=payment and status=state) then
    return jsonb_build_object('ok',true,'duplicate',true,'sandbox',true);
  end if;
  if state in ('sandbox','success') and o.status not in ('new','processing') then raise exception 'order_closed'; end if;
  if state in ('sandbox','success') and exists(select 1 from public.sandbox_payment_events
    where order_id=o.id and status in ('sandbox','success') and payment_id<>payment) then raise exception 'already_paid'; end if;
  insert into public.sandbox_payment_events(payment_id,status,order_id,amount) values(payment,state,o.id,amount_value);
  -- Late processing/failure callbacks cannot downgrade success or reversed.
  update public.orders set sandbox_payment_status=case
    when sandbox_payment_status='reversed' then 'reversed'
    when state='reversed' then 'reversed'
    when state in ('sandbox','success') then 'paid'
    when sandbox_payment_status='paid' then 'paid'
    when state in ('failure','error') then 'failed'
    else sandbox_payment_status end where id=o.id;
  return jsonb_build_object('ok',true,'duplicate',false,'sandbox',true);
end $$;
revoke all on function public.server_record_sandbox_payment(jsonb) from public,anon,authenticated;
grant execute on function public.server_record_sandbox_payment(jsonb) to service_role;
commit;
