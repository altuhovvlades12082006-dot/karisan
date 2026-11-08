# Launch checkpoint — 2026-11-08

Scope: local `feature/production-launch`, existing Supabase project. Not a production release.

| Component | Status | Evidence / remaining work |
| --- | --- | --- |
| Automated regression suite | PASS | 111 tests: `node --test tests/*.test.mjs`; 0 failures/skips. Includes QA separation, backup integrity, Nova request caching and absolute Storage photo SEO regression. |
| Production build | PASS | `node scripts/run-framework.mjs build` completed; no deployment |
| Supabase order SQL safety | PASS | 008 applied. `tests/supabase-order-transaction.sql` executed in Supabase SQL editor: price/null price, pillow, verified delivery, stock, duplicate request, product version, stored refs. Fixtures rolled back. No concurrent-client test yet. |
| Sandbox payment database ledger | PASS | 006 applied. Same rollback SQL test: duplicate event, wrong amount, late processing, sandbox isolation from real payment status. NOT a provider/webhook E2E test. |
| Transactional Supabase CRM | PASS | 009–011 installed. Real PostgreSQL rollback test: status transitions, cancellation/replay, payment and partial refunds, no over-refund, restock/replay, stock audit, version conflict, customer linkage, statistics, service-only grants and stable request identity. |
| Admin catalogue / storefront connection | PASS | `tests/admin-supabase-local.mjs --run-supabase`: real local HTTP login/logout, CSRF/401 checks, product create/edit, additional size, photo upload/readback, Supabase persistence and public catalogue visibility. QA product archived; its photo retained. No commercial product edited. |
| Supabase statistics and CRM views | PASS | Real authenticated local APIs for orders, customers, stock and statistics return data. Existing browser UI displays CRM pipeline and traffic/receipt statistics. Traffic remains in local D1, financial facts in Supabase; no mixing old D1 sales or sandbox payments. Local traffic is labelled as preview data. |
| Isolated local checkout / concurrent buyers | PASS | Opt-in loopback QA harness exercised actual Supabase and Nova APIs: browser cart → locker → order → admin → persisted note; HTTP forged price, altered retry, duplicate retry and two last-unit buyers (one success, one conflict). Harness scopes flagged QA records; it is NOT the deployed public checkout. |
| QA cleanup / public acceptance | PASS | QA orders cancelled, QA products archived, none deleted. Verified 0 active QA orders/products, 84 public products, no public QA products and 0 real orders. Real database checkout gate remains false; server opt-in remains off. |
| Deployed HTTPS checkout / mobile hardware | BLOCKED | Requires approved hosting and post-deployment testing. Physical mobile-device performance was not tested. Local QA is not public HTTPS E2E. |
| Nova Poshta local lookup | PASS | Existing local city/branch/locker lookup verified with configured server key. Ref mapping regression tests passed. |
| Nova estimate adapter | PASS | Read-only real API quote succeeded for hypothetical Kyiv → Kyiv, 1 kg, declared 100 UAH. This is not the merchant's configured production rate. Directory calls are briefly cached/coalesced; failed calls are not retained. |
| Nova production dispatch / TTN | BLOCKED | Owner confirmed Khmelnytskyi; carrier city Ref resolved and saved locally. Read-only quote Khmelnytskyi → Kyiv passed with hypothetical 1 kg/100 UAH parcel. Actual parcel rules and authorized sender details still required. No real TTN or shipment created. |
| Ukrposhta live lookup | BLOCKED | Owner's carrier credentials/contract pending; fixture tests do not establish live service availability. |
| LiqPay signed HTTPS callback E2E | BLOCKED | Sandbox credentials and approved HTTPS test origin pending. Customer card checkout not enabled. |
| Domain / production hosting / Google submission | BLOCKED | Owner must confirm hosting, domain, publication and legal details. Published Sites has separate runtime configuration; local secrets are not published. |
| Local SEO checks | PASS | `node tests/seo-local.mjs`: server-rendered product/category metadata, canonical/JSON-LD, sitemap/robots, redirects and 404. |
| Seller policies / multilingual indexing | BLOCKED | Approved legal seller details and policies absent. Distinct RU/EN URLs and hreflang are not verified/ready; do not advertise full multilingual indexing. |
| Application backup / restore rehearsal | PASS | Encrypted 13-table snapshot plus 88 images verified locally; actual PostgreSQL isolated-schema row/FK restore rehearsal passed and rolled back. This is not a full infrastructure recovery. See BACKUP-RESTORE.md. |
| Off-device backup / disaster cutover | BLOCKED | Owner-controlled destination, separate recovery-key copy, scheduling and full infrastructure recovery procedure remain outstanding. |
| GitHub pull request | BLOCKED | Integration returned 403 on PR creation. Feature branch can be pushed; no PR creation is claimed. |

## Applied database changes and rollback boundary

- 008 adds `order_items.pillow` and replaces the service-only order RPC. It does not enable ordering or alter existing commercial records.
- 006 adds a separate sandbox ledger and sandbox status, never real payment confirmation.
- 008 includes international-phone validation from 007; do not blindly rerun older bootstrap migrations.
- 009 adds CRM tables/columns and a private stock reservation wrapper; 010 adds aggregate statistics; 011 adds stable client request hashes for safe retries. Applied once, not via blind bootstrap rerun.
- Local source rollback checkpoint: `backup/pre-crm-20261108` (`536bc3b`). Source rollback alone does not undo database migrations. Keep additive tables/columns and review function compatibility before restoring source. No destructive automatic down migration.
- Transactional QA temporarily enables checkout only inside its own uncommitted transaction, then rolls back all fixture/order/stock/settings changes. Other connections do not see the temporary gate or product.
- 012 separates QA products/orders/customers/stock from public catalogue and real statistics; QA reservation is service-only and cannot be enabled by a browser-supplied flag. 013 adds a service-only consistent application snapshot RPC. Both applied without deleting existing records.
- The rollback SQL safety tests above were executed before 012; the new wrapper was subsequently exercised by real local QA HTTP/browser requests. Do not describe the older SQL tests as rerun after 012.
- Backup scope excludes Auth users, D1, secrets/provider configuration and video files. A full project recovery and off-device scheduling remain open.

Hosting, payment activation and Ukrposhta are postponed by the owner's instruction. Before any public COD launch, obtain the dispatch/packaging and seller-policy inputs in OWNER-LAUNCH-INPUTS.md, configure the approved host and perform HTTPS checkout checks. Keep `SUPABASE_CHECKOUT_ENABLED` unset/false and database `orders_enabled=false` until separately approved. Do not replace unavailable providers with invented selections or estimates. Customer card checkout remains disabled; no live payment integration is claimed. No deployment, DNS or main-branch change was performed.
