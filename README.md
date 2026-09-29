# Kari-San storefront

Complete static storefront backup, 29 September 2026.

## Run locally

```sh
python3 -m http.server 4173 --directory dist
```

Open http://localhost:4173. No Node dependencies or build step required.

## Contents

- `dist/`: deployable Ukrainian, Russian and English storefront, all product images, catalogue, 4K and mobile animation frames.
- `media/original-4k.mov`: original supplied 3840×2160, 30fps footage, preserved unchanged.
- `media/base-karisan.mp4`: additional existing source video.
- `scripts/`: preview and catalogue import utilities.
- `.openai/hosting.json`: existing Sites project configuration.

## Behaviour

Cart and favourites persist locally in the visitor browser. Prices and stock are an imported catalogue snapshot, not a live warehouse connection. Checkout, payments and order submission are not connected. Animation uses original 30fps frames and display-refresh blending; it is not a newly generated native 60fps video. Desktop frames are 4K, mobile frames are optimized to 1280 pixels wide. No paid generation was used.

## Live site

https://kari-san-lavender.altuhov-vlades120820.chatgpt.site

Instagram: https://www.instagram.com/karisan_ua/
TikTok: https://www.tiktok.com/@kari_san.ua

The actual business logo has not yet been provided; only the wordmark is displayed.
