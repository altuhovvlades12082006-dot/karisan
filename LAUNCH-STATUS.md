# Launch checkpoint — 2026-11-08

Scope: local `feature/production-launch`, existing Supabase project. Not a production release.

| Component | Status | Evidence / remaining work |
| --- | --- | --- |
| Automated regression suite | PASS | 99 tests: `node --test tests/*.test.mjs` |
| Production build | PASS | `node scripts/run-framework.mjs build` completed; no deployment |
| Supabase order SQL safety | PASS | 008 applied. `tests/supabase-order-transaction.sql` executed in Supabase SQL editor: price/null price, pillow, verified delivery, stock, duplicate request, product version, stored refs. Fixtures rolled back. No concurrent-client test yet. |
| Sandbox payment database ledger | PASS | 006 applied. Same rollback SQL test: duplicate event, wrong amount, late processing, sandbox isolation from real payment status. NOT a provider/webhook E2E test. |
| Transactional Supabase CRM | PASS | 009–011 installed. Real PostgreSQL rollback test: status transitions, cancellation/replay, payment and partial refunds, no over-refund, restock/replay, stock audit, version conflict, customer linkage, statistics, service-only grants and stable request identity. |
| Admin catalogue / storefront connection | PASS | `tests/admin-supabase-local.mjs --run-supabase`: real local HTTP login/logout, CSRF/401 checks, product create/edit, additional size, photo upload/readback, Supabase persistence and public catalogue visibility. QA product archived; its photo retained. No commercial product edited. |
| Supabase statistics and CRM views | PASS | Real authenticated local APIs for orders, customers, stock and statistics return data. Existing browser UI displays CRM pipeline and traffic/receipt statistics. Traffic remains in local D1, financial facts in Supabase; no mixing old D1 sales or sandbox payments. Local traffic is labelled as preview data. |
| Public checkout complete browser E2E / concurrent buyers | FAIL | Public acceptance deliberately closed. Adapter mounted behind runtime approval AND database opt-in. Actual browser-to-order-to-admin checkout with verified real delivery and simultaneous buyer requests has not been run. SQL lifecycle checks are not a substitute. Do not launch ordering yet. |
| Nova Poshta local lookup | PASS | Existing local city/branch/locker lookup verified with configured server key. Ref mapping regression tests passed. |
| Nova shipping estimate | BLOCKED | Sender city and real parcel parameters required; no verified live estimate or TTN creation. |
| Ukrposhta live lookup | BLOCKED | Owner's carrier credentials/contract pending; fixture tests do not establish live service availability. |
| LiqPay signed HTTPS callback E2E | BLOCKED | Sandbox credentials and approved HTTPS test origin pending. Customer card checkout not enabled. |
| Domain / production hosting / Google submission | BLOCKED | Owner must confirm hosting, domain, publication and legal details. Published Sites has separate runtime configuration; local secrets are not published. |

## Applied database changes and rollback boundary

- 008 adds `order_items.pillow` and replaces the service-only order RPC. It does not enable ordering or alter existing commercial records.
- 006 adds a separate sandbox ledger and sandbox status, never real payment confirmation.
- 008 includes international-phone validation from 007; do not blindly rerun older bootstrap migrations.
- 009 adds CRM tables/columns and a private stock reservation wrapper; 010 adds aggregate statistics; 011 adds stable client request hashes for safe retries. Applied once, not via blind bootstrap rerun.
- Local source rollback checkpoint: `backup/pre-crm-20261108` (`536bc3b`). Source rollback alone does not undo database migrations. Keep additive tables/columns and review function compatibility before restoring source. No destructive automatic down migration.
- Transactional QA temporarily enables checkout only inside its own uncommitted transaction, then rolls back all fixture/order/stock/settings changes. Other connections do not see the temporary gate or product.
- This is not proof of a complete database backup/restore procedure. That launch requirement remains open.

Next launch milestone: owner-approved isolated HTTPS staging/hosting, verified delivery for both carriers, sandbox merchant access, then full browser checkout/webhook/concurrent-buyer QA. Keep `SUPABASE_CHECKOUT_ENABLED` unset/false and database `orders_enabled=false` until separately approved. Do not replace unavailable providers with invented selections or estimates. Current customer card checkout remains disabled; no live payment integration is claimed.
