-- Source catalogue reuses display SKUs, including within some size ranges.
-- Stable product_variants.id is the unique identity used by orders.
begin;
alter table public.product_variants drop constraint if exists product_variants_sku_key;
create index if not exists product_variants_sku_lookup on public.product_variants(sku);
commit;
