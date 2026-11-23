/* Integration test for the API layer: the real worker handler with Google's endpoints mocked. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../worker/nearby.mjs";
import { memoryStore } from "../worker/cache.mjs";

const KEY = "TEST-KEY-should-never-leak";
const SITE = "https://dorm.example";
const env = (extra = {}) => ({ GOOGLE_MAPS_SERVER_KEY: KEY, ALLOWED_ORIGINS: SITE, ...extra });
const req = (q, origin = SITE) =>
  new Request("https://w.example/nearby?" + q, { headers: origin ? { Origin: origin } : {} });
const LAT = 8.2408,
  LNG = 124.2437;

function place(id, dLat, extra = {}) {
  return {
    id,
    displayName: { text: id },
    formattedAddress: id + " St",
    location: { latitude: LAT + dLat, longitude: LNG },
    rating: 4.5,
    userRatingCount: 10,
    regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] },
    utcOffsetMinutes: 480,
    ...extra,
  };
}

/** Fake Google: answers Nearby Search per includedTypes, and Route Matrix. Records every call. */
function fakeGoogle(opts = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    if (url.includes("computeRouteMatrix")) {
      if (opts.routesStatus)
        return new Response(JSON.stringify({ error: { message: "nope" } }), { status: opts.routesStatus });
      return Response.json(
        body.destinations.map((d, i) => ({
          originIndex: 0,
          destinationIndex: i,
          duration: 60 * (i + 1) + "s",
          distanceMeters: 100 * (i + 1),
          condition: "ROUTE_EXISTS",
        })),
      );
    }
    const types = body.includedTypes;
    if (opts.rejectExtra && types.includes("farmers_market"))
      return new Response(JSON.stringify({ error: { message: "Unsupported types: farmers_market." } }), {
        status: 400,
      });
    if (opts.fail && opts.fail(types))
      return new Response(JSON.stringify({ error: { message: "API key " + KEY + " is not authorized" } }), {
        status: 403,
      });
    if (types.includes("convenience_store"))
      return Response.json({
        places: [
          place("c-far", 0.004),
          place("c-near", 0.001),
          place("c-dead", 0.0005, { businessStatus: "CLOSED_PERMANENTLY" }),
        ],
      });
    return Response.json({}); // nothing nearby
  };
  return { fetch, calls };
}

test("returns normalized, sorted places per category with live open status", async () => {
  const g = fakeGoogle();
  const res = await createHandler({ fetch: g.fetch, store: memoryStore() })(
    req(`lat=${LAT}&lng=${LNG}`),
    env(),
  );
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), SITE);
  const d = await res.json();
  assert.equal(d.cached, false);
  assert.deepEqual(
    d.categories.convenience.places.map((p) => p.id),
    ["c-near", "c-far"],
  );
  const p = d.categories.convenience.places[0];
  assert.equal(p.open, true);
  assert.equal(p.hours, undefined, "raw hours are not sent to the browser");
  assert.ok(p.distance > 100 && p.distance < 120, "distance " + p.distance);
  assert.deepEqual(d.categories.grocery.places, []);
  assert.equal(d.categories.mall.radius, 3000);
  assert.equal(d.categories.convenience.radius, 1000);
  // request shape sent to Google
  const conv = g.calls.find((c) => c.body.includedTypes.includes("convenience_store"));
  assert.equal(conv.headers["X-Goog-Api-Key"], KEY);
  assert.match(conv.headers["X-Goog-FieldMask"], /places\.location/);
  assert.equal(conv.body.rankPreference, "DISTANCE");
  assert.equal(conv.body.locationRestriction.circle.radius, 1000);
});

test("second request is served from cache (no new Google calls)", async () => {
  const g = fakeGoogle(),
    store = memoryStore();
  const h = createHandler({ fetch: g.fetch, store });
  await h(req(`lat=${LAT}&lng=${LNG}`), env());
  const n = g.calls.length;
  const again = await (await h(req(`lat=${LAT + 0.00001}&lng=${LNG}`), env())).json();
  assert.equal(g.calls.length, n);
  assert.equal(again.cached, true);
  assert.equal(again.categories.convenience.places.length, 2);
});

