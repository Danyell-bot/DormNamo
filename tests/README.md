# tests/ — automatic checks

Run all of them with `npm test` (Node's built-in test runner, nothing to install).
One file: `node --test tests/namo.test.mjs`. One test: `node --test --test-name-pattern="cache expires" tests/`.
Nothing here calls a real Google service: those are replaced by fakes.

| File | What it checks |
|---|---|
| `consent.test.mjs` | Consent first: nothing saved before the answer, "essential only" keeps data in the tab, accepting saves and sets the preferences cookie. |
| `site-urls.test.mjs` | Page addresses: links, images and cookies point to the same place from the root page and from page folders (`discover/`…). |
| `accounts-cloud.test.mjs` | Accounts on Supabase (with a stand-in for supabase-js): sign up, log in, clear error messages, profile edits, hidden phone, old preferences carried over, log out, password reset. |
| `db.test.mjs` | The Supabase connection: off without config, one client, backend errors become short codes and plain sentences. |
| `namo.test.mjs` | Namo, the chatbot: understanding messages, explanations, follow-ups, learning consent, Gemini fallback. |
| `namo-guard.test.mjs` | The fact check that stops AI replies from inventing prices, numbers, places or promises. |
| `namo-worker.test.mjs` | The worker's `POST /namo` with Gemini faked: key safety, limits, refusals and fallbacks. |
| `worker.test.mjs` | The worker's `GET /nearby` with Google Places faked. |
| `cache.test.mjs` | The worker's time-limited cache. |
| `nearby-core.test.mjs` | Shared nearby-places logic: categories, distances, opening hours, walking routes. |
| `osm.test.mjs` | Free OpenStreetMap mode: Overpass results, pins, pin drafts and the saved snapshot. |
| `geo-lib.test.mjs` | Editing `shared/js/data/data.js` safely, one listing line at a time. |
| `refs.test.mjs` | Reference numbers (unique UUID v4 per listing, also for owner listings) and cover vs room photos. |
| `inbox.test.mjs` | Roles (student, landowner, both), public profiles, and messages: interest → offer → accepted deal → tenant group chat. |
| `websearch.test.mjs` | Namo's web search: housing-only results in range, safe links, search-further links, one request at a time. |
| `testbot.test.mjs` | The test landowner bot (replies, counter-offers, tenant group, removal) and photos / emojis in messages. |
