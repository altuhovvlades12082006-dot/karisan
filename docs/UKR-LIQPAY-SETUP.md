# Local Ukrposhta / LiqPay setup — 2026-11-03

No publication, credential rotation, live charge, existing order/catalogue or DB
schema change is part of this step. Nova Poshta local configuration is preserved.

Private owner-input files outside Git, permission 0600:

- `/Users/vladyslav_altukhov/.config/karisan/ukrposhta-bearer.txt`: only the
  address-classifier API bearer on the first line (not the cabinet password).
- `/Users/vladyslav_altukhov/.config/karisan/liqpay-sandbox-public.txt`: sandbox
  Public key on the first line.
- `/Users/vladyslav_altukhov/.config/karisan/liqpay-sandbox-private.txt`: sandbox
  Private key on the first line. Never request or echo its value in chat.

Files are initially empty. After owner says saved, validate format locally without
printing content, then update only relevant ignored `.dev.vars` settings, keep
mode0600 and restart/reload the local Worker. Never infer sandbox from a live key;
current LiqPay helper requires sandbox Public key and refuses live mode.
Do not send keys to Sites or publish without the separate owner approval.

Ukrposhta code now normalizes single/array classifier replies, keeps ID/postcode,
excludes blocked/restricted/nondelivery/wrong-postcode offices, preserves ID in the
checkout/order snapshot and verifies it on the server before D1 order creation.
Existing Supabase checkout is still disabled; this is not a full CRM cutover.

23 focused offline carrier/payment tests passed. These are fixtures, NOT live
Ukrposhta or LiqPay transactions. Await owner credentials before live read checks.
LiqPay still needs reviewed migration006, a test card order/reservation path,
an isolated HTTPS callback, actual provider sandbox delivery and replay checks.
Do not advertise online card checkout as usable from saving keys alone.

References:
https://dev.ukrposhta.ua/uploads/Address-classifier-v3.20-11022026.pdf
https://www.liqpay.ua/doc/api/internet_acquiring/checkout
