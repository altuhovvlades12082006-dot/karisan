# Production launch — 2026-11-02

> Historical audit, not the current runbook. Current verified state is in
> [LAUNCH-STATUS.md](../LAUNCH-STATUS.md), owner inputs in
> [OWNER-LAUNCH-INPUTS.md](../OWNER-LAUNCH-INPUTS.md), recovery in
> [BACKUP-RESTORE.md](../BACKUP-RESTORE.md). Do not follow the old migration or
> cutover instructions below against the existing database. Supabase CRM,
> local carrier checkout and application recovery have since been tested.

UPDATE: the local catalogue and admin product APIs are now connected to the
existing Supabase project. See [SUPABASE-LOCAL.md](SUPABASE-LOCAL.md) for current
verified scope. The initial audit below is historical where it says Supabase
credentials were absent. Full CRM/checkout/payment cutover remains incomplete.

NOT READY TO LAUNCH. Preparation only; no deployment, domain, DNS, production
database or payment configuration was changed. PR must remain draft.

## Audit and architecture

- Base: `main` at `21c3d41`; rollback ref: `backup/pre-production-launch-20261102`.
- `feature/admin-panel` at `fe273d5` diverges before the newer server/CRM work.
  Its `dist/data-api.js` sends checkout directly to Supabase, bypassing server
  rate limits and delivery verification. Do not merge that checkout as-is.
- Current `public/` is the maintained storefront; root `app/api/` is its existing
  Worker server. `dist/` is ignored build output, not the source to edit.
- `next-app/proxy.js` exists only on the older branch. It depends on another
  Supabase/Next application and does not protect the current Worker API.
- Preserve the current framework, storefront and API contracts. Use the existing
  server for carrier/payment secrets. Supabase should ultimately be the single
  commerce source of truth, **not** a second independent catalogue alongside D1.
  Current admin, CRM, orders and statistics remain D1-backed. They have NOT been
  switched to Supabase. A static-only upload would break these server features.
- Supabase migrations 001/002 were copied unchanged from the existing branch;
  additive 003 disables anonymous checkout, validates quantities and expected
  prices, locks stock and adds same-key serialization/replay protection.
  It does not import, reset or delete catalogue/order data. Historical seed was
  intentionally NOT imported: it contains price/stock updates.

## Verified configuration (names only)

Sites runtime revision 1 contains `ADMIN_LOGIN_EMAIL` and `ADMIN_PASSWORD_HASH`.
The existing local `.dev.vars` has the same two names. Browser Supabase URL/key
are empty. No Supabase/LiqPay/carrier environment names were present in the
checked runtime or process. This does not prove those accounts do not exist
elsewhere. Existing hosting identity and D1/R2 bindings were left unchanged.

## Status matrix

PASS means executed in this run, in the environment stated; not live readiness.

| Component | Status | Evidence / remaining work |
|---|---|---|
| Branch isolation and rollback | PASS | Separate feature branch; main untouched; backup ref |
| Existing build | PASS | `npm run build`, existing dependencies reused |
| Unit/regression checks | PASS | 58 tests; including carrier mocks, money, passwords, video hashes and server SEO |
| Current admin + photo API, local D1/R2 only | PASS | `tests/api-local.mjs`: login, protected CRUD, archive, upload/readback, CSRF, stale edit, logout, throttling |
| Current CRM + COD, local D1 only | PASS | `tests/crm-local.mjs`: last-unit race, retries, stock reservations, cancel/restock once, manual receipts/refunds and private CRM |
| Supabase connection/admin/storage | BLOCKED | No project URL or server credentials available; admin/API storage adaptation still required |
| Supabase SQL/RLS runtime validation | BLOCKED | No PostgreSQL/Supabase staging access; 3 SQL tests are static checks ONLY |
| Supabase order concurrency and replay | BLOCKED | SQL prepared; not executed against PostgreSQL |
| Nova Poshta/Ukrposhta | BLOCKED | Existing adapter kept; 5 mock tests pass, live keys and contract validation absent. Ukrposhta is postcode lookup, not city autocomplete |
| Shipment creation / TTN | BLOCKED | Not implemented; needs carrier account/contract; not part of this preparation |
| LiqPay cryptographic helpers | PASS | 7 offline tests; sandbox-only, explicit v3/v7 signatures, HTTPS URLs and callback authentication |
| LiqPay end-to-end payment | BLOCKED | No merchant sandbox keys; helpers NOT mounted, no durable payment-event handler or paid-order update yet |
| Replayed provider webhook | BLOCKED | Not executed; existing CRM replay tests concern manual receipts, not a LiqPay webhook |
| Live payment | BLOCKED | Explicitly refused by helper; checkout still COD-only. Owner approval and sandbox E2E required |
| Secrets heuristic | PASS | Tracked text + unique historical text blobs scanned; no recognized private-key/GitHub-token/Supabase-secret/service-role-JWT hits. Not an exhaustive secret certification |
| Ukrainian product/category SEO, local | PASS | Server HTML, canonical, Open Graph, Product/Offer/BreadcrumbList, `/item/:id` and `/category/:slug`, missing item/category 404; `tests/seo-local.mjs` passed on dev and built Worker |
| Legacy product URLs, local | PASS | `/product?id=...` and `/product.html?id=...` return 308 to canonical `/item/:id`; duplicate static product template removed (recoverable from Git) |
| SEO launch completeness | FAIL | RU/EN remain client-only language switches without independent server-translated URLs/hreflang; final domain and legal pages unverified. Do NOT advertise full multilingual SEO readiness |
| robots and sitemap, local | PASS | Both resolve; sitemap contains canonical item/category URLs and no admin entries. Optional `PUBLIC_SITE_URL` sets the confirmed HTTPS origin consistently; real-domain verification still BLOCKED |
| Domain / HTTPS / host compatibility | BLOCKED | Owner's provider/domain not supplied; no DNS or hosting changes made |
| Search Console | BLOCKED | No verified domain/property access; see instructions below |
| Legal pages | BLOCKED | Owner identity, legal address, return/contact/shipping/privacy terms needed; no invented requisites |
| Backup and restore | BLOCKED | Code rollback prepared, but no production database/storage backup or tested restore available |
| Browser layout/navigation, local | PASS | Product size selection updates price/stock; desktop and 390px layout checked; product/category return and child category navigation work; product and child category scrollWidth equals 390px viewport. Not physical-phone or full checkout E2E |

