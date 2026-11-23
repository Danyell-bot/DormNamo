# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

Static site, no build step, no linter. Open `index.html` (Rooms), `discover.html` (swipe feed) or `mylistings.html` (owners edit their listings) in a browser. Deploy by uploading the folder to GitHub Pages. `package.json` exists only for tooling, not for the site. The tools need Node ≥ 21.7 (they use `process.loadEnvFile`):

- `npm test`: Node's built-in test runner (`node --test tests/`), no dependencies. Run one file with `node --test tests/worker.test.mjs`, or one test with `node --test --test-name-pattern="cache expires" tests/`.
- `npm run config`: writes the gitignored `js/config.js` (browser key, Map ID, worker URL) from `.env`.
- `npm run nearby [-- --all]`: saves OpenStreetMap nearby places for pinned dorms into `js/nearby-snapshot.js` (no key).
- `npm run geocode [-- --dry-run|--force|--max-age-days N]`: saves `lat`/`lng` into `js/data.js` (needs `GOOGLE_MAPS_SERVER_KEY`).
- `npm run worker:dev` / `npm run worker:deploy`: the Cloudflare Worker through `npx wrangler`.

Never put a real key in source. Keys live in `.env` (gitignored); `.env.example` documents them.

## Architecture

Plain ES5-style browser JS. There are no modules: every file defines globals (`HOUSES`, `S`, `USER`, `$`, `esc`, `score`, `draw`, …) or an IIFE namespace (`Accounts`, `Auth`, `Onboarding`, `Nav`, `FX`, `Chat`, `Argon2id`). **Script order in each HTML file is the dependency graph.** If you add a file or a global, add the `<script>` tag to `index.html`, `discover.html` and `mylistings.html` in the right place. Page-only scripts: `browse.js`, `owners.js` and `hero-fx.js` load only on `index.html`, `discover.js` only on `discover.html`, `mylistings.js` only on `mylistings.html`, and `select.js` on Rooms and My listings, so shared code must guard them (`if (window.HeroFX) …`). `pin.html` has its own short list (`data`, `utils`, `pins`, `nearby-core`, `maps`, `pin-tool`). `js/config.js` is gitignored but loaded by every page; `js/config.example.js` is the template, and the code must work when it is missing or empty. Both pages also need the same overlay/dialog elements (`#auth`, `#ob`, `#toast`, `#dlg`).

**Start-up (`main.js`):** `boot()` → `Accounts.current()`. With no session it calls `Auth.show(boot)`. With a session it runs `loadState(user)`, then shows `Onboarding.open` if `!S.done`, then `startSite()`, which renders the account menu, calls `pageInit()` if the page defines one (Discover does), and starts `Chat.init()`. `browse.js` sets up its UI and calls `render()` as soon as it loads, before login. `nav.js` calls `Nav.render()` when it loads. The active tab comes from `<body data-page>`.

**Data (`data.js`):** `HOUSES` uses terse keys: `n` name, `a` area, `s` school, `d` straight-line km, `t` type, `p` rent (or `null`), `r`/`rc` rating and rating count, `v` verified, `am` amenities, `ds` description, `c` contact, `rev` reviews, `facts` (explicit overrides). The records are real Google Maps places near MSU-IIT. A core product rule: **never invent rent, amenities or rules**. Unknown values stay `null` and are shown as "unverified" or "Rate on request". `SCHOOLS`, `TYPES` and `AMS` drive the selects and chips.

**State (`state.js`):** `S` holds the logged-in user's state: `S.P` preferences, `likes`/`passes`/`marks`/`inq`/`log`/`hist`/`views`, and `S.nn` model weights. Save it with `save()`. `S.P.m[key]` sets how strict each preference is: 0 = don't care, 1 = preferred (affects ranking), 2 = must have (hard filter). `W` holds the ranking weight of each preference and `LBL` its label. The preference keys (`dist budget cap gender water elec env kit wifi space curfew vis`) are shared by `state.js`, `matching.js`, `onboarding.js` (`STEPS`), `chat.js` (`WORDS`) and `twotower.js`. A new preference has to be added in all of them.

