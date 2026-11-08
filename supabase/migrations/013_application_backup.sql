begin;
-- One consistent MVCC snapshot of application tables, service role only.
create function public.server_backup_snapshot() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare table_name text; tables jsonb:='{}'; rows jsonb;
begin
  foreach table_name in array array['admin_profiles','categories','products','product_variants','promotions','store_settings','store_customers','orders','order_items','crm_actions','order_transactions','stock_movements','sandbox_payment_events'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t',table_name) into rows;
    tables:=tables||jsonb_build_object(table_name,rows);
  end loop;
  return jsonb_build_object('format',1,'createdAt',now(),'tables',tables);
end $$;
revoke all on function public.server_backup_snapshot() from public,anon,authenticated;
grant execute on function public.server_backup_snapshot() to service_role;
commit;
