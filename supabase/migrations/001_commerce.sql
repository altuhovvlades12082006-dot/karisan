-- Kari-San commerce schema for Supabase
create extension if not exists pgcrypto;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Kari-San manager',
  role text not null default 'manager' check (role in ('owner','manager')),
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  slug text primary key,
  names jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  names jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  material jsonb not null default '{}'::jsonb,
  category_slug text references public.categories(slug),
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  image_url text,
  source_image_url text,
  source_url text,
  is_new boolean not null default false,
  is_children boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  names jsonb not null default '{}'::jsonb,
  sku text unique,
  price numeric(12,2) not null default 0 check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  pillow_sizes jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  status text not null default 'new' check (status in ('new','processing','shipped','completed','cancelled')),
  customer_name text not null,
  customer_email text,
  phone text not null,
  carrier text not null check (carrier in ('nova','ukr')),
  city text not null,
  branch text not null,
  postcode text,
  payment_method text not null default 'cod' check (payment_method in ('cod','card')),
  comment text,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  variant_id text references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_name text,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_percent integer not null check (discount_percent between 1 and 90),
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  id text primary key default 'default',
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.admin_profiles where user_id=auth.uid()) $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
drop trigger if exists variants_touch on public.product_variants;
create trigger variants_touch before update on public.product_variants for each row execute function public.touch_updated_at();
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

alter table public.admin_profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.promotions enable row level security;
alter table public.store_settings enable row level security;

create policy "admins read profiles" on public.admin_profiles for select using (public.is_admin());
create policy "public reads categories" on public.categories for select using (is_active or public.is_admin());
create policy "admins manage categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy "public reads active products" on public.products for select using (is_active or public.is_admin());
create policy "admins manage products" on public.products for all using (public.is_admin()) with check (public.is_admin());
create policy "public reads active variants" on public.product_variants for select using (is_active or public.is_admin());
create policy "admins manage variants" on public.product_variants for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage orders" on public.orders for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage order items" on public.order_items for all using (public.is_admin()) with check (public.is_admin());
create policy "public reads active promos" on public.promotions for select using ((is_active and (expires_at is null or expires_at > now())) or public.is_admin());
create policy "admins manage promos" on public.promotions for all using (public.is_admin()) with check (public.is_admin());
create policy "public reads settings" on public.store_settings for select using (true);
create policy "admins manage settings" on public.store_settings for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.create_storefront_order(payload jsonb)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare
  new_order public.orders;
  item jsonb;
  variant public.product_variants;
  product public.products;
  calculated numeric(12,2):=0;
  qty integer;
  number text;
begin
  if coalesce(length(payload->>'customer_name'),0)<3 or coalesce(length(payload->>'phone'),0)<10 then
    raise exception 'invalid_customer';
  end if;
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb))=0 then raise exception 'empty_order'; end if;
  number:='KS-'||to_char(now(),'YYMMDD-HH24MISS')||'-'||upper(substr(encode(gen_random_bytes(3),'hex'),1,4));
  insert into public.orders(order_number,customer_name,customer_email,phone,carrier,city,branch,postcode,payment_method,comment)
  values(number,payload->>'customer_name',nullif(payload->>'customer_email',''),payload->>'phone',payload->>'carrier',payload->>'city',payload->>'branch',nullif(payload->>'postcode',''),coalesce(payload->>'payment_method','cod'),left(coalesce(payload->>'comment',''),500)) returning * into new_order;
  for item in select * from jsonb_array_elements(payload->'items') loop
    qty:=(item->>'quantity')::integer;
    if qty<1 then raise exception 'invalid_quantity'; end if;
    select * into variant from public.product_variants where id=item->>'variant_id' and is_active for update;
    if not found or variant.stock<qty then raise exception 'out_of_stock'; end if;
    select * into product from public.products where id=variant.product_id and is_active;
    if not found then raise exception 'product_unavailable'; end if;
    calculated:=calculated+(variant.price*qty);
    insert into public.order_items(order_id,product_id,variant_id,product_name,variant_name,sku,quantity,unit_price,line_total)
    values(new_order.id,product.id,variant.id,coalesce(product.names->>'uk','Товар'),coalesce(variant.names->>'uk',''),variant.sku,qty,variant.price,variant.price*qty);
    update public.product_variants set stock=stock-qty where id=variant.id;
  end loop;
  update public.orders set subtotal=calculated,total=calculated where id=new_order.id;
  return jsonb_build_object('id',new_order.id,'order_number',number,'total',calculated);
exception when others then
  raise;
end $$;

grant execute on function public.create_storefront_order(jsonb) to anon, authenticated;

insert into public.categories(slug,names,sort_order) values
('children','{"uk":"Дитяче","ru":"Детское","en":"Children"}',1),
('bedding','{"uk":"Постільна білизна","ru":"Постельное бельё","en":"Bed linen"}',2),
('gold','{"uk":"Бязь Голд люкс","ru":"Бязь Голд люкс","en":"Gold Lux calico"}',3),
('stripe','{"uk":"Страйп сатин","ru":"Страйп сатин","en":"Stripe satin"}',4),
('satin','{"uk":"Сатин","ru":"Сатин","en":"Satin"}',5),
('washed','{"uk":"Варена бавовна","ru":"Варёный хлопок","en":"Washed cotton"}',6),
('flannel','{"uk":"Байка","ru":"Байка","en":"Flannel"}',7),
('linen-new','{"uk":"Інші новинки","ru":"Другие новинки","en":"New bed linen"}',8),
('towels','{"uk":"Рушники","ru":"Полотенца","en":"Towels"}',9),
('protectors','{"uk":"Наматрацники","ru":"Наматрасники","en":"Mattress protectors"}',10),
('duvets','{"uk":"Ковдри","ru":"Одеяла","en":"Duvets"}',11),
('curiosities','{"uk":"Цікавинки","ru":"Интересное","en":"Discoveries"}',12),
('covers','{"uk":"Покривала","ru":"Покрывала","en":"Bedspreads"}',13),
('pillows','{"uk":"Подушки","ru":"Подушки","en":"Pillows"}',14)
on conflict(slug) do update set names=excluded.names,sort_order=excluded.sort_order;

insert into public.store_settings(id,value) values('default','{"store_name":"Kari-San","currency":"UAH","phone":"+38 (067) 250-49-39","email":"kari-san@ukr.net","nova_enabled":true,"ukr_enabled":true}') on conflict(id) do nothing;
