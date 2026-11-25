// shared/js/maps/nearby-core.js: nearby-place categories, distance and time text, opening hours, walking routes.
import { test } from "node:test";
import assert from "node:assert/strict";
import Core from "../shared/js/maps/nearby-core.js";

test("formatDistance: meters, rounding, kilometers", () => {
  assert.equal(Core.formatDistance(0), "10 m");
  assert.equal(Core.formatDistance(37), "40 m");
  assert.equal(Core.formatDistance(450), "450 m");
  assert.equal(Core.formatDistance(994), "990 m");
  assert.equal(Core.formatDistance(995), "1 km");
  assert.equal(Core.formatDistance(1234), "1.2 km");
  assert.equal(Core.formatDistance(3000), "3 km");
  assert.equal(Core.formatDistance(12500), "13 km");
  assert.equal(Core.formatDistance(null), "");
  assert.equal(Core.formatDistance(-5), "");
  assert.equal(Core.formatDistance(NaN), "");
});

test("formatDuration: minutes and hours", () => {
  assert.equal(Core.formatDuration(10), "1 min");
  assert.equal(Core.formatDuration(600), "10 min");
  assert.equal(Core.formatDuration(3600), "1 h");
  assert.equal(Core.formatDuration(4500), "1 h 15 min");
  assert.equal(Core.formatDuration(undefined), "");
});

test("travelLabel says whether it is a route or straight line", () => {
  assert.equal(Core.travelLabel({ distance: 450 }), "450 m straight line");
  assert.equal(
    Core.travelLabel({ distance: 450, travel: { mode: "WALK", seconds: 420, meters: 520 } }),
    "7 min walk · 520 m along streets",
  );
  assert.equal(Core.travelLabel({ distance: 2000, travel: { mode: "DRIVE", seconds: 300 } }), "5 min drive");
});

