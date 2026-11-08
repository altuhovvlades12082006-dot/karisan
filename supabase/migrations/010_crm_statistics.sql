-- Aggregates only: no personal customer fields, no old D1 sales, no sandbox revenue.
begin;
create function public.server_commerce_statistics(start_day date,end_day date) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; begins timestamptz; ends timestamptz;
begin
  if start_day is null or end_day is null or start_day>end_day or end_day-start_day>89 then raise exception 'invalid_period'; end if;
  begins:=start_day::timestamp at time zone 'Europe/Kyiv';
  ends:=(end_day+1)::timestamp at time zone 'Europe/Kyiv';
  with period_orders as (select * from public.orders where created_at>=begins and created_at<ends),
  receipts as (select * from public.order_transactions where created_at>=begins and created_at<ends),
  paid_orders as (select distinct order_id from receipts where type='payment'),
  geography as (select o.country,o.source,count(*) as orders from public.orders o join paid_orders p on p.order_id=o.id group by o.country,o.source),
  top_products as (select i.product_id as id,i.product_name as name,sum(i.quantity) as quantity from public.order_items i join paid_orders p on p.order_id=i.order_id group by i.product_id,i.product_name order by sum(i.quantity) desc,i.product_id limit 10)
  select jsonb_build_object(
    'total',(select count(*) from period_orders),
    'cancelled',(select count(*) from period_orders where status='cancelled'),
    'active',(select count(*) from public.orders where status in ('new','processing')),
    'paidOrders',(select count(*) from paid_orders),
    'gross',coalesce((select sum(amount) from receipts where type='payment'),0),
    'refunds',coalesce((select sum(amount) from receipts where type='refund'),0),
    'refundReceipts',(select count(distinct order_id) from receipts where type='refund'),
    'quantity',coalesce((select sum(i.quantity) from public.order_items i join paid_orders p on p.order_id=i.order_id),0),
    'geography',coalesce((select jsonb_agg(g) from geography g),'[]'::jsonb),
    'top',coalesce((select jsonb_agg(t) from top_products t),'[]'::jsonb),
    'paymentProviderConnected',false) into result;
  return result;
end $$;
revoke all on function public.server_commerce_statistics(date,date) from public,anon,authenticated;
grant execute on function public.server_commerce_statistics(date,date) to service_role;
commit;
