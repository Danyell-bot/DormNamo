<div align="center">

# DormNamo

### Your home away from home.

Find a dorm near MSU-IIT. Swipe, match, message the landowner.

<br>

<a href="https://dormnamoph.github.io/DormNamo/"><img src="https://img.shields.io/badge/OPEN%20THE%20APP-0a47a9?style=for-the-badge" alt="Open the app"></a>
&nbsp;
<a href="docs/system-map.html"><img src="https://img.shields.io/badge/SYSTEM%20MAP-0f1f3d?style=for-the-badge" alt="System map"></a>

<br>

![Web](https://img.shields.io/badge/platform-web-2f8f55?style=flat-square)
![JavaScript](https://img.shields.io/badge/HTML%20%7C%20CSS%20%7C%20JS-no%20build-f7df1e?style=flat-square&labelColor=24292e)
![Supabase](https://img.shields.io/badge/backend-Supabase-3ecf8e?style=flat-square)
![Cloudflare](https://img.shields.io/badge/worker-Cloudflare-f38020?style=flat-square)
![GitHub Pages](https://img.shields.io/badge/hosted%20on-GitHub%20Pages-24292e?style=flat-square)

</div>

<br>

<p align="center">
  <a href="docs/screenshots/rooms.png"><img src="docs/screenshots/rooms.png" width="32%" alt="Rooms"></a>
  <a href="docs/screenshots/discover.png"><img src="docs/screenshots/discover.png" width="32%" alt="Discover"></a>
  <a href="docs/screenshots/messages.png"><img src="docs/screenshots/messages.png" width="32%" alt="Messages"></a>
</p>

<br>

<h2 align="center">Why DormNamo</h2>

<p align="center">
Compare boarding houses and dorms by price, distance, and what reviewers say,<br>
without visiting every one. Where rent or amenities are not published, we say so instead of guessing.
</p>

<br>

<table align="center">
  <tr>
    <td align="center" width="33%"><h3>1. Tell us what you need</h3>Budget, walk to campus, water, electricity, Wi-Fi, curfew.</td>
    <td align="center" width="33%"><h3>2. Swipe</h3>Up to like, down to pass. The match score learns your taste.</td>
    <td align="center" width="33%"><h3>3. Message the owner</h3>Ask, make an offer, agree on a deal, join the tenant group.</td>
  </tr>
</table>

<br>

<h2 align="center">Features</h2>

<table align="center">
  <tr>
    <td valign="top" width="33%">
      <h3 align="center">For students</h3>
      <ul>
        <li>Search, filters, and compare</li>
        <li>Match % with a plain reason</li>
        <li>Photos, amenities, tenant ratings</li>
        <li>Map, nearby stores, walking routes</li>
        <li>Saved rooms from likes and hearts</li>
      </ul>
    </td>
    <td valign="top" width="33%">
      <h3 align="center">Namo, your assistant</h3>
      <ul>
        <li>Ask about any listing</li>
        <li>Compare two places</li>
        <li>Explains why a room is your best fit</li>
        <li>Searches for more places when nothing fits</li>
        <li>Never makes up prices or facts</li>
      </ul>
    </td>
    <td valign="top" width="33%">
      <h3 align="center">For landowners</h3>
      <ul>
        <li>List places with photos and house rules</li>
        <li>Basic (2 places) and Owner Pro (5)</li>
        <li>Boosts for featured spots</li>
        <li>Chats, offers, deal status</li>
        <li>Tenant group chat</li>
      </ul>
    </td>
  </tr>
</table>

<br>

<h2 align="center">More screens</h2>

<p align="center">
  <a href="docs/screenshots/my-listings.png"><img src="docs/screenshots/my-listings.png" width="32%" alt="My listings"></a>
  <a href="docs/screenshots/people.png"><img src="docs/screenshots/people.png" width="32%" alt="People"></a>
  <a href="docs/screenshots/about.png"><img src="docs/screenshots/about.png" width="32%" alt="About"></a>
</p>

<br>

<h2 align="center">Get started</h2>

<p align="center">
<b>Just use it:</b> open the <a href="https://dormnamoph.github.io/DormNamo/">live site</a>. No install, no build.
</p>

<details>
<summary><b>Run it locally</b></summary>

<br>

Clone the repo and open `index.html`, or serve the folder with any static server. Without Supabase settings the site falls back to browser storage.

Copy `.env.example` to `.env` for keys, then:

```
npm install
npm test
npm run config
```

Other scripts: `npm run nearby`, `npm run geocode`, `npm run worker:deploy`, `npm run db:test`.

</details>

<details>
<summary><b>Backend and Worker</b></summary>

<br>

`supabase/` holds the migrations, `setup.sql`, and tests. Run `npm run db:bundle` and paste `setup.sql` into the Supabase SQL editor. Plans and boosts are set only by the team through `admin.sql`.

The Worker in `worker/` keeps the Gemini key out of the browser. Namo decides every fact itself; Gemini only rewords, and a fact check drops any reply that adds something.

</details>

<details>
<summary><b>Pinning dorms</b></summary>

<br>

Each dorm needs its map location pinned once with the tool at `/pin/`. Download `pins.js`, replace `shared/js/data/pins.js`, run `npm run nearby`, then push. Use your own sources (a visit, the owner, satellite imagery), not coordinates copied from Google Maps.

</details>

<details>
<summary><b>Project structure</b></summary>

<br>

`index.html` Rooms, `discover/`, `my-listings/`, `people/`, `messages/`, `about/`, `pin/`, `shared/` common code, `supabase/`, `worker/`, `tools/`, `tests/`, `img/`.

</details>

<br>

<div align="center">

<h2>Built with</h2>

HTML, CSS, JavaScript, Supabase, Cloudflare Workers, Google Gemini, Leaflet, OpenStreetMap, Overpass, Nominatim, OSRM

<sub>Area photos from Wikimedia Commons under CC BY-SA 4.0. Dorm photos are used with the uploader's permission.</sub>

<br>
<br>

**DormNamo** · CCC100, Team Gwapo

<sub>All rights reserved unless a license file says otherwise.</sub>

</div>