**Do not recommend a public launch**: SEO FAIL and critical integration blockers
remain. No phased COD-only launch is authorized by this PR.

## Finish safely once access is available

1. Supply Supabase project URL and grant access through a secure project account.
   Put service-role/secret key ONLY in protected server settings. Never in
   `public/`, `NEXT_PUBLIC_*`, GitHub or chat. Anonymous/publishable key is not an
   administrator credential. Do not create a new paid project automatically.
2. Inventory real D1 data and existing Supabase migration history. Export a full
   consistent DB + image-object backup; verify restoring to an isolated target.
   For an existing Supabase schema with 001/002 already applied, apply only 003
   after review. Never rerun historical migrations/seed blindly. For a NEW staging
   database apply 001, 002, 003 in order while checkout is disabled.
3. Adapt existing server/store/admin/CRM APIs and authentication to Supabase as a
   single cutover. No silent D1/JSON fallback after live Supabase activation. Keep
   cookie-based authorization, CSRF checks, upload validation, optimistic edits,
   order idempotency and stock locking. Explicitly test anon and non-admin RLS.
4. Add `NOVA_POSHTA_API_KEY`, `UKRPOSHTA_BEARER` securely; use existing
   `integrations/delivery-worker.mjs`. Verify real city/branch selection, retained
   provider IDs, canonical branch lookup on the server and admin display before
   enabling checkout. Do not trust user-typed branch labels alone.
5. Add merchant sandbox credentials securely. `integrations/liqpay.mjs` is an
   **unmounted preparation helper**, not a working payment endpoint. Use server-
   read reserved order amounts, never accept browser payment totals. Add an
   HTTPS webhook with bounded form body, signed callback validation, exact
   merchant/order/UAH/amount matching and atomic durable event deduplication.
   A payment ID must never be credited to two orders; pending callbacks must not
   downgrade paid orders. A browser return URL never confirms payment. Real
   payments require a separate reviewed change and explicit owner approval.
6. Run every scenario in the requested 13-case checklist on isolated staging,
   including admin price/size/stock edits visible to a new shopper, real delivery
   lookup, sandbox webhook replay, underpayment/wrong currency, out-of-stock and
   concurrent last-unit orders. Existing local D1 tests do not replace this.
7. Complete SEO and owner-reviewed legal pages; test 360/390px and desktop.
   Set `PUBLIC_SITE_URL` to the confirmed HTTPS origin (no path/query), without
   changing DNS yet. Validate the final deployment artifact on the actual host
   without publishing. When it is unset, local/preview uses the request origin;
   this is not confirmation of the future production domain.
8. Request owner's explicit authorization before merge, deployment or DNS change.
   Monitor errors and orders after release. Restore DB only via a reviewed data
   reconciliation plan, never by blindly rolling back sales data with code.

## Google Search Console (after domain/SEO are ready)

1. Owner adds the real domain as a Domain property in Search Console.
2. Obtain Google's exact verification TXT record. Owner approves the DNS change
   before it is added; do not replace existing MX/TXT records.
3. Verify ownership; confirm valid HTTPS and one canonical host with redirects.
4. Check robots, sitemap, language canonicals/hreflang and representative product,
   category and legal pages. Exclude admin/API/cart/checkout from indexing.
5. Submit `https://<confirmed-domain>/sitemap.xml`. Inspect sample URLs and request
   indexing where appropriate. Submission does not guarantee indexing or ranking.

## Sources checked

- [Supabase function permissions](https://supabase.com/docs/guides/database/functions)
- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [LiqPay API v7 signature example](https://www.liqpay.ua/doc/api/information/register?tab=1)
- [Official LiqPay Node SDK (legacy SHA-1)](https://github.com/liqpay/sdk-nodejs/blob/master/lib/liqpay.js)
- [Google: localized versions require distinct language URLs](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)

Provider docs and the legacy SDK differ on signature version. The helper requires
an explicit API version; do not silently try multiple algorithms. Confirm the
merchant's checkout/callback version with a real sandbox transaction before use.
