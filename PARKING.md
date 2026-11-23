# Parking note (2026-11-23, temporary: delete when resumed)

## Where we are

- Plans written: `docs/goals.md`, `docs/architecture.md`, `docs/reuse-from-privacy-badger.md`.
- **Recorder done and tested.** Captures every third-party request per tab (params, body, cookies, status) and labels the company. The inspector (`src/inspector/`) shows it live, with JSON export.
- Layout: `src/` ships; `tests/`, `scripts/`, `docs/` are dev only. `decoders/` exists and holds only `companies.js` so far.
- All green: `npm test` (3), `npm run test:e2e` (2), `npm run lint` (0 warnings).

## Next step

Write the **Meta decoder** (`src/decoders/meta.js`): turn a `facebook.com/tr` request into a plain-language event (e.g. "added *Pink Tee, M, $24* to cart") plus hashed-email/ID detection. Then Google → TikTok → Pinterest.

## Open questions

1. Build the Meta decoder from a **real sample** (run `npm start`, add a product to cart, export JSON into `samples/`) or from Meta's **documented format** first?
2. **Test stores:** none chosen yet. Need 4 that each run Meta, Google, TikTok and/or Pinterest (likely small Shopify clothing/home brands).
3. **Name and add-on ID:** "Tracker Lens" / `tracker-lens@example.org` are placeholders.
4. Ship the inspector as the "technical details" view, or keep it dev-only? (Leaning: ship.)
5. Not a git repo yet. `git init` before more changes?
6. `.gitignore` was overwritten during setup; re-add any entries it had before.
