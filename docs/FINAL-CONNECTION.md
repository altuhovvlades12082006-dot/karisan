# Final connection checklist

Preparation only. No publication, DNS changes or real-payment activation is authorized.
Current evidence: [launch status](../LAUNCH-STATUS.md).

## Hosting handoff

Deploy the existing Worker server and public assets, not a static-only upload.
Preserve the existing D1 binding for administrator sessions and traffic analytics.
Products, stock, orders and CRM use the existing Supabase project. Do not create
a second catalogue or rerun bootstrap/seed migrations. Retain server-only secrets
through the host's protected environment settings, never through browser code.

Required configuration names (values are not included here):

- `ADMIN_LOGIN_EMAIL`, `ADMIN_PASSWORD_HASH`
- `CATALOG_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_SITE_URL`: approved HTTPS origin, without a path or query
- `NOVA_POSHTA_API_KEY`
- `NOVA_POSHTA_SENDER_CITY_REF=db5c88ac-391c-11dd-90d9-001a92567626`
  (owner-confirmed Khmelnytskyi; resolved from the carrier directory)
- Keep `SUPABASE_CHECKOUT_ENABLED=false` and database `orders_enabled=false`
  until deployment checks and explicit owner approval.

Local secrets/settings do not automatically transfer to the host.

## Payment and Ukrposhta handoff

- Add `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY` securely; use
  `LIQPAY_MODE=sandbox` and the merchant-approved `LIQPAY_API_VERSION` first.
- Test the public HTTPS webhook with a real sandbox payment, duplicate callback,
  invalid signature and incorrect amount. Browser redirects never confirm payment.
- Live acquiring is not approved or complete merely because keys are supplied.
- Add `UKRPOSHTA_BEARER` through server settings after contractual API access.
  Verify real postcode/office results and order persistence. The current adapter
  is postcode-based; it does not claim an untested city directory or TTN service.

## Non-key owner inputs

Confirm packaged weights/dimensions, delivery/COD payer and sender details before
production quotes or shipment creation. Do not use the hypothetical 1 kg QA parcel
as a universal product weight. TTN creation remains outside the verified scope.

Provide approved public seller identity, return/delivery/payment/privacy texts and
support contacts. These are content inputs, not API credentials. No legal facts
or promises will be fabricated. See [owner inputs](../OWNER-LAUNCH-INPUTS.md).

## SEO and final acceptance

Ukrainian product/category URLs, SSR metadata, canonical URLs, Open Graph,
Product/Offer/BreadcrumbList, robots, sitemap, redirects and missing-product 404
have local checks. Absolute Storage photo URLs are preserved in SSR and metadata.
Russian/English client translation is not independent multilingual indexing;
do not add fake hreflang to pages without distinct server-translated URLs.

After hosting is configured: verify HTTPS and the final canonical host, inspect
robots/sitemap and representative product URLs, run checkout/admin/photo tests,
test a physical phone, and verify encrypted off-device backup access. Then obtain
publication approval. Search Console requires owner property verification and
submission of the final `/sitemap.xml`; ranking and indexing dates are not guaranteed.

For code rollback use the feature branch history; for data use the reviewed
[recovery procedure](../BACKUP-RESTORE.md), never reset live orders with a seed.
