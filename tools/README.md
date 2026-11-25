# tools/ — helper scripts you run on your computer

These are **not** part of the website. Run them with `npm run …` (Node 21.7 or newer).
They read settings and keys from `.env`, which never leaves your computer.

| File | Run with | What it does |
|---|---|---|
| `make-config.mjs` | `npm run config` | Writes `shared/js/app/config.js` (worker address, Maps browser key, AI on/off) from `.env`. |
| `supabase-bundle.mjs` | `npm run db:bundle` | Joins `supabase/migrations` into `supabase/setup.sql`, to paste into Supabase's SQL editor. |
| `osm-snapshot.mjs` | `npm run nearby` | Saves nearby stores from OpenStreetMap for every pinned dorm into `shared/js/data/nearby-snapshot.js`. Free, no key. |
| `geocode.mjs` | `npm run geocode` | Finds map coordinates for listings with Google and saves them into `shared/js/data/data.js`. Needs `GOOGLE_MAPS_SERVER_KEY`. |
| `geo-lib.mjs` | (used by `geocode.mjs`) | Reads and edits `shared/js/data/data.js` one listing line at a time. |
| `js-files.mjs` | (used by tools and tests) | Map of where each browser script lives, e.g. `jsPath("data")` → `shared/js/data/data.js`. Update it when you move a file in `js/`. |