test("haversine: one degree of latitude = pi*R/180, longitude shrinks with cos(lat)", () => {
  const R = 6371008.8,
    deg = (Math.PI * R) / 180; // 111,194.9 m
  assert.ok(Math.abs(Core.haversine({ lat: 8, lng: 124 }, { lat: 9, lng: 124 }) - deg) < 0.01);
  const lng = Core.haversine({ lat: 60, lng: 0 }, { lat: 60, lng: 0.001 });
  assert.ok(Math.abs(lng - deg * 0.001 * 0.5) < 0.01, "got " + lng);
  assert.equal(Core.haversine({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
});

test("category mapping: types to categories", () => {
  assert.equal(Core.categoryForType("convenience_store"), "convenience");
  assert.equal(Core.categoryForType("supermarket"), "grocery");
  assert.equal(Core.categoryForType("farmers_market"), "grocery");
  assert.equal(Core.categoryForType("shopping_mall"), "mall");
  assert.equal(Core.categoryForType("electronics_store"), "retail");
  assert.equal(Core.categoryForType("store"), "retail");
  assert.equal(Core.categoryForType("cafe"), "food");
  assert.equal(Core.categoryForType("bus_station"), "transit");
  assert.equal(Core.categoryForType("pharmacy"), "health");
  assert.equal(Core.categoryForType("zoo"), null);
});

test("categories: required ones present, defaults 1 km, malls 3 km", () => {
  for (const k of ["convenience", "grocery", "mall", "retail"])
    assert.ok(Core.BY_KEY[k] && !Core.BY_KEY[k].optional, k);
  for (const k of ["food", "transit", "health"]) assert.equal(Core.BY_KEY[k].optional, true, k);
  assert.equal(Core.BY_KEY.convenience.radius, 1000);
  assert.equal(Core.BY_KEY.mall.radius, 3000);
  assert.deepEqual(Core.BY_KEY.mall.radiusOptions, [1000, 3000]);
  const all = Core.CATEGORIES.flatMap((c) => c.types.concat(c.extraTypes || []));
  assert.equal(new Set(all).size, all.length, "a type belongs to one category only");
});

test("radiusFor: only allowed radii, else default", () => {
  assert.equal(Core.radiusFor("mall", "1000"), 1000);
  assert.equal(Core.radiusFor("mall", null), 3000);
  assert.equal(Core.radiusFor("convenience", 999999), 1000);
  assert.equal(Core.radiusFor("nope", 1000), null);
});

test("normalizePlace + cleanPlaces: distance, dedupe, closed-for-good removed, sorted", () => {
  const o = { lat: 8.2408, lng: 124.2437 };
  const raw = [
    {
      id: "far",
      displayName: { text: "Far Mart" },
      location: { latitude: 8.245, longitude: 124.2437 },
      rating: 4.1,
      userRatingCount: 9,
      primaryType: "convenience_store",
    },
    {
      id: "near",
      displayName: { text: "Near Mart" },
      shortFormattedAddress: "Tibanga",
      location: { latitude: 8.241, longitude: 124.2437 },
    },
    { id: "near", displayName: { text: "Near Mart" }, location: { latitude: 8.241, longitude: 124.2437 } },
    {
      id: "gone",
      displayName: { text: "Gone" },
      location: { latitude: 8.2409, longitude: 124.2437 },
      businessStatus: "CLOSED_PERMANENTLY",
    },
    { id: "noloc" },
  ];
  const out = Core.cleanPlaces(raw.map((p) => Core.normalizePlace(p, o)));
  assert.deepEqual(
    out.map((p) => p.id),
    ["near", "far"],
  );
  assert.equal(out[0].address, "Tibanga");
  assert.equal(out[0].distance, 22);
  assert.equal(out[1].rating, 4.1);
});

test("summarize and emptyMessage", () => {
  const p = (d) => ({ distance: d });
  assert.equal(
    Core.summarize("convenience", [p(100), p(300), p(480), p(800)], 1000),
    "Convenience store: 3 within 500 m",
  );
  assert.equal(Core.summarize("mall", [p(1200), p(2500)], 3000), "Mall: nearest is 1.2 km away");
  assert.equal(Core.summarize("mall", [], 3000), "Mall: none within 3 km");
  assert.equal(Core.emptyMessage("grocery", 1000), "No supermarkets or markets within 1 km.");
});

test("isOpenAt: normal hours, overnight, 24/7, unknown", () => {
  const ph = 480; // UTC+8
  const at = (iso) => new Date(iso); // UTC instants
  const daily = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    open: { day: d, hour: 8, minute: 0 },
    close: { day: d, hour: 21, minute: 0 },
  }));
  assert.equal(Core.isOpenAt(daily, ph, at("2026-11-23T02:00:00Z")), true); // Mon 10:00 PH
  assert.equal(Core.isOpenAt(daily, ph, at("2026-11-23T14:00:00Z")), false); // Mon 22:00 PH
  const late = [{ open: { day: 6, hour: 20, minute: 0 }, close: { day: 0, hour: 2, minute: 0 } }]; // Sat 8pm -> Sun 2am
  assert.equal(Core.isOpenAt(late, ph, at("2026-11-21T17:00:00Z")), true); // Sun 01:00 PH
  assert.equal(Core.isOpenAt(late, ph, at("2026-11-21T19:00:00Z")), false); // Sun 03:00 PH
  assert.equal(Core.isOpenAt([{ open: { day: 0, hour: 0, minute: 0 } }], ph, new Date()), true);
  assert.equal(Core.isOpenAt(null, ph, new Date()), null);
  assert.equal(Core.isOpenAt(daily, null, new Date()), null);
});

test("directionsUrl: coordinates + place id, else name search", () => {
  assert.equal(
    Core.directionsUrl({ n: "X", lat: 8.1, lng: 124.2, pid: "abc" }),
    "https://www.google.com/maps/dir/?api=1&destination=8.1,124.2&destination_place_id=abc",
  );
  assert.equal(
    Core.directionsUrl({ n: "T&D Dorm", addr: "Purok 17, Iligan" }),
    "https://www.google.com/maps/dir/?api=1&destination=T%26D%20Dorm%2C%20Purok%2017%2C%20Iligan",
  );
});