**Ranking pipeline:**
- `matching.js`:
  - `facts(h)` pulls facts out of the listing text with regexes; `h.facts` overrides them.
  - `ev(h)` checks each active preference and returns true, false or null (unknown).
  - `score(h)` combines a weighted rule score with the Two-Tower cosine similarity. The blend weight `alpha()` grows with the number of interactions, up to 0.5.
  - A must-have that is false excludes the listing. A must-have that is unknown costs a small penalty.
  - `queue()` builds the Discover deck.
- `twotower.js`: a tiny two-tower network trained in the browser. `dvec(h)` is the listing feature vector and `uvec()` the user vector, which includes the centroids of liked and passed listings. `train()` runs SGD over the recent `S.log` (`{id, y, w}` entries written by `discover.js` actions). Weights start deterministic (`initModel` with `lcg(7)`).

**Accounts (`accounts.js`):** everything is in `localStorage` (`dormnamo:accounts`, `dormnamo:session`, `dormnamo:state:<id>`). Passwords are hashed with the pure-JS `argon2id.js` (RFC 9106; tune speed with `DEFAULTS`). Legacy SHA-256 hashes are upgraded to Argon2id on the next login. Guest mode is also supported. To move to a real backend, replace the function bodies in `Accounts` and keep the API.

**Chat (`chat.js` + `talk.js`):** "Namo" is a local chatbot with no API. It reads English, Tagalog and Cebuano. `chat.js` handles preferences: it tokenizes and stems the message, fixes typos with Levenshtein distance against its vocabulary, looks words up in `WORDS` (concept → synonyms), matches whole ideas with `PHRASES` ("I'm broke" = cheaper, "online classes" = Wi-Fi), and detects must, skip and negation cues and numbers. Phrase matches always mean "want" so negation inside them ("no water problems") does not flip them. Ordinary words that must never be typo-corrected into a preference ("room" is not "roomy") are registered with no concept. Anything that does not change a preference goes to `talk.js`, which maps words to shared meanings (`CANON`) and picks the closest `INTENTS` example by TF-IDF cosine over meanings, word pairs and character trigrams. A near miss becomes "Did you mean …?". `chat.js` keeps a small `ctx` (the listing being discussed for follow-ups like "does it have wifi?", what "yes" should do next, and the position for "more"). Talk intents with `act` (show, more, prefs, liked, help, yes, no) are carried out by `chat.js`. Test changes in Node by loading the JS files into a `vm` context with `document` and `localStorage` stubbed out.

**Maps and nearby places:** there are two providers, chosen automatically. With no `js/config.js` keys (the current setup), the map is Leaflet + OpenStreetMap tiles and nearby places come from OpenStreetMap via Overpass. With keys, Google is used.
- Dorm coordinates come from `js/pins.js` (`PINS`, set by hand in `pin.html`), drafts in `localStorage` (`dn:pinDrafts`, shown only on that device), or `lat`/`lng` in `data.js`. `DNMaps.applyPins()` merges them at load, and pins win.
- `npm run nearby` (`tools/osm-snapshot.mjs`) saves OSM results per pinned dorm into `js/nearby-snapshot.js`, which is used when the pin hasn't moved. Live Overpass is only a fallback, because the public servers are slow (~25 s) and often return 502/504.
- `details.js` defines a global `open(id)`, which shadows `window.open`. To open a URL, create an `<a target=_blank>` and click it (`openLink` in maps.js).

- `js/nearby-core.js` holds pure logic: `CATEGORIES` (Places types, radius, color, icon), distance and time formatting, the summary text, and an opening-hours check.
  - It is a UMD file. The browser gets the `NearbyCore` global, while the worker and the tests `import` it as CommonJS, so keep it free of the DOM and of ES-module syntax.
