// Static guardrails only. These are NOT PostgreSQL/RLS/concurrency execution tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/003_checkout_hardening.sql',import.meta.url),'utf8');
test('Supabase migration restricts checkout RPC to server service role',()=>{
  assert.match(sql,/revoke all on function public.create_storefront_order\(jsonb\) from public,anon,authenticated/g);
  assert.match(sql,/grant execute on function public.create_storefront_order\(jsonb\) to service_role/);
  assert.doesNotMatch(sql,/grant execute[^;]+to (?:anon|authenticated)/i);
});
test('Supabase migration adds idempotency, fixed lock order and expected-price comparison',()=>{
  for(const pattern of [/unique index[^;]+idempotency_key/,/pg_advisory_xact_lock/,/idempotency_conflict/,/order by v.id for update/,/variant.price\*100<>/,/jsonb_typeof\(item->'quantity'\) is distinct from 'number'/])assert.match(sql,pattern);
});
test('Supabase checkout is opt-in, COD-only and migration does not delete data',()=>{
  assert.match(sql,/orders_disabled/);assert.match(sql,/card_not_enabled/);
  assert.match(sql,/"orders_enabled":false/);
  assert.doesNotMatch(sql,/\b(?:truncate|delete from|drop table)\b/i);
});
