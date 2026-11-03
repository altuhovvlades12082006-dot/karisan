-- Additive validation update. No orders/data changed, checkout stays disabled.
begin;
do $$
declare definition text;
begin
  select pg_get_functiondef('public.create_storefront_order(jsonb)'::regprocedure) into definition;
  if strpos(definition, E'^\\+380[3-9][0-9]{8}$')>0 then
    definition:=replace(definition,E'^\\+380[3-9][0-9]{8}$',E'^\\+[1-9][0-9]{6,14}$');
    execute definition;
  elsif strpos(definition,E'^\\+[1-9][0-9]{6,14}$')=0 then
    raise exception 'Unexpected checkout definition: inspect before applying phone migration';
  end if;
end $$;
revoke all on function public.create_storefront_order(jsonb) from public,anon,authenticated;
grant execute on function public.create_storefront_order(jsonb) to service_role;
commit;