- `js/maps.js` (`DNMaps`): `details.js` calls `DNMaps.section(h)` while building the dialog HTML and `DNMaps.mount(h)` after `showModal()`.
  - **One** `google.maps.Map` is created per page and its canvas is moved into each dialog, because every new Map is a billed load.
  - Nearby data is memoized per listing and kept in `sessionStorage` for 1 h.
  - Everything fails soft: no key, no coordinates or a worker error shows a message, and the dialog still works.
- `worker/nearby.mjs` is the only backend: a Cloudflare Worker with `GET /nearby?lat&lng`.
  - It makes one Places API (New) Nearby Search per category, with optional Routes API times, and keeps a TTL cache in `worker/cache.mjs` (KV or memory).
  - `createHandler({fetch, store, now})` injects dependencies, which is how `tests/worker.test.mjs` mocks Google.
- `tools/geocode.mjs` edits `data.js` line by line through `tools/geo-lib.mjs`. Each listing must stay on one line as a JSON object.
  - The `geo` field records the source (`places`, `geocode:<type>` or `manual`) and `geoAt` the date. Coordinates from Google are refreshed after 30 days (Google's caching terms). `manual` ones are never touched.

**Photos (`js/photos.js`):** `Photos.thumb(h)` (cards), `Photos.hero(h)` + `Photos.mount(D, h)` (dialog gallery). Dorms without `PHOTOS.dorm[id]` fall back to CC BY-SA area photos, which must stay labeled "Area photo" and keep their credit/license links. Never add photos scraped from Google Maps or Facebook.

**CSS:** `base.css` is the design system. Load order (same on both pages): `base`, `home`, `chat`, `ui`, `discover`, `maps`, `details`, `polish` (blue/yellow palette and final fixes), `hero`, `brand`, `onboarding`, then `owners` and `finder` on `index.html` only. A later file wins at equal specificity, so `polish.css` does not override `hero`/`brand`/`onboarding`/`finder`. `body.dark` styles the Discover page.

**Owner listings (`js/listings.js`, every page, right after `photos.js`):** places owners add (Rooms "Add your property" form or `mylistings.html`) live in `localStorage` (`dormnamo:listings`, one record per place with `uid`, the HOUSES fields, `facts`, `plan`, `cover` and `photos` as JPEG data URLs). At load `Listings.apply()` merges every record into `HOUSES` and its photos into `PHOTOS.dorm`, so cards, Discover and the dialog need no special cases. Photos are shrunk in the browser (`Listings.shrink`, ~1100–1400 px, JPEG .74) because localStorage holds about 5 MB; `save()` returns `{error: "full"}` when it is out of space. Owners only set `facts` they state; "Not stated" deletes the key so it stays unknown. `mylistings.js` edits a working copy and writes only on Save (Ctrl+S); `#<id>` picks a listing, `#new` starts one. The account menu links to the page (`nav.js`). Phone helpers (`fmtPhone`, `phoneOk`, `phoneField`) are in `utils.js`.

**Comments (`js/comments.js`, every page, loaded after `listings.js`):** per-listing student comments in the details dialog (`Comments.section(h)` + `Comments.mount(D, h)`, after the map) and a count badge on Rooms cards (`Comments.counts()`, `[data-cm]`). Stored in `localStorage` (`dormnamo:comments`), so they only exist in the browser that wrote them; only the author (`uid === USER.id`) can delete. Swap `load`/`store`/`add`/`remove` for a backend and keep the API.

**Stars vs hearts (keep them separate):** stars rate *quality* and only come from people who stayed there: `rating(h)` in `utils.js` blends the Google rating (`h.r` × `h.rc`) with tenant ratings left on comments (`Comments.stats`, one per person, latest wins; owners can't rate their own listing). `stars(h, long)` renders them with `[data-rate]` so `refreshStars(h)` can update them, and "Top rated" sorts by `ratingScore(h)`. Hearts (`js/hearts.js`, every page after `comments.js`) mean *saved / popular*: a heart is the same as a Discover like (`S.likes` + an `S.log` entry), the per-room count lives in `localStorage` (`dormnamo:hearts`), and hearts never change the star score. Hearts are red, stars gold. `main.js` calls `Hearts.syncAll()` after login; `discover.js` calls `Hearts.sync(id)` on like/undo.

**Owners (`owners.js`, index only):** "List your place" pricing. `BOOST`/`PRO` prices must stay in sync with the `<select id="aPlan">` options in `index.html`.

## Conventions

- Escape any user- or data-derived string with `esc()` before putting it into the `innerHTML` strings that build most of the UI.
- Code is formatted with Prettier (`npx prettier --write --print-width 110` on `css/`, `js/`, `tools/`, `tests/`, `worker/`). Never format `js/data.js` (the geocode tool needs one listing per line) or the generated `js/pins.js`, `js/nearby-snapshot.js` and `js/config.js` (a `--ignore-path` file did not stop Prettier from rewriting them, so restore them if touched). The four HTML files are formatted the same way (Prettier's default whitespace handling keeps inline spacing).
- Keep the existing `var`, function expressions and no transpile-only syntax. Do not add a framework or a build step. (The worker and the tools are modern ES modules, `.mjs`.)
- UI icons are line SVGs from `ico(name)` (`ICONS` in `utils.js`) and the logo is `logoHTML()`. Don't use emoji in navigation, buttons or cards. Namo's chat replies may keep them. Brand/Discover styles live in `css/brand.css`.
- Rooms hero motion lives in `js/hero-fx.js` + the end of `css/hero.css`: the grid spotlight (`--mx/--my` on `.hero`), stat scramble, and the intro. `index.html` adds `class="intro"` to `<html>` in the head (hidden until `HeroFX.play()` runs from `startSite()`, with an 8 s fallback). Keep new hero children compatible with the `.hero .wrap > *` intro animation.
- `base.css` pads every `<section>` by 48px. Only the page sections want that, so any other `<section>` (the dialog's `.nb`, the pin tool's main column, Leaflet's layer switcher) must reset `padding`.
- Speed metrics: never start the whole page or the hero `h1` (the Largest Contentful Paint element) fully transparent or animated. Browsers only count animated or opacity-0 content as painted on a later repaint. The body fade starts at `opacity: .01` for that reason. This took FCP/LCP on the Rooms page from ~1.1 s/2.4 s to ~0.15 s.
- Glides to the room list go through `FX.resultsTarget(finder)`. On phones it targets the results bar, because the filter panel fills the first screen there.
- Fonts load as variable ranges (`Figtree:wght@400..800`, `Bricolage+Grotesque:wght@600..800`). Keep every weight used in CSS inside those ranges.
- Walking routes: clicking a nearby place (pin or list name) calls `routeTo()` in `maps.js`. It draws a dashed straight line at once, then the real path from the free OSRM routers (FOSSGIS `routed-foot` first, the OSRM demo car profile as backup with walking time estimated at 4.8 km/h), with the result in the `#nbRoute` bar under the map. No bubble, because it covered the route. Routes are memoized and kept in `sessionStorage`; `routeToken` drops stale responses. Parsing (`routeUrl`/`parseRoute`/`routeLabel`) is in `nearby-core.js` with tests. The routers ask for fair use and the "Routes © FOSSGIS / OSRM" credit.
- "Find your room" styles live in `css/finder.css`. Every visible `<select>` (search bar, filter "Near", "Sort by", and the owner form's Room type/Near/Plan) uses the custom `Dropdown` (`js/select.js`, ids listed at its end); a new select should be added there too. When code sets a select's value, call `Dropdown.sync(select)` (browse.js `ddSync`) or the styled button shows the old choice. Set the price filter only through `setPrice(v)`, which keeps `F.p`, the slider, its `--fill` and the label in step.
