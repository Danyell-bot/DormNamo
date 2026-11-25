/* ==========================================================
   geocode.mjs - save exact coordinates for every listing in shared/js/data/data.js
   Usage:  npm run geocode              (only listings that need it)
           npm run geocode -- --dry-run (show what would change)
           npm run geocode -- --force   (redo all, except geo: "manual")
           npm run geocode -- --max-age-days 30
   Needs GOOGLE_MAPS_SERVER_KEY in .env (Places API (New) + Geocoding API).

   1. Places Text Search (New) with "name, address" near MSU-IIT -> exact
      business location + place ID (geo: "places")
   2. if the name doesn't match, Geocoding API on the address
      (geo: "geocode:<location_type>", less exact)
   Idempotent: listings that already have fresh coordinates are skipped.
   To pin a location by hand, set "lat", "lng" and "geo": "manual".
   ========================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseHouses, setGeoFields, needsGeocode, nameMatches } from "./geo-lib.mjs";
import { jsPath } from "./js-files.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = jsPath("data");
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* use the real environment */
}

const args = process.argv.slice(2);
const dry = args.includes("--dry-run"),
  force = args.includes("--force");
const ageIdx = args.indexOf("--max-age-days");
const maxAge = ageIdx >= 0 ? Number(args[ageIdx + 1]) : 30;
const KEY = process.env.GOOGLE_MAPS_SERVER_KEY;
const BIAS = { latitude: 8.2408, longitude: 124.2437 }; // MSU-IIT
const today = new Date().toISOString().slice(0, 10);

if (!KEY) {
  console.error("GOOGLE_MAPS_SERVER_KEY is missing. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
const scrub = (s) => String(s).split(KEY).join("[redacted]");

async function placesLookup(h) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.formattedAddress",
    },
    body: JSON.stringify({
      textQuery: h.n + ", " + (h.addr || h.a),
      maxResultCount: 3,
      regionCode: "PH",
      locationBias: { circle: { center: BIAS, radius: 30000 } },
    }),
  });
  if (!res.ok)
    throw new Error("Places Text Search " + res.status + ": " + scrub((await res.text()).slice(0, 300)));
  const p = ((await res.json()).places || []).find((x) =>
    nameMatches(h.n, x.displayName && x.displayName.text),
  );
  return p
    ? {
        lat: p.location.latitude,
        lng: p.location.longitude,
        pid: p.id,
        geo: "places",
        via: p.displayName.text,
      }
    : null;
}

async function geocode(h) {
  const u =
    "https://maps.googleapis.com/maps/api/geocode/json?region=ph&address=" +
    encodeURIComponent((h.addr || h.a) + ", Philippines") +
    "&key=" +
    encodeURIComponent(KEY);
  const res = await fetch(u);
  const j = await res.json();
  if (j.status !== "OK") {
    if (j.status === "ZERO_RESULTS") return null;
    throw new Error("Geocoding " + j.status + ": " + scrub(j.error_message || ""));
  }
  const r = j.results[0];
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    pid: r.place_id,
    geo: "geocode:" + r.geometry.location_type,
    via: r.formatted_address,
  };
}

const src = fs.readFileSync(DATA, "utf8");
const { lines, eol, houses } = parseHouses(src);
let changed = 0,
  failed = 0;
for (const { line, h } of houses) {
  if (!needsGeocode(h, today, maxAge, force)) {
    console.log(
      "skip   #" + h.id + " " + h.n + " (" + (h.geo || "has coordinates") + ", " + (h.geoAt || "") + ")",
    );
    continue;
  }
  try {
    const g = (await placesLookup(h)) || (await geocode(h));
    if (!g) {
      console.warn("none   #" + h.id + " " + h.n + ': no match, set it by hand with geo: "manual"');
      failed++;
      continue;
    }
    const lat = Math.round(g.lat * 1e6) / 1e6,
      lng = Math.round(g.lng * 1e6) / 1e6;
    console.log(
      (dry ? "would  " : "saved  ") +
        "#" +
        h.id +
        " " +
        h.n +
        " -> " +
        lat +
        "," +
        lng +
        " [" +
        g.geo +
        "] " +
        g.via,
    );
    lines[line] = setGeoFields(lines[line], { lat, lng, pid: g.pid, geo: g.geo, geoAt: today });
    changed++;
  } catch (e) {
    console.error("error  #" + h.id + " " + h.n + ": " + scrub(e.message));
    failed++;
  }
}
if (changed && !dry) fs.writeFileSync(DATA, lines.join(eol));
console.log(
  (dry ? "Dry run: " : "") +
    changed +
    " updated, " +
    failed +
    " failed, " +
    (houses.length - changed - failed) +
    " unchanged.",
);
if (failed) process.exitCode = 1;