test("parseLocation: coordinates, plus codes and map links", () => {
  const ref = { lat: 8.2415, lng: 124.244 }; // MSU-IIT
  const B = { lat: 8.241213, lng: 124.245297 }; // Brylle's, from its plus code 66RW+F4M
  const same = (p, q) => p && Math.abs(p.lat - q.lat) < 2e-6 && Math.abs(p.lng - q.lng) < 2e-6;
  assert.ok(same(Core.parseLocation("8.241213, 124.245297", ref), B));
  assert.ok(same(Core.parseLocation("8.241213 124.245297"), B));
  assert.ok(same(Core.parseLocation("(8.241213, 124.245297)"), B));
  assert.ok(same(Core.parseLocation("8.241213° N, 124.245297° E"), B));
  assert.equal(Core.parseLocation("8.241213, 124.245297").from, "coordinates");
  assert.ok(same(Core.parseLocation("66RW+F4M", ref), B), "short plus code near campus");
  assert.ok(same(Core.parseLocation("66RW+F4M Iligan City", ref), B), "short code with a town after it");
  assert.ok(same(Core.parseLocation("6QW666RW+F4M"), B), "full plus code");
  assert.equal(Core.parseLocation("66RW+F4M", ref).from, "plus code");
  assert.equal(Core.parseLocation("66RW+F4M"), null, "short code needs a reference point");
  assert.ok(
    same(Core.parseLocation("https://www.google.com/maps/place/X/@8.241213,124.245297,18z/data=!3m1"), B),
  );
  assert.ok(
    same(
      Core.parseLocation(
        "https://www.google.com/maps/place/X/@8.2,124.2,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d8.241213!4d124.245297",
      ),
      B,
    ),
    "pin (!3d!4d) wins over map centre (@)",
  );
  assert.ok(same(Core.parseLocation("https://www.openstreetmap.org/#map=18/8.241213/124.245297"), B));
  assert.ok(
    same(
      Core.parseLocation("https://www.openstreetmap.org/?mlat=8.241213&mlon=124.245297#map=18/8.24/124.24"),
      B,
    ),
  );
  assert.ok(same(Core.parseLocation("https://maps.google.com/?q=8.241213,124.245297"), B));
  assert.equal(Core.parseLocation("Purok 17, Iligan City"), null);
  assert.equal(Core.parseLocation("95, 400"), null, "out of range");
  assert.equal(Core.parseLocation(""), null);
});

test("walking routes: URL, OSRM parsing, labels", () => {
  const a = { lat: 8.241213, lng: 124.245297 },
    b = { lat: 8.237755, lng: 124.243814 };
  assert.equal(
    Core.routeUrl("https://r/route/v1/foot/", a, b),
    "https://r/route/v1/foot/124.245297,8.241213;124.243814,8.237755?overview=full&geometries=geojson",
  );
  const osrm = {
    code: "Ok",
    routes: [
      {
        distance: 527.4,
        duration: 421.6,
        geometry: {
          coordinates: [
            [124.245297, 8.241213],
            [124.2445, 8.2398],
            [124.243814, 8.237755],
          ],
        },
      },
    ],
  };
  const walk = Core.parseRoute(osrm, true);
  assert.deepEqual(walk.coords[0], a, "lng,lat flipped to {lat,lng}");
  assert.equal(walk.meters, 527);
  assert.equal(walk.seconds, 422);
  assert.equal(walk.estimated, false);
  assert.equal(Core.routeLabel(walk), "7 min walk · 530 m along streets");
  const car = Core.parseRoute(osrm, false);
  assert.equal(car.estimated, true);
  assert.equal(car.seconds, Math.round(527.4 / 1.33), "driving time replaced by walking estimate");
  assert.equal(Core.parseRoute({ code: "NoRoute", routes: [] }, true), null);
  assert.equal(Core.parseRoute(null, true), null);
  assert.equal(
    Core.parseRoute(
      { code: "Ok", routes: [{ distance: 1, duration: 1, geometry: { coordinates: [[1, 1]] } }] },
      true,
    ),
    null,
    "needs 2+ points",
  );
});
