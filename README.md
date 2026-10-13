# Kari-San storefront

Complete static storefront backup, 29 September 2026.

## Run locally

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173. No Node dependencies or build step required.

Admin panel: http://localhost:4173/admin/

## Contents

- `dist/`: deployable Ukrainian, Russian and English storefront, all product images, catalogue, 1080p60 forward and reverse video.
- `media/original-4k.mov`: original supplied 3840×2160, 30fps footage, preserved unchanged.
- `media/base-karisan.mp4`: additional existing source video.
- `scripts/`: preview and catalogue import utilities.
- `.openai/hosting.json`: existing Sites project configuration.
- `dist/admin/`: responsive Kari-San admin panel.
- `supabase/migrations/001_commerce.sql`: database, authentication roles, row-level security and secure order creation.
- `scripts/export-supabase-seed.py`: converts the current product snapshot into `supabase/seed.sql`.

## Admin and live catalogue setup

The admin opens in device-local demo mode until Supabase is configured. To activate shared data:

1. Create a Supabase project and run `supabase/migrations/001_commerce.sql` in its SQL editor.
2. Run `python3 scripts/export-supabase-seed.py`, then run the generated `supabase/seed.sql` in Supabase.
3. Create the first user in Supabase Authentication.
4. Add that user's UUID to `public.admin_profiles` with role `owner`.
5. Put the project URL and public anon key in `dist/commerce-config.js`.

Only the public anon key belongs in browser code. Never commit a Supabase service-role key.

## Behaviour

Cart and favourites persist locally in the visitor browser. Prices and stock are an imported catalogue snapshot, not a live warehouse connection. Checkout, payments and order submission are not connected. Animation uses native playback of 1080p videos converted to 60fps with frame interpolation from the supplied 30fps original. Forward and reversed copies avoid continuous seeking. No paid generation was used.

## Live site

https://kari-san-lavender.altuhov-vlades120820.chatgpt.site

Instagram: https://www.instagram.com/karisan_ua/
TikTok: https://www.tiktok.com/@kari_san.ua

The actual business logo has not yet been provided; only the wordmark is displayed.
