# Architecture

Firefox, Manifest V2, no build step.

```
page ──hooks──▶ content script ─┐
                                ├─▶ background: recorder ─▶ decoders ─▶ tab store ─▶ popup
network ──webRequest (observe)──┘
```

## Folders (`src/`)

| Folder | Holds |
|---|---|
| `background/` | Browser plumbing: recorder, tab store, wiring |
| `decoders/` | Pure logic, no browser APIs: company identification, per-tracker decoders, URL decoder, ID detector |
| `popup/`, `inspector/` | UI pages |
| `content/` | Page hooks |
| `vendor/privacybadger/` | Code and data copied from Privacy Badger |

## Components

| Component | Role |
|---|---|
| **Recorder** (background) | Observes every third-party request with `webRequest`, never blocking. Captures URL, query, POST body, cookies sent, tab, and timestamp. |
| **Page hooks** (content script → page world) | Wraps `fbq`, `gtag`/`dataLayer`, `ttq`, `pintrk` to capture events as the site sends them, before they are encoded. A backup for requests that are hard to decode. |
| **Tracker identification** | Maps request domain → company (Meta, Google, TikTok, Pinterest, or "other known tracker" from the seed list). Uses Privacy Badger's domain helpers. |
| **Decoders** (one per tracker) | Turn a raw request or hook event into a leak event: `{company, kind, summary, fields, raw, certainty}`. |
| **Generic URL decoder** | For any tracker: pulls the page URL and referrer out of a request and extracts product names and search terms. |
| **ID detector** | Flags cookie values and hashed emails/phones that appear in a request (adapted from Privacy Badger's cookie-sharing check). |
| **Tab store** | Per-tab leak events, grouped into "this page" / "earlier on this site". Resets on new site, splits on URL change. In memory only. |
| **Popup** | Plain-language list grouped by company. A "details" toggle shows fields and the raw request. Toolbar badge shows the count for the current page. |
| **Inspector** | Raw view of every captured request: for writing decoders, choosing test stores, and as the "technical details" view. |

## Build order

1. Recorder + tracker identification + inspector.
2. Pick the 4 test stores using the inspector.
3. Decoders (Meta → Google → TikTok → Pinterest), generic URL decoder, ID detector.
4. Tab store + popup.
5. Page hooks, where decoding requests alone falls short.
