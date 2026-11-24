/* ==========================================================
   nearby.mjs - Cloudflare Worker that proxies Google Places API (New)
   (and optionally the Routes API) so the server key never reaches the
   browser. The site is static (GitHub Pages), so this is its only backend.

   GET /nearby?lat=8.24&lng=124.24[&cats=convenience,mall][&r_mall=1000]
     -> { origin, travelMode, fetchedAt, expiresAt, cached, categories: {key: {radius, places[], error?}} }

   Env (wrangler.toml [vars] / `wrangler secret put`):
     GOOGLE_MAPS_SERVER_KEY  secret. Places API (New) (+ Routes API if ROUTES_MODE is on)
     ALLOWED_ORIGINS         comma list of site origins, e.g. "https://you.github.io,http://localhost:5500"
     ALLOWED_AREA            "lat,lng,km" circle where lookups are allowed (cost guard)
     CACHE_TTL_SECONDS       default 86400 (24 h), clamped to 60 s .. 30 days
     NEARBY_CATEGORIES       comma list of category keys (default: all in js/maps/nearby-core.js)
     ROUTES_MODE             off (default) | WALK | DRIVE: travel times for the top 5 per category
   POST /namo (Namo replies worded by Google Gemini, free tier) lives in namo.mjs; see its header for GEMINI_API_KEY etc.
   Binding: NEARBY_CACHE (KV namespace). Without it an in-memory cache is used (per isolate).
   ========================================================== */
import Core from "../js/maps/nearby-core.js";
import { makeCache, memoryStore, cacheKey, clampTtl, ERROR_TTL_S } from "./cache.mjs";
import { handleNamo } from "./namo.mjs";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby";
const ROUTES_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "shortFormattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "primaryType",
  "types",
  "googleMapsUri",
  "regularOpeningHours.periods",
  "utcOffsetMinutes",
  "businessStatus",
]
  .map((f) => "places." + f)
  .join(",");
const DEFAULT_AREA = "8.2408,124.2437,100"; // around MSU-IIT, Iligan City; covers Cagayan de Oro

const fallbackStore = memoryStore();
const rejectedExtras = {}; // category key -> Google said an extraType is unsupported

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || "google_error";
  }
}

/** Remove the key from any text before it can reach a response or a log. */
function scrub(text, key) {
  return key ? String(text).split(key).join("[redacted]") : String(text);
}

function friendly(status, googleMessage, key) {
  const m = scrub(googleMessage || "", key);
  if (status === 403)
    return new ApiError(
      403,
      "Google refused the request. Check that the API is enabled and the server key's API restrictions allow it. " +
        m,
      "forbidden",
    );
  if (status === 400 && /api key/i.test(m))
    return new ApiError(400, "The server API key is invalid.", "bad_key");
  if (status === 429) return new ApiError(429, "Google API quota exceeded. Try again later.", "quota");
  return new ApiError(status || 502, "Google API error" + (m ? ": " + m : "."), "google_error");
}

async function googleError(res, key) {
  let msg = "";
  try {
    const j = await res.json();
    msg = (j && j.error && j.error.message) || "";
  } catch {
    /* not JSON */
  }
  return friendly(res.status, msg, key);
}

/** One Nearby Search (New) call per category, closest first. Unknown extra types are retried without. */
export async function searchCategory(cat, origin, radius, key, fetchFn) {
  const call = (types) =>
    fetchFn(PLACES_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({
        includedTypes: types,
        maxResultCount: 20,
        rankPreference: "DISTANCE",
        locationRestriction: { circle: { center: { latitude: origin.lat, longitude: origin.lng }, radius } },
      }),
    });
  const extras = rejectedExtras[cat.key] ? [] : cat.extraTypes || [];
  let res = await call(cat.types.concat(extras));
  if (res.status === 400 && extras.length) {
    res = await call(cat.types);
    if (res.ok) rejectedExtras[cat.key] = true; // don't pay for the failed call again in this isolate
  }
  if (!res.ok) throw await googleError(res, key);
  const data = await res.json();
  return Core.cleanPlaces((data.places || []).map((p) => Core.normalizePlace(p, origin)));
}

/** Walking/driving time from the dorm to the top places (Routes API, Compute Route Matrix). */
export async function addTravelTimes(result, origin, mode, key, fetchFn) {
  const dests = [],
    seen = {};
  Object.values(result).forEach((c) =>
    (c.places || []).slice(0, Core.TOP_N).forEach((p) => {
      if (!seen[p.id]) {
        seen[p.id] = 1;
        dests.push(p);
      }
    }),
  );
  if (!dests.length) return;
  const res = await fetchFn(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
    },
    body: JSON.stringify({
      origins: [{ waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } }],
      destinations: dests.map((p) => ({
        waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } },
      })),
      travelMode: mode,
    }),
  });
  if (!res.ok) throw await googleError(res, key);
  const rows = await res.json();
  const byId = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (r.condition !== "ROUTE_EXISTS" || !r.duration) return;
    const p = dests[r.destinationIndex];
    if (!p) return;
    byId[p.id] = {
      mode,
      seconds: parseInt(r.duration, 10),
      meters: r.distanceMeters == null ? null : r.distanceMeters,
    };
  });
  Object.values(result).forEach((c) =>
    (c.places || []).forEach((p) => {
      if (byId[p.id]) p.travel = byId[p.id];
    }),
  );
}

