# DormNamo

Find a dorm near campus. Swipe, match, message the landowner.

![platform](https://img.shields.io/badge/platform-Web-2f8f55) ![stack](https://img.shields.io/badge/HTML%20%7C%20CSS-JavaScript-0a47a9) ![backend](https://img.shields.io/badge/backend-Supabase-3ecf8e) ![hosting](https://img.shields.io/badge/hosted%20on-GitHub%20Pages-24292e)

[Live site](https://dormnamoph.github.io/DormNamo/) · [System map](docs/system-map.html)

<p>
  <a href="docs/screenshots/rooms.png"><img src="docs/screenshots/rooms.png" width="32%" alt="Rooms"></a>
  <a href="docs/screenshots/discover.png"><img src="docs/screenshots/discover.png" width="32%" alt="Discover"></a>
  <a href="docs/screenshots/messages.png"><img src="docs/screenshots/messages.png" width="32%" alt="Messages"></a>
</p>

## About

Web app for students near MSU-IIT in Iligan to find a place to stay, and for landowners to list one. Rooms are ranked by a match score that learns from your swipes.

Built around what students actually ask for: budget, walking distance, water, electricity, Wi-Fi, curfew. Namo, the built-in assistant, answers questions about listings and explains its picks.

## Features

- Rooms page with search, filters, compare
- Discover: swipe up to like, down to pass, Z to undo
- Match % per room, with a plain-language reason
- Room details with photos, amenities, tenant ratings, comments
- Map with nearby stores, food, laundry, and walking routes
- Namo chat: ask about a listing, compare two, search for more
- Landowner listings with photos and house rules
- Plans: Basic (2 places), Owner Pro (5 places), boosts for featured spots
- Chats, offers, and deal status between student and landowner
- Tenant group chat once a deal is agreed
- Accounts with sign up, log in, password reset

## Screenshots

| | | |
| --- | --- | --- |
| [<img src="docs/screenshots/my-listings.png" alt="My listings">](docs/screenshots/my-listings.png) | [<img src="docs/screenshots/people.png" alt="People">](docs/screenshots/people.png) | [<img src="docs/screenshots/about.png" alt="About">](docs/screenshots/about.png) |

## Use

Open the [live site](https://dormnamoph.github.io/DormNamo/) in any browser. No install, no build.

## Run locally

Clone the repo and open `index.html`, or serve the folder with any static server. Without Supabase settings the site falls back to browser storage.

Copy `.env.example` to `.env` for keys, then:

```
npm install
npm test
npm run config
```

Other scripts: `npm run nearby` (nearby places snapshot), `npm run geocode` (needs a Google server key), `npm run worker:deploy` (Cloudflare Worker), `npm run db:test` (database checks).

## Backend

`supabase/` holds the migrations, `setup.sql`, and tests. Run `npm run db:bundle`, paste `setup.sql` into the Supabase SQL editor. Plans and boosts are set only by the team through `admin.sql`.

The Worker in `worker/` keeps the Gemini key out of the browser. Namo decides every fact itself; Gemini only rewords, and a fact check drops any reply that adds something.

## Pinning dorms

Each dorm needs its map location pinned once with the tool at `/pin/`. Download `pins.js`, replace `shared/js/data/pins.js`, run `npm run nearby`, then push. Use your own sources (a visit, the owner, satellite imagery), not coordinates copied from Google Maps.

## Project structure

`index.html` Rooms, `discover/`, `my-listings/`, `people/`, `messages/`, `about/`, `pin/`, `shared/` common code, `supabase/`, `worker/`, `tools/`, `tests/`, `img/`.

## Built with

HTML, CSS, JavaScript, Supabase, Cloudflare Workers, Google Gemini, Leaflet, OpenStreetMap, Overpass, Nominatim, OSRM.

Area photos from Wikimedia Commons under CC BY-SA 4.0. Dorm photos are used with the uploader's permission.

## Team

CCC100, Team Gwapo.

## License

All rights reserved unless a license file says otherwise.
