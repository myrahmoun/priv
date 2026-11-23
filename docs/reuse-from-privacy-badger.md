# Reuse from Privacy Badger

Source: `badger/` (GPLv3, so our extension is GPLv3 too). Copied files keep their license headers and credit EFF.

## Copy as-is

| File | Use |
|---|---|
| `src/lib/basedomain.js`, `src/lib/publicSuffixList.js` | Get a domain's eTLD+1 (e.g. `connect.facebook.net` → `facebook.net`). |
| `src/data/cname_domains.json` | Uncover trackers disguised as the site's own subdomains. |
| `src/js/multiDomainFirstParties.js` | Avoid flagging a company's own domains as third parties (e.g. `google.com` ↔ `youtube.com`). |

## Copy and adapt

| Source | Change |
|---|---|
| `src/data/seed.json` | Keep only domains with `heuristicAction` `block`/`cookieblock`, as a list of known trackers. |
| `src/js/utils.js`: `estimateMaxEntropy`, `findCommonSubstrings`, `isThirdPartyDomain` | Extract just these functions. |
| `src/js/heuristicblocking.js`: `pixelCookieShareAccounting`, `lowEntropyQueryValues`, `lowEntropyCookieValues` | Record *which* cookie leaked, its value, and where it went. Run on every request, not once per tracker per site, and not only on top-frame images. |
| `src/js/contentscripts/fingerprinting.js` | Reuse its page-world injection pattern to hook `fbq`, `gtag`, `dataLayer`, `ttq`, `pintrk`. |
| `src/js/tabdata.js` | Per-tab state, reshaped to hold leak events. |

## Not reused

Anything for blocking, or for repairing pages broken by blocking: `webrequest.js` blocking logic, surrogates, widget replacement, frame collapsing, cookie/storage clobbering, DNT/GPC, sliders, options page.
