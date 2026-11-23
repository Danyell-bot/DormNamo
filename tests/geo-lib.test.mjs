import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHouses, setGeoFields, needsGeocode, nameMatches } from "../tools/geo-lib.mjs";

const LINE = '    {"id": 3, "n": "T&D Dormitory", "a": "Purok 17", "src": "Google Maps"},';

test("parseHouses finds one-line listings", () => {
  const { houses } = parseHouses(
    "var HOUSES = [\n" +
      LINE +
      "\n" +
      LINE.replace('"id": 3', '"id": 4').replace(/,$/, "") +
      "\n];\nvar X = 1;",
  );
  assert.deepEqual(
    houses.map((x) => [x.line, x.h.id]),
    [
      [1, 3],
      [2, 4],
    ],
  );
});

test("setGeoFields appends, keeps formatting, and is idempotent", () => {
  const f = { lat: 8.24, lng: 124.24, pid: "ChIJ", geo: "places", geoAt: "2026-11-22" };
  const once = setGeoFields(LINE, f);
  assert.equal(
    once,
    '    {"id": 3, "n": "T&D Dormitory", "a": "Purok 17", "src": "Google Maps", "lat": 8.24, "lng": 124.24, "pid": "ChIJ", "geo": "places", "geoAt": "2026-11-22"},',
  );
  assert.equal(setGeoFields(once, f), once);
  const moved = setGeoFields(once, { ...f, lat: 8.25 });
  assert.match(moved, /"lat": 8\.25,/);
  assert.equal(JSON.parse(moved.trim().replace(/,$/, "")).lat, 8.25);
});

test("needsGeocode: missing, stale, fresh, manual, force", () => {
  assert.equal(needsGeocode({}, "2026-11-22"), true);
  assert.equal(needsGeocode({ lat: 1, lng: 1, geoAt: "2026-11-01" }, "2026-11-22"), false);
  assert.equal(needsGeocode({ lat: 1, lng: 1, geoAt: "2026-10-01" }, "2026-11-22"), true);
  assert.equal(needsGeocode({ lat: 1, lng: 1 }, "2026-11-22"), true);
  assert.equal(needsGeocode({ lat: 1, lng: 1, geo: "manual" }, "2026-11-22", 30, true), false);
  assert.equal(needsGeocode({ lat: 1, lng: 1, geoAt: "2026-11-21" }, "2026-11-22", 30, true), true);
});

test("nameMatches ignores generic words", () => {
  assert.equal(nameMatches("Flora's Residence Hall", "Flora Residence Hall"), true);
  assert.equal(nameMatches("JR Boys Boarding House", "JR Boys Boarding House Iligan"), true);
  assert.equal(nameMatches("Saada Ladies Dormitory", "Iligan Medical Center"), false);
});
