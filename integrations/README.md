# Delivery and checkout connection
Current public site remains static. The checkout is a local review form, not an order submission. Personal information is held only in page memory. Card payment is visibly unavailable. No card details are collected.

## Delivery
The tested server adapter in delivery-worker.mjs implements GET /api/commerce and GET /api/delivery.
Deploy it on the same origin under /api/* (or migrate this Sites project to a Worker and route these requests to it). It is NOT currently deployed by the static manifest.

Set server secrets:
- NOVA_POSHTA_API_KEY
- UKRPOSHTA_BEARER

The existing frontend detects configured carriers and enables branch lookup. Nova Poshta uses city-name lookup; Ukrposhta uses a 5-digit branch postcode. Timeouts and unavailable credentials return explicit errors. This is branch lookup, not shipment creation, label printing, delivery pricing or tracking. Validate both carrier accounts with live credentials before launch.

Official references:
- https://novaposhta.ua/for-business/cooperation/integration/
- https://developers.novaposhta.ua/documentation
- https://dev.ukrposhta.ua/uploads/Address-classifier-v3.20-11022026.pdf

## Orders and payment — required before activation
Owner selected cash on delivery and online card, but has no selected payment provider.
Choose merchant provider (LiqPay / WayForPay or another approved provider). Add the provider-specific server checkout and signed webhook after merchant registration. Never place private keys in dist, products.json or GitHub.
Implement durable order storage, server-side price/stock verification, idempotent submission and verified payment callbacks. Connect owner notifications and define shipping fees/dispatch policy. An API key alone does not complete these business settings.
Keep order submission disabled until storage, stock, notification delivery and payment sandbox flows pass. Do not accept browser-calculated totals as authoritative. Do not treat a return URL as proof of payment.
