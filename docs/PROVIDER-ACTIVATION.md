# Provider activation — current local status, 2026-11-02

Owner confirmed: **no Nova Poshta, Ukrposhta or LiqPay accounts/keys yet**.
Do not publish, change DNS, enable orders or real payments based on this document.

Current verification: 75 offline tests passed and build passed. Local HTTP checks
confirmed webhook 503 with missing configuration, admin payment API 401 without
login, orders 503 while closed, and public configuration with card/orders/both
carrier lookups disabled. These are negative safety checks, not provider E2E.

| Component | Status | Evidence / remaining requirement |
| --- | --- | --- |
| Shared Supabase catalogue/admin products | PASS | Real database and signed-in UI edit/reload verified previously |
| Supabase order viewing | PASS | Signed-in empty order view verified; no fabricated orders |
| Full Supabase order/CRM lifecycle | FAIL | Checkout still refused; reservations, lifecycle, returns/reporting not fully wired/tested |
| LiqPay sandbox signing/verification/service adapter | PASS | Offline tests only; not an acquirer transaction |
| LiqPay HTTP routes and durable sandbox ledger | BLOCKED | Routes mounted in source; migration 006 not applied/executed against PostgreSQL; no merchant sandbox keys or HTTPS callback |
| Real online payment | BLOCKED | Live mode deliberately refused; needs merchant approval, sandbox E2E and separate owner activation approval |
| Nova Poshta branch lookup | BLOCKED | Existing adapter, fixture tests only; owner API key and real response checks required |
| Ukrposhta branch lookup | BLOCKED | Existing postcode lookup, not city autocomplete; owner bearer/contract and real response checks required |
| Automatic TTN | BLOCKED | Not implemented; requires sender account, contract details and parcel parameters |
| Hosting/domain/webhook HTTPS | BLOCKED | Hosting compatibility and approved deployment still unverified |
| Backup/restore and legal details | BLOCKED | No verified isolated restore; seller details/terms require owner review |

## What the owner needs to provide through protected settings

1. Open the business cabinet for Nova Poshta and obtain the API key. Configure
   `NOVA_POSHTA_API_KEY` on the server, not Git or the browser.
2. Arrange Ukrposhta API access under the owner's agreement. Configure
   `UKRPOSHTA_BEARER` on the server. Current adapter searches by 5-digit postcode.
3. Register/verify the business in LiqPay and obtain **sandbox** merchant keys.
   Configure `LIQPAY_MODE=sandbox`, explicit `LIQPAY_API_VERSION` (currently 7,
   legacy 3 supported only if that is the merchant's confirmed API contract),
   `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY`, and the confirmed HTTPS
   `PUBLIC_SITE_URL`. Never put private keys in chat or browser code.
4. Confirm hosting provider and domain access without sending passwords in chat.
   An administrator must enter secrets in protected host settings. Existing local
   `.dev.vars` is not a production deployment or a portable backup.

## Implemented sandbox boundary

- `POST /api/admin/payments/liqpay`: existing admin login + same-origin guard,
  bounded JSON; reads stored order total. Only card/pending/reserved-reference
  orders may generate a signed **sandbox** checkout. This is an admin test route,
  not a working customer card-payment button.
- `POST /api/payments/liqpay`: bounded form callback, signature/merchant/currency
  checks; persists canonical facts via service-role-only RPC after migration 006.
  No card numbers or raw callbacks are retained.
- 006 uses order row locking and per-payment advisory locking, rejects amount or
  order reassignment, handles exact repeats, blocks multiple successful payment
  IDs for one order and late-event downgrades. It writes **only**
  `sandbox_payment_status`, never real `payment_status` or inventory.
- Migration 006 is additive; review/apply once in the existing project after 001–005.
  It does not enable checkout. PostgreSQL/replay/concurrency execution and actual
  signed provider delivery remain mandatory; static tests are not substitutes.

## Launch sequence once accesses exist

Finish and verify shared Supabase reservations/CRM first, including price/stock
tampering, duplicate submissions, cancellation/restocking and concurrent edits.
Then validate real carrier IDs server-side, persist canonical delivery references
and show them in admin. Complete sandbox order/payment/webhook/replay E2E on HTTPS,
backup/restore, mobile checks and legal review. Get explicit publication/live
payment approval. Only then release; no automatic production switch exists here.

Official references:
- https://www.liqpay.ua/doc/api/internet_acquiring/checkout
- https://developers.novaposhta.ua/documentation
- https://dev.ukrposhta.ua/uploads/Address-classifier-v3.20-11022026.pdf
