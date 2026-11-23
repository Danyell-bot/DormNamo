# DormNamo

Open `index.html` in a browser (no build step). For GitHub Pages, upload the whole folder.
The map and "Nearby places" work **for free with no keys** (OpenStreetMap). Each dorm just needs to be pinned once, see [Pinning dorms](#pinning-dorms-free). Google Maps is optional and takes over automatically once its keys are set up ([below](#google-maps-and-nearby-places)).

## Pinning dorms (free)
1. Open **`pin.html`** (not linked in the menu). It starts on the first dorm without a pin. Then either:
   - click its building on the map (the **Satellite** layer and the street search help), or
   - paste its location into **Paste a location**: coordinates (`8.2412, 124.2453`), a plus code (`66RW+F4M`), or a map link with coordinates in it. The tool warns you if the spot doesn't match the listing's distance from campus.

   Use locations you got yourself: a visit (your phone's map shows your coordinates), the owner, or the satellite view. Don't copy them out of Google Maps: Google's terms forbid it. None of the dorms are in OpenStreetMap yet (checked November 2026). Press **Next dorm →** to move on.
2. Pins are saved as drafts in that browser, and the site already shows them **on that device**, so you can check them.
3. Click **Download pins.js** and replace `js/pins.js` with it.
4. Run **`npm run nearby`**. It saves the nearby stores for every pinned dorm into `js/nearby-snapshot.js`, so the dialog loads them instantly. The free Overpass servers are slow and often busy. Without a snapshot the dialog asks them live, which can fail.
5. Upload the site. Back in `pin.html`, click **Clear drafts**.

Pinned so far: Brylle's Dormitory, decoded from the plus code `66RW+F4M` in its address. The other 12 need pinning.

**Walking routes:** click any nearby place (its pin or its name in the list) to see the shortest walking route from the dorm along the streets, e.g. "7 min walk · 530 m along streets · straight line 420 m". Routes come from the free OpenStreetMap routing service by FOSSGIS (no key), with the OSRM demo server as backup. If both are down, a dashed straight line is shown and labeled as such.

Nearby places in free mode come from OpenStreetMap (`CATEGORIES[].osm` tags in `js/nearby-core.js`; sari-sari stores count as convenience stores). Volunteers map these, so some shops may be missing and there are no ratings or opening hours. Distances are straight-line.

## Pages
- `index.html`    Rooms: hero + search pill, filters, compare, owners section
- `discover.html` Discover: TikTok-style swipe feed (dark page, like/pass/bookmark/undo)

## CSS (`css/`)
base.css (design system) · polish.css (final visual fixes + blue/yellow palette) · home.css (navbar, hero, motion, dark Discover page) · discover.css (swipe cards) · ui.css (login/questionnaire, menus, toast) · chat.css (Namo) · maps.css (map + nearby places)

## JS (`js/`, loaded in the order listed in each HTML file)
- data.js real places near MSU-IIT from Google Maps; rent/amenities left empty when not published (replace with your database). `lat`/`lng`/`pid`/`geo`/`geoAt` are written by `npm run geocode` · utils.js helpers · details.js listing dialog · browse.js Rooms list/filters
- config.js browser settings generated from `.env` (gitignored; see config.example.js, optional) · pins.js exact dorm locations from pin.html · nearby-snapshot.js saved nearby places (`npm run nearby`) · nearby-core.js shared nearby-places logic (edit `CATEGORIES`) · maps.js map (Google or OpenStreetMap), markers, legend and nearby list in the listing dialog · pin-tool.js the pin.html tool
- matching.js facts, must-have filters, weighted score, explanations · twotower.js Two-Tower model · state.js per-user state
- discover.js swipe deck · accounts.js sign up/log in (localStorage; swap for a real backend)
- auth.js login screen · onboarding.js questionnaire (edit `STEPS`) · nav.js navbar (edit `TABS`) · fx.js animations
- talk.js Namo's conversation brain: greetings, thanks, questions, feelings, yes/no (add synonyms to `CANON`, example sentences and replies to `INTENTS`)
- chat.js Namo, the preference chatbot (edit `WORDS` for single words and `PHRASES` for whole ideas like "I'm broke" = cheaper)
- argon2id.js Argon2id password hashing (RFC 9106, pure JS; 19 MiB, 2 passes; change `DEFAULTS` to tune speed)
- main.js start-up: login -> questionnaire -> page

## Google Maps and nearby places

Each listing dialog shows:
- a map with the dorm's marker and an info window
- a **Get directions** link
- a **Nearby places** section with a summary row, a per-category list (closest first, top 5 with "Show more") and colored map markers
- a legend that also works as a filter

The categories are convenience stores, supermarkets and markets, malls (1 or 3 km), stores, and the optional food, transit and health categories.

### How it fits together

```
browser (GitHub Pages)                       Cloudflare Worker (worker/nearby.mjs)          Google
 js/maps.js ── Maps JavaScript API ───────────────────────────────────────────────────────▶ browser key
 js/maps.js ── GET /nearby?lat&lng ──▶ cache hit? return (24 h TTL, KV)
                                        else Places API (New) Nearby Search ×1 per category ─▶ server key
                                        (+ Routes API walking times if ROUTES_MODE=WALK)
tools/geocode.mjs (run by you) ── Places Text Search / Geocoding API ──▶ lat/lng saved in js/data.js
```

The site is static and has no backend. The Places calls go through a small Cloudflare Worker so that the **server key never reaches the browser**. Any serverless host would work. Only `export default { fetch }` in `worker/nearby.mjs` is Cloudflare-specific.

### 1. Google Cloud Console (manual steps)
1. Create or choose a project and **link a billing account**. Maps Platform APIs don't work without billing, even inside the free usage.
2. **APIs & Services → Library**, enable:
   - **Maps JavaScript API** (the map)
   - **Places API (New)** (nearby search, and finding each dorm). Not the legacy "Places API".
   - **Geocoding API** (fallback when a dorm can't be found by name)
   - **Routes API**, only if you want walking or driving times (`ROUTES_MODE`)
3. **Credentials → Create credentials → API key**, twice:
   - **Browser key.** Application restriction: *Websites (HTTP referrers)*, e.g. `https://YOUR-USERNAME.github.io/*` and `http://localhost:5500/*`. API restriction: **Maps JavaScript API only**.
   - **Server key.** Application restriction: *None*, because Cloudflare Workers have no fixed IP. If you only run `geocode` from a fixed IP, you can use a separate IP-restricted key for that. API restriction: **Places API (New), Geocoding API** (+ **Routes API** if used).
4. Recommended: **Quotas** on Places API (New) (e.g. a daily request cap) and a **Budget alert** under Billing. The worker only answers for its allowed origins and area, but a determined caller can still spend your quota.
5. Optional: **Map Management → Create Map ID** (JavaScript, vector) and put it in `GOOGLE_MAPS_MAP_ID`. `DEMO_MAP_ID` works for testing. A Map ID is needed for the colored category pins. Without one, plain colored dots are used.

### 2. Local setup
```sh
cp .env.example .env          # fill in the keys and NEARBY_API_URL
npm run geocode -- --dry-run  # preview coordinates for every listing
npm run geocode               # save lat/lng into js/data.js (safe to re-run)
npm run config                # writes js/config.js for the browser
npm test                      # unit + API-layer tests, no keys needed
```
`npm run geocode` looks each dorm up by name and address with Places Text Search (New), which gives the exact business pin and place ID. If the name doesn't match, it geocodes the address instead, which is less exact. The `geo` field records which method was used.

The script is **idempotent**. It skips listings whose coordinates are fresh, and refreshes them after 30 days (see the terms note below). To pin a location yourself, e.g. coordinates confirmed by the owner, set `"lat"`, `"lng"` and `"geo": "manual"` on the listing, and the script will never touch it.

### 3. Deploy the worker (Cloudflare, free plan is enough)
```sh
npx wrangler login
npx wrangler kv namespace create NEARBY_CACHE      # paste the id into worker/wrangler.toml, uncomment the block
# edit ALLOWED_ORIGINS in worker/wrangler.toml to your site's origin(s)
npx wrangler secret put GOOGLE_MAPS_SERVER_KEY --config worker/wrangler.toml
npm run worker:deploy
```
Put the printed `https://dormnamo-nearby.<you>.workers.dev` URL in `.env` as `NEARBY_API_URL`, run `npm run config` again, and upload the site including `js/config.js`.

For local testing, `npm run worker:dev` runs the worker with secrets from `worker/.dev.vars` (gitignored): `GOOGLE_MAPS_SERVER_KEY=...`.

Worker settings (`[vars]` in `worker/wrangler.toml`):

| Var | Default | Meaning |
|---|---|---|
| `ALLOWED_ORIGINS` | none | Sites allowed to call it (CORS) |
| `ALLOWED_AREA` | `8.2408,124.2437,100` | Only answer within 100 km of MSU-IIT |
| `CACHE_TTL_SECONDS` | `86400` | Cache per dorm (clamped to 60 s … 30 days). Failed lookups are cached for only 5 min |
| `ROUTES_MODE` | `off` | `WALK` or `DRIVE` adds route times for the top 5 per category, labeled as such. Otherwise distances are labeled "straight line" |
| `NEARBY_CATEGORIES` | all | e.g. `convenience,grocery,mall,retail` to skip the optional ones and save money |

Categories, their Google place types, radii, colors and icons are defined in `CATEGORIES` in `js/nearby-core.js`.

### Errors and fallbacks
- **No browser key, key rejected, or Maps failed to load:** the map area shows "Map unavailable". The nearby list still loads.
- **Worker not configured, unreachable, or Google errors:** a friendly message replaces the list. If one category fails, only that one shows an error.
- **Listing without coordinates:** "Exact location not set yet". Get directions falls back to a name search.

### Cost notes (estimate, verify on Google's pricing page)
Requests per **dorm, per cache period (24 h)**, only when someone opens that dorm:

| What | Calls | SKU |
|---|---|---|
| Nearby places | 1 Nearby Search per enabled category: 7 by default, 4 without the optional ones | Nearby Search **Enterprise**, because `rating` and opening hours are requested. Removing them from `FIELDS` in `worker/nearby.mjs` drops it to Pro |
| Walking times (if `ROUTES_MODE` is on) | 1 Route Matrix call, ≤ 35 elements | Compute Route Matrix, billed **per element** |
| Map | 1 map load per page view that opens a dialog (the map is reused between dialogs) | Dynamic Maps |
| Geocoding script | ~1–2 calls per listing per 30 days | Text Search (New) + Geocoding |

Worst case for the current 13 listings, each opened at least once every day: 13 × 7 × 30 ≈ **2,700 Nearby Search requests a month**. At approximate list prices of around US$30–40 per 1,000 Enterprise requests, that is roughly US$100 a month **before** Google's free monthly usage per SKU. Real traffic is usually far lower because of the 24 h cache.

Google changed Maps Platform pricing in 2025 to free usage caps per SKU, and prices change, so check <https://mapsplatform.google.com/pricing/> and set a budget alert. Ways to save: limit `NEARBY_CATEGORIES`, keep `ROUTES_MODE=off`, and use a longer `CACHE_TTL_SECONDS`.

### Google terms you are responsible for
- **Attribution.** The Google logo and map attributions on the map must stay visible (they are not covered or restyled). The nearby list also shows a "Google Maps" text attribution because it can appear without the map.
- **Caching Places content.** Google's Maps Platform terms restrict storing Places content. Place IDs may be kept indefinitely. Latitude/longitude may be cached **temporarily (up to 30 consecutive days)**, which is why `geocode` refreshes coordinates older than 30 days and why the worker caps its TTL at 30 days.
  - Caching other fields (names, ratings, hours) for 24 h is a judgment call this project makes to control cost. Review the current *Service Specific Terms* for Places API and lower `CACHE_TTL_SECONDS` if your reading of them requires it.
  - Open/closed status is computed from the cached hours at request time, so it is never 24 h stale.
- Coordinates you get yourself, such as owner-confirmed ones marked `"geo": "manual"`, are your own data and not subject to the cache limit.

## Photos
Cards, Discover and the listing dialog show photos from `js/photos.js`.
- **Area photos** (`PHOTOS.area`, files in `img/area/`) are free photos of the neighborhood from Wikimedia Commons, under **CC BY-SA 4.0**. Every dorm without its own photos shows them, labeled **"Area photo · not this dorm"**, with the photographer and license linked (required by the license):
  - [Andres Bonifacio Ave, Tibanga](https://commons.wikimedia.org/wiki/File:Iligan_Tibanga,_Andres_Bonfacio_Avenue_(Iligan,_Lanao_Del_Norte;_10-15-2023).jpg) by Patrickroque01
  - [MSU-IIT Gymnasium](https://commons.wikimedia.org/wiki/File:Facade_of_Mindanao_State_University_%E2%80%93_Iligan_Institute_of_Technology_Gymnasium.jpg) by Exec8
- **Card thumbnails:** each photo can have a ~500 px `thumb` copy (the area photos do: `*-500.jpg`, about 60 KB instead of about 200 KB). Cards use it through `srcset`, which saves data on phones.
- **Dorm photos** (`PHOTOS.dorm`, by listing id): only photos you may use, i.e. ones you took or the owner allowed. Put the files in `img/dorms/` and add e.g. `"7": [{ src: "img/dorms/7-1.jpg", alt: "…", credit: "Owner", license: "Used with permission" }]`. Several photos turn the dialog into a gallery. Don't copy photos from Google Maps or Facebook: they belong to the owners and reviewers who posted them.
