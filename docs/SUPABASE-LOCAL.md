# Supabase local catalogue — 2026-11-02

## Verified

- Existing project `jmbdtnxgomylvkxayfax` in `karisan admin` was resumed; dashboard
  reports Healthy. No plan upgrade, new project, domain or production deployment.
- Initial read-only query found no tables in `public`. Applied migrations 001–004
  in one SQL transaction and 005 separately through the dashboard. This does NOT
  populate the Supabase CLI migration-history ledger; do not blindly run 001 again.
- Imported 84 current repository catalogue products / 159 variants. The first
  import stopped safely on the old global SKU constraint after 5 products; 005
  permits source display-SKU reuse while retaining unique variant IDs. Resumed
  insert-only import inserted remaining 79 and overwrote none.
- Local storefront `/api/catalog`, server-rendered pages, admin product GET/POST
  and new image uploads/readback now share Supabase when `CATALOG_BACKEND=supabase`.
- The existing shared email/password login remains server-side, with sessions in
  D1. This is NOT a migration to Supabase Auth. Owner logged in and UI price/stock
  edits persisted after reload on an archived QA product; no password was changed.
- Actual integration test passed: persisted create/read/update, price and stock
  visible through the local storefront, stale-version rejection, archive removed
  from storefront, Storage upload/readback, unauthenticated admin denied and order
  submission refused. One clearly named QA product is retained in archive. Test
  image objects remain in the bucket; no real customer records were created.
- PostgreSQL read-only permission query: RLS enabled on products, variants, orders
  and order items; anonymous server-catalog RPC execution denied; authenticated
  browser checkout RPC execution denied. This is not full checkout E2E/RLS testing.
- 69 offline tests passed. Build also passed with the sales/statistics guards.
- Signed-in browser check: Supabase order list loaded successfully, empty without
  fabricated records, and clearly labelled read-only. Populated order detail is
  covered by mapping tests only, not yet a real order lifecycle/browser test.

## Important boundary

This is a catalogue connection, NOT a complete CRM cutover or launch. Supabase
order list/detail now supports protected read-only access, with an explicit UI
notice and no launch/status/payment buttons. Customer/stock views, CRM writes,
manual sales and sales statistics explicitly fail closed
rather than reading/mutating a separate old D1 inventory. Checkout is disabled,
even if the old D1 orders-enabled setting was true. The readiness panel explains
the boundary. Existing D1 data was not deleted or migrated.

Still required: Supabase order reservations and CRM lifecycle, payments/refunds,
sales reporting, real carrier credentials, LiqPay sandbox E2E, verified restore,
final host/domain, legal details and owner-approved deployment.

## Secrets and local startup

Owner explicitly approved local server access. The existing server key and
existing local admin hash are in ignored `.dev.vars`, mode 0600. Do not include
this file in archives, screenshots, chat or Git. No key was put in `public/` or
production Sites settings. Modern `sb_secret_` keys use the `apikey` header only;
legacy JWT service-role keys also use Bearer authorization.

Use `npm run dev` for the connected local preview. The old `npm start` runs a built
config under `dist/server` and does not load root `.dev.vars` as Worker bindings
in this environment. Do not call that unconfigured preview proof of a live
Supabase connection. Real hosting needs protected runtime bindings explicitly.

Offline: `node --test tests/*.test.mjs integrations/delivery.test.mjs`.
Opt-in real integration: `node tests/supabase-local.mjs --run-supabase`.
The latter creates and archives a QA product and retains test image objects.
Never run it against an unreviewed production project.

Import is insert-only. `node scripts/supabase-import-catalog.mjs --confirm-empty`
refuses a non-empty target; `--resume-missing` skips existing IDs without updating
them. Neither command is a backup or a general data migration.

Rollback: keep the code/secret changes separate; do not silently switch back to
D1 after real Supabase edits. Export/reconcile catalogue changes first. Do not
roll back/delete the live database to undo a UI or code change.

Reference: https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
