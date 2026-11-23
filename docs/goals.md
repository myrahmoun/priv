# Goals (basic version)

A Firefox extension that shows general users, in plain language, what a website just told tracking companies about them.

## Must

- **Never block or change anything.** Observe only.
- **Decode 4 trackers:** Meta Pixel, Google (Analytics 4 / Ads), TikTok Pixel, Pinterest Tag.
- **Report three kinds of leak:**
  - *What you're looking at*: page URL and title, including product names and search terms in the URL.
  - *What you did*: shopping events (viewed, searched, added to cart, purchased), with item, variant, price.
  - *Who you are*: hashed email/phone, and tracking IDs from your cookies.
- **Popup** with "On this page" (since the URL last changed) and "Earlier on this site" (collapsed).
- **Plain language by default**, e.g. "TikTok learned you added *Pink Tee, M, $24* to your cart." A toggle reveals the raw fields and request.
- **Label certainty**: decoded / detected ID / unrecognized fields.
- **All data stays local.** No network calls of our own.

## Not in the basic version

Cross-site history or graphs, other trackers, session recording, fingerprinting, Chrome support.

## Done when

On each of the 4 test stores, browsing a product and adding it to cart produces correct, readable entries in the popup for every one of the 4 trackers the store uses.
