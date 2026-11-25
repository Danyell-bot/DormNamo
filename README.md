<div align="center">

# DormNamo

Find a dorm near campus. Swipe, match, message the landowner.

[Live site](https://dormnamoph.github.io/DormNamo/) · [System map](docs/system-map.html) · [Report an issue](https://github.com/DormNamoPH/DormNamo/issues)

![Rooms page](docs/screenshots/rooms.png)

</div>

## About

DormNamo helps students near MSU-IIT in Iligan find a place to stay, and helps landowners list it.

- Students set what they need: budget, walking distance, water, electricity, Wi-Fi, curfew, and more.
- Rooms are ranked by a match score that learns from swipes.
- Namo, the built-in assistant, answers questions about listings and explains its picks.
- Landowners list places, chat with students, and agree on deals in-app.

Built for CCC100 by Team Gwapo.

## Screenshots

| Rooms | Discover |
| --- | --- |
| ![Rooms](docs/screenshots/rooms.png) | ![Discover](docs/screenshots/discover.png) |

| My listings | Messages |
| --- | --- |
| ![My listings](docs/screenshots/my-listings.png) | ![Messages](docs/screenshots/messages.png) |

| People | About |
| --- | --- |
| ![People](docs/screenshots/people.png) | ![About](docs/screenshots/about.png) |

## Features

**For students**

- Rooms page with search, filters, and compare
- Discover: swipe up to like, down to pass, Z to undo
- Match % per room, with a plain-language "why this one"
- Room details with photos, amenities, tenant ratings, and comments
- Map with nearby stores, food, and laundry, plus walking routes
- Namo chat: ask about a listing, compare two, or search for more places

**For landowners**

- List and edit places with photos and house rules
- Basic plan (2 places) and Owner Pro (5 places)
- Boosts to get featured in a barangay
- Chat, send offers, and close deals

**Messaging**

- Student and landowner chats with deal status
- Offers: rent, move-in date, note
- Tenant group chat once a deal is agreed

## How it works

```
Browser (static pages + shared/js)
  |-- Supabase       accounts, database, storage, realtime
  |-- Cloudflare Worker   holds the Gemini key (Namo rewording only)
  |-- OpenStreetMap, Overpass, Nominatim, OSRM   maps, nearby places, routes
```

- No build step. Pages are plain HTML, CSS, and JavaScript.
- Ranking, learning, and Namo run in the browser.
- Namo decides every fact itself. Gemini only rewords, and a fact check drops any reply that adds something.
- Accounts run on Supabase. The rest of the data is moving over module by module, with a fallback to browser storage.

Full diagrams are in the [system map](docs/system-map.html).

## Project structure

```
index.html          Rooms (home)
discover/           Swipe deck
my-listings/        Owner editor
people/             Landowners and students
messages/           Chats, offers, tenant groups
about/              About page
pin/                Pin tool for exact dorm locations
shared/             Code used by two or more pages
supabase/           Migrations, setup.sql, admin.sql, edge functions, tests
worker/             Cloudflare Worker (Namo + optional Places proxy)
tools/              Node scripts (config, geocode, nearby)
tests/              Frontend tests
img/                Area photos
```

## Getting started

Requirements: a browser. Node.js is only needed for the tools and tests.

```bash
git clone https://github.com/DormNamoPH/DormNamo.git
cd DormNamo
```

Open `index.html`, or serve the folder with any static server (VS Code Live Server works).

Without Supabase settings the site runs on browser storage, so it works offline for local testing.

### Tools and tests

```bash
npm install
npm test            # frontend checks
npm run db:test     # database checks (needs Postgres)
npm run config      # writes shared/js/app/config.js from .env
npm run nearby      # snapshot of nearby places for pinned dorms
npm run geocode     # needs a Google server key
npm run worker:deploy
```

Copy `.env.example` to `.env` and fill in your keys. `.env` is never committed.

## Configuration

| Value | Where | Notes |
| --- | --- | --- |
| Supabase URL and anon key | `shared/js/app/config.js` | Public by design. RLS decides access. |
| `GEMINI_API_KEY` | Worker secret | `wrangler secret put GEMINI_API_KEY` |
| `NAMO_AI` | Worker | Turns Namo rewording on or off |
| `NEARBY_GOOGLE` | Worker | Google Places is off by default |
| `ALLOWED_ORIGINS`, `ALLOWED_AREA` | Worker | Limit who and where the Worker serves |

`make-config.mjs` refuses a `service_role` key. Never put one in the site.

## Pinning dorms

Each dorm needs its map location pinned once.

1. Open `/pin/` and set the exact location from a visit, the owner, or satellite imagery.
2. Download `pins.js` and replace `shared/js/data/pins.js`.
3. Run `npm run nearby` to save the nearby-places snapshot.
4. Push.

Do not copy coordinates from Google Maps.

## Database

The backend lives in `supabase/` as plain SQL, so it is versioned with the site.

1. Run `npm run db:bundle` to build `supabase/setup.sql` from the migrations.
2. Paste it into the Supabase SQL editor.
3. Optionally deploy the delete-account function with the Supabase CLI.

Plans and Featured boosts are written only by the team (`admin.sql`) or a future payment function.

## Deployment

GitHub Pages serves the site. Push to `main` to publish.

## Photo policy

- Area photos come from Wikimedia Commons under CC BY-SA 4.0, with credit shown.
- Dorm photos must be ones you took or have permission to use.

## Roadmap

- Move preferences, listings, comments, and hearts to Supabase
- Messages page on Realtime and the deal functions
- Pin the remaining dorms
- Real payments for plans and boosts (billing is a demo today)

## Team

CCC100, Team Gwapo.

## License

Not yet specified.
