# Nova Poshta preparation — 2026-11-03 (not published)

No production secret, deployment, schema, catalogue or existing order was changed.
Work is in `feature/production-launch`; current published Site is a separate release.

## Server contract

- `GET /api/delivery?carrier=nova&action=cities&q=Київ&page=1`:
  `Address/getCities`, city Ref + name + region, 100 results/page.
- `GET /api/delivery?carrier=nova&action=branches&cityRef=<Ref>&type=branch|postomat|all&q=<number/address>&page=1`:
  `Address/getWarehouses`, 200 results/page, `hasMore` based on the raw carrier page
  (a filtered empty page does not incorrectly end pagination). Closed/wrong-city
  points are excluded. The UI has separate city/point selection and Load more.
- Ref/number/type are retained in hidden form fields and the order JSON, not used
  as a display label. Editing city/branch clears stale refs. Review/edit retains
  the selection. D1 order creation re-queries the carrier by city Ref/point number
  and checks point Ref + type before saving canonical text and both refs via the
  existing JSON order snapshot. A caller-supplied `verified` flag is not trusted.
- Existing Ukrposhta postcode lookup is preserved. No third-party widget or extra
  library; existing design styles and admin UI unchanged.
- Public delivery route is rate-limited using existing D1 facilities when the key
  is configured. Fixed HTTPS upstream, bounded inputs/body/pages, 8s timeout and
  sanitized errors. No key is returned through commerce config or browser code.

`CategoryOfWarehouse`/description classification, carrier field/status names,
pagination and quote contract MUST be checked against real responses before
production. The official developer portal was unavailable (403) during preparation.
Mock success is not certification of a real account/API contract.

## Estimate endpoint (prepared, not enabled in checkout)

`POST /api/delivery` requires same-origin and a bounded JSON body:

```json
{
  "cityRef": "carrier city Ref",
  "branchRef": "carrier point Ref",
  "branchNumber": "carrier point number",
  "type": "branch",
  "chargeableWeightKg": 2.5,
  "declaredAmount": 78500
}
```

`declaredAmount` is integer kopecks. Origin is read only from server variable
`NOVA_POSHTA_SENDER_CITY_REF`; browser origin overrides are ignored.
The server verifies the destination, then prepares
`InternetDocument/getDocumentPrice`, Parcel/one seat/WarehouseWarehouse.
Response amount is kopecks/UAH, `estimate:true`, `includesCodFee:false`.

This is NOT an authoritative checkout charge. No price is added to the order,
and the UI still says carrier rates. The merchant must provide sender city,
packaging/actual and volumetric weight rules, point size/weight eligibility and
payment/payer policy. Reconcile these against the actual API before wiring an
automatic customer fee. Do not guess a default parcel weight or ignore dimensions.
TTN creation, COD fee and contractual discounts are not implemented here.

## Safe secret setup — no key in chat

Required runtime secret: `NOVA_POSHTA_API_KEY` (server-side only).
Optional non-secret origin setting: `NOVA_POSHTA_SENDER_CITY_REF` (required for quote).

Confirmed Sites capability: native `update_environment_variables`, selected
project `appgprj_6abac79e3a1481918fe4bc278fd0a641`, `set_values` entry with
`key:NOVA_POSHTA_API_KEY`, `is_secret:true`. Only the listed key changes; preserve
existing admin secrets and do NOT use `remove`. No call has been made to write it.

The exact user-facing Sites secret editor could not be verified: native Codex UI
control was refused by the environment, and no supported tool opens a secret-input
panel. Do not claim a made-up Settings menu or ask for the secret in chat.

Safe available alternative, after separate owner confirmation of transmission:
the owner writes the key into a private local file outside Git, for example
`/Users/vladyslav_altukhov/.config/karisan/nova-poshta-api-key`, with parent directory
0700/file0600 (or uses an approved masked local input). Agent reads it in memory
without printing, passes it only to the native Sites secret setter with
`is_secret:true`, then checks only names/secret flags/revision. Never copy it into
source, a command argument, screenshots, public files, an archive or a chat reply.
Creating that input file or setting a key is NOT part of this preparation.

Important platform rule: saving an environment revision does not apply it to the
current publication. A saved version must be deployed to use the new revision.
This is blocked by the owner's current no-publication instruction. After a future
approval, validate the release + key together; do not silently deploy old code with
new settings.

## Checks and boundaries

- 88 offline tests passed (including nine new Nova tests and updated route test).
- SQLite in-memory test verifies order snapshot Ref persistence, no real data.
- Isolated browser fixture exercises real checkout JS: city -> locker -> review
  -> edit; separate fixture submission -> shared normalization -> carrier fixture
  verification -> in-memory SQLite -> both refs/type read back correctly.
  This is NOT full Cloudflare D1/real-carrier E2E or a real order.
- Production keys remain absent; no real API calls or real quote certified.
- Supabase checkout remains closed due to the existing CRM cutover boundary.
  Its stored RPC already has `delivery_reference.branch_id/city_id`, but the full
  order writer is not connected; do not advertise this as completed Supabase E2E.
- No Supabase migration, D1 schema update, stock change, product deletion or
  production environment update is needed/was performed for this preparation.

Optional isolated UI fixture: `node tests/nova-ui-fixture.mjs --fixture` at 5174.
It uses fake carrier replies, local browser storage and an in-memory test DB only.
Do not deploy this fixture or mistake it for the shop's real API.

Official starting point: https://novaposhta.ua/for-business/cooperation/integration/
