# Launch checkpoint — 2026-11-03

Scope: local `feature/production-launch`, existing Supabase project. Not a production release.

| Component | Status | Evidence / remaining work |
| --- | --- | --- |
| Automated regression suite | PASS | 92 tests: `node --test tests/*.test.mjs` |
| Production build | PASS | `npm run build` completed; no deployment |
| Supabase order SQL safety | PASS | 008 applied. `tests/supabase-order-transaction.sql` executed in Supabase SQL editor: price/null price, pillow, verified delivery, stock, duplicate request, product version, stored refs. Fixtures rolled back. No concurrent-client test yet. |
| Sandbox payment database ledger | PASS | 006 applied. Same rollback SQL test: duplicate event, wrong amount, late processing, sandbox isolation from real payment status. NOT a provider/webhook E2E test. |
| Storefront order acceptance / full CRM | FAIL | Intentionally closed. Supabase admin orders remain read-only; customer/stock/action lifecycle and public order adapter mounting still need implementation and E2E verification. Do not launch ordering. |
| Nova Poshta local lookup | PASS | Existing local city/branch/locker lookup verified with configured server key. Ref mapping regression tests passed. |
| Nova shipping estimate | BLOCKED | Sender city and real parcel parameters required; no verified live estimate or TTN creation. |
| Ukrposhta live lookup | BLOCKED | Owner's carrier credentials/contract pending; fixture tests do not establish live service availability. |
| LiqPay signed HTTPS callback E2E | BLOCKED | Sandbox credentials and approved HTTPS test origin pending. Customer card checkout not enabled. |
| Domain / production hosting / Google submission | BLOCKED | Owner must confirm hosting, domain, publication and legal details. Published Sites has separate runtime configuration; local secrets are not published. |

## Applied database changes and rollback boundary

- 008 adds `order_items.pillow` and replaces the service-only order RPC. It does not enable ordering or alter existing commercial records.
- 006 adds a separate sandbox ledger and sandbox status, never real payment confirmation.
- 008 includes international-phone validation from 007; do not blindly rerun older bootstrap migrations.
- Source rollback alone does not undo database migrations. Keep these additive columns/tables; restore the prior function definition from 007/003 only after review. No destructive automatic down migration.
- Transactional QA temporarily enables checkout only inside its own uncommitted transaction, then rolls back all fixture/order/stock/settings changes. Other connections do not see the temporary gate or product.
- This is not proof of a complete database backup/restore procedure. That launch requirement remains open.

Next code milestone: service-only transactional CRM actions (status, actual payment receipt, refund and stock return), mapped into the existing admin UI, followed by browser-to-database checkout QA. Keep `/api/orders` closed until that milestone is verified. Do not replace unavailable providers with invented selections or estimates.