/** Add live open/closed status from cached hours, and drop fields the browser doesn't need. */
export function present(entry, now) {
  const out = JSON.parse(JSON.stringify(entry));
  Object.values(out.categories).forEach((c) =>
    (c.places || []).forEach((p) => {
      p.open = Core.isOpenAt(p.hours, p.utcOffset, now);
      delete p.hours;
      delete p.utcOffset;
      delete p.status;
    }),
  );
  return out;
}

function parseArea(s) {
  const [lat, lng, km] = String(s || DEFAULT_AREA)
    .split(",")
    .map(Number);
  return [lat, lng, km].every(Number.isFinite) ? { lat, lng, km } : null;
}

function corsHeaders(origin, allowed) {
  const h = { Vary: "Origin" };
  if (origin && (allowed.includes("*") || allowed.includes(origin))) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    h["Access-Control-Allow-Headers"] = "Content-Type";
    h["Access-Control-Max-Age"] = "86400";
  }
  return h;
}

/** Build the request handler. Dependencies are injectable for tests. */
export function createHandler(deps = {}) {
  const fetchFn = deps.fetch || ((...a) => fetch(...a));
  const now = deps.now || (() => Date.now());

  return async function handle(request, env = {}) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const allowed = String(env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const cors = corsHeaders(origin, allowed);
    const json = (status, body, extra = {}) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", ...cors, ...extra },
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (origin && !cors["Access-Control-Allow-Origin"])
      return json(403, { error: "origin_not_allowed", message: "This site is not in ALLOWED_ORIGINS." });
    // Namo replies worded by Gemini (worker/namo.mjs). A browser request must come from an allowed site.
    if (url.pathname.replace(/\/+$/, "") === "/namo")
      return handleNamo(request, env, {
        fetchFn,
        now,
        json,
        originOk: allowed.includes("*") || !!(origin && cors["Access-Control-Allow-Origin"]),
      });
    if (request.method !== "GET") return json(405, { error: "method_not_allowed" });
    if (url.pathname.replace(/\/+$/, "") !== "/nearby")
      return json(404, { error: "not_found", message: "Use GET /nearby?lat=..&lng=.." });

    const key = env.GOOGLE_MAPS_SERVER_KEY;
    if (!key)
      return json(500, {
        error: "server_key_missing",
        message: "GOOGLE_MAPS_SERVER_KEY is not set on the worker.",
      });

    const lat = Number(url.searchParams.get("lat")),
      lng = Number(url.searchParams.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      return json(400, { error: "bad_coordinates", message: "lat and lng are required numbers." });
    const area = parseArea(env.ALLOWED_AREA);
    if (area && Core.haversine({ lat, lng }, area) > area.km * 1000)
      return json(400, {
        error: "outside_area",
        message: "This location is outside the area the site serves.",
      });

    const enabled = String(env.NEARBY_CATEGORIES || Core.CATEGORIES.map((c) => c.key).join(","))
      .split(",")
      .map((s) => s.trim())
      .filter((k) => Core.BY_KEY[k]);
    const asked = url.searchParams.get("cats");
    const cats = asked ? asked.split(",").filter((k) => enabled.includes(k)) : enabled;
    if (!cats.length) return json(400, { error: "no_categories" });
    const radii = {};
    cats.forEach((k) => {
      radii[k] = Core.radiusFor(k, url.searchParams.get("r_" + k));
    });
    const mode = /^(WALK|DRIVE)$/i.test(env.ROUTES_MODE || "") ? env.ROUTES_MODE.toUpperCase() : null;

    const origin4 = { lat: Number(lat.toFixed(4)), lng: Number(lng.toFixed(4)) };
    const cache = makeCache(deps.store || env.NEARBY_CACHE || fallbackStore, now);
    const ck = cacheKey({ lat, lng, radii, routes: mode, categories: cats });
    const hit = await cache.get(ck);
    if (hit)
      return json(
        200,
        {
          ...present(hit.value, new Date(now())),
          cached: true,
          expiresAt: new Date(hit.expiresAt).toISOString(),
        },
        { "Cache-Control": "public, max-age=3600" },
      );

    const categories = {};
    await Promise.all(
      cats.map(async (k) => {
        try {
          categories[k] = {
            radius: radii[k],
            places: await searchCategory(Core.BY_KEY[k], origin4, radii[k], key, fetchFn),
          };
        } catch (e) {
          categories[k] = {
            radius: radii[k],
            places: [],
            error: e instanceof ApiError ? e.message : "Could not reach Google.",
          };
        }
      }),
    );
    const failed = cats.filter((k) => categories[k].error);
    if (failed.length === cats.length)
      return json(502, { error: "google_unavailable", message: categories[cats[0]].error });

    let routesError = null;
    if (mode) {
      try {
        await addTravelTimes(categories, origin4, mode, key, fetchFn);
      } catch (e) {
        routesError = e instanceof ApiError ? e.message : "Routes API unavailable.";
      }
    }

    const ttl = failed.length || routesError ? ERROR_TTL_S : clampTtl(env.CACHE_TTL_SECONDS);
    const entry = {
      origin: origin4,
      travelMode: mode && !routesError ? mode : null,
      routesError,
      fetchedAt: new Date(now()).toISOString(),
      categories,
    };
    await cache.set(ck, entry, ttl);
    return json(
      200,
      {
        ...present(entry, new Date(now())),
        cached: false,
        expiresAt: new Date(now() + ttl * 1000).toISOString(),
      },
      { "Cache-Control": "public, max-age=" + Math.min(3600, ttl) },
    );
  };
}

const handle = createHandler();
export default { fetch: (request, env) => handle(request, env) };