test("cache expires after CACHE_TTL_SECONDS", async () => {
  let t = 0;
  const g = fakeGoogle(),
    h = createHandler({ fetch: g.fetch, store: memoryStore(), now: () => t });
  await h(req(`lat=${LAT}&lng=${LNG}&cats=convenience`), env({ CACHE_TTL_SECONDS: "3600" }));
  t = 3600 * 1000;
  await h(req(`lat=${LAT}&lng=${LNG}&cats=convenience`), env({ CACHE_TTL_SECONDS: "3600" }));
  assert.equal(g.calls.length, 2);
});

test("unsupported extra types are retried with the core types only", async () => {
  const g = fakeGoogle({ rejectExtra: true });
  const d = await (
    await createHandler({ fetch: g.fetch, store: memoryStore() })(
      req(`lat=${LAT}&lng=${LNG}&cats=grocery`),
      env(),
    )
  ).json();
  assert.equal(d.categories.grocery.error, undefined);
  assert.deepEqual(
    g.calls.map((c) => c.body.includedTypes),
    [
      ["supermarket", "grocery_store", "market", "farmers_market"],
      ["supermarket", "grocery_store"],
    ],
  );
});

test("one failing category doesn't break the others, and the key never leaks", async () => {
  const g = fakeGoogle({ fail: (t) => t.includes("shopping_mall") });
  const res = await createHandler({ fetch: g.fetch, store: memoryStore() })(
    req(`lat=${LAT}&lng=${LNG}`),
    env(),
  );
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.ok(!text.includes(KEY), "key leaked into response");
  const d = JSON.parse(text);
  assert.match(d.categories.mall.error, /refused/);
  assert.equal(d.categories.convenience.places.length, 2);
});

test("all categories failing -> 502 with a message", async () => {
  const g = fakeGoogle({ fail: () => true });
  const res = await createHandler({ fetch: g.fetch, store: memoryStore() })(
    req(`lat=${LAT}&lng=${LNG}`),
    env(),
  );
  assert.equal(res.status, 502);
  assert.ok(!(await res.text()).includes(KEY));
});

test("Routes API adds labeled walking times to the top places", async () => {
  const g = fakeGoogle();
  const d = await (
    await createHandler({ fetch: g.fetch, store: memoryStore() })(
      req(`lat=${LAT}&lng=${LNG}&cats=convenience`),
      env({ ROUTES_MODE: "walk" }),
    )
  ).json();
  assert.equal(d.travelMode, "WALK");
  assert.deepEqual(d.categories.convenience.places[0].travel, { mode: "WALK", seconds: 60, meters: 100 });
  const r = g.calls.find((c) => c.url.includes("computeRouteMatrix"));
  assert.equal(r.body.travelMode, "WALK");
  assert.equal(r.body.destinations.length, 2);
});

test("Routes API failure falls back to straight-line distances", async () => {
  const g = fakeGoogle({ routesStatus: 403 });
  const d = await (
    await createHandler({ fetch: g.fetch, store: memoryStore() })(
      req(`lat=${LAT}&lng=${LNG}&cats=convenience`),
      env({ ROUTES_MODE: "WALK" }),
    )
  ).json();
  assert.equal(d.travelMode, null);
  assert.ok(d.routesError);
  assert.equal(d.categories.convenience.places[0].travel, undefined);
});

test("guards: missing key, bad input, outside area, wrong origin, radius clamp", async () => {
  const g = fakeGoogle(),
    h = createHandler({ fetch: g.fetch, store: memoryStore() });
  assert.equal((await h(req(`lat=${LAT}&lng=${LNG}`), { ALLOWED_ORIGINS: SITE })).status, 500);
  assert.equal(
    (await (await h(req(`lat=${LAT}&lng=${LNG}`), { ALLOWED_ORIGINS: SITE })).json()).error,
    "server_key_missing",
  );
  assert.equal((await h(req(`lat=abc&lng=${LNG}`), env())).status, 400);
  assert.equal(
    (await h(req(`lat=14.5995&lng=120.9842`), env())).status,
    400,
    "Manila is outside the default area",
  );
  assert.equal((await h(req(`lat=${LAT}&lng=${LNG}`, "https://evil.example"), env())).status, 403);
  assert.equal((await h(new Request("https://w.example/nope"), env())).status, 404);
  assert.equal(g.calls.length, 0, "no Google calls for rejected requests");
  await h(req(`lat=${LAT}&lng=${LNG}&cats=mall&r_mall=1000`), env());
  await h(req(`lat=${LAT}&lng=${LNG}&cats=convenience&r_convenience=99999`), env());
  assert.deepEqual(
    g.calls.map((c) => c.body.locationRestriction.circle.radius),
    [1000, 1000],
  );
});
