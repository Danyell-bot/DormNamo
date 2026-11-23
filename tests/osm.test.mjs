import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import Core from "../js/nearby-core.js";

const O = { lat: 8.241213, lng: 124.245297 };

test("osmCategory maps OSM tags to our categories", () => {
  assert.equal(Core.osmCategory({ shop: "convenience" }), "convenience");
  assert.equal(Core.osmCategory({ shop: "general" }), "convenience"); // sari-sari stores
  assert.equal(Core.osmCategory({ amenity: "marketplace" }), "grocery");
  assert.equal(Core.osmCategory({ shop: "mall" }), "mall");
  assert.equal(Core.osmCategory({ shop: "department_store" }), "retail");
  assert.equal(Core.osmCategory({ amenity: "fast_food" }), "food");
  assert.equal(Core.osmCategory({ highway: "bus_stop" }), "transit");
  assert.equal(Core.osmCategory({ amenity: "pharmacy" }), "health");
  assert.equal(Core.osmCategory({ shop: "convenience_store" }), null, "whole values only");
  assert.equal(Core.osmCategory({ building: "yes" }), null);
  assert.equal(Core.osmCategory(undefined), null);
});

test("osmQuery covers every category with its own radius", () => {
  const q = Core.osmQuery(O, { mall: 1000 });
  assert.match(q, /^\[out:json\]/);
  assert.match(q, /nwr\(around:1000,8\.241213,124\.245297\)\["shop"~"\^\(mall\)\$"\]/);
  assert.match(q, /nwr\(around:1000,8\.241213,124\.245297\)\["shop"~"\^\(convenience\|general\|kiosk\)\$"\]/);
  assert.match(Core.osmQuery(O), /around:3000,[^)]+\)\["shop"~"\^\(mall\)\$"\]/);
  assert.match(q, /out center tags;$/);
});

test("osmResult: nodes and ways, names, radius filter, sorted", () => {
  const els = [
    {
      type: "node",
      id: 1,
      lat: 8.243,
      lon: 124.2453,
      tags: { shop: "convenience", name: "7-Eleven", "addr:street": "Tibanga Hwy" },
    },
    { type: "node", id: 2, lat: 8.2414, lon: 124.2453, tags: { shop: "general" } },
    {
      type: "way",
      id: 3,
      center: { lat: 8.2412, lon: 124.26 },
      tags: { shop: "convenience", name: "Too far" },
    },
    { type: "way", id: 4, center: { lat: 8.23, lon: 124.24 }, tags: { shop: "mall", name: "Gaisano" } },
    {
      type: "node",
      id: 5,
      lat: 8.2413,
      lon: 124.2453,
      tags: { amenity: "pharmacy", opening_hours: "24/7", name: "Mercury" },
    },
    { type: "node", id: 6, tags: { shop: "convenience" } },
  ];
  const r = Core.osmResult(els, O, { mall: 3000 });
  assert.equal(r.source, "osm");
  assert.deepEqual(
    r.categories.convenience.places.map((p) => p.name),
    ["Unnamed convenience store", "7-Eleven"],
  );
  assert.equal(r.categories.convenience.places[1].address, "Tibanga Hwy");
  assert.equal(r.categories.convenience.places[1].mapsUri, "https://www.openstreetmap.org/node/1");
  assert.equal(r.categories.mall.places[0].name, "Gaisano");
  assert.equal(r.categories.mall.radius, 3000);
  assert.equal(r.categories.health.places[0].open, true);
  assert.deepEqual(r.categories.grocery.places, []);
});

test("pins.js entries are valid and land on the right listings", () => {
  const ctx = { localStorage: { getItem: () => null } };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ["data", "utils", "pins", "nearby-core", "maps"])
    vm.runInContext(fs.readFileSync(`js/${f}.js`, "utf8"), ctx, { filename: f });
  const pinned = vm.runInContext("HOUSES.filter(function (h) { return h.lat != null; })", ctx);
  const pins = vm.runInContext("PINS", ctx);
  assert.equal(pinned.length, Object.keys(pins).length);
  for (const h of pinned) {
    assert.equal(h.geo, "manual");
    // every pin must be within ~1 km of what the listing says its campus distance is (catches swapped/typo'd coordinates)
    const d = Core.haversine({ lat: 8.2415, lng: 124.244 }, h) / 1000;
    assert.ok(Math.abs(d - h.d) < 1, `${h.n}: pin is ${d.toFixed(2)} km from campus, listing says ${h.d} km`);
  }
});

test("draft pins from pin.html override the file, and null removes a pin", () => {
  const drafts = { 7: null, 1: { lat: 8.242, lng: 124.2445 } };
  const ctx = { localStorage: { getItem: (k) => (k === "dn:pinDrafts" ? JSON.stringify(drafts) : null) } };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ["data", "utils", "pins", "nearby-core", "maps"])
    vm.runInContext(fs.readFileSync(`js/${f}.js`, "utf8"), ctx, { filename: f });
  const house = (id) => vm.runInContext(`HOUSES.filter(function (h) { return h.id === ${id}; })[0]`, ctx);
  const h1 = house(1),
    h7 = house(7);
  assert.equal(h1.lat, 8.242);
  assert.equal(h1.pinDraft, true);
  assert.equal(h7.lat, undefined);
});

test("pinned dorm with a snapshot gets nearby places instantly, without any network call", async () => {
  const ctx = {
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: () => {
      throw new Error("network used");
    },
  };
  ctx.window = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of ["data", "utils", "pins", "nearby-snapshot", "nearby-core", "maps"])
    vm.runInContext(fs.readFileSync(`js/${f}.js`, "utf8"), ctx, { filename: f });
  const h = vm.runInContext("HOUSES.filter(function (h) { return h.id === 7; })[0]", ctx);
  const d = await vm.runInContext("DNMaps", ctx).nearby(h);
  assert.equal(d.source, "osm");
  assert.ok(d.snapshot, "came from the snapshot");
  assert.equal(d.categories.mall.radius, 3000);
  for (const k of Object.keys(d.categories)) {
    const c = d.categories[k];
    assert.ok(
      c.places.every((p, i, a) => p.distance <= c.radius && (i === 0 || a[i - 1].distance <= p.distance)),
      k + " sorted and within radius",
    );
  }
  assert.ok(d.categories.convenience.places.length > 0, "found convenience stores near Brylle's");
});

test("placeName: real names kept, unnamed places say what they are", () => {
  assert.equal(Core.placeName({ name: "7-Eleven", type: "convenience" }), "7-Eleven");
  assert.equal(
    Core.placeName({ name: "Unnamed supermarket / market", type: "supermarket" }),
    "Unnamed supermarket",
  );
  assert.equal(
    Core.placeName({ name: "Unnamed supermarket / market", type: "marketplace" }),
    "Unnamed market",
  );
  assert.equal(
    Core.placeName({ name: "Unnamed restaurant / café", type: "fast_food" }),
    "Unnamed fast food place",
  );
  assert.equal(Core.placeName({ name: "Unnamed store", type: "hardware" }), "Unnamed hardware store");
  assert.equal(Core.placeName({ name: "Unnamed restaurant / café", type: "cafe" }), "Unnamed café");
  assert.equal(Core.placeName({ name: "Unnamed mall" }), "Unnamed mall");
});
