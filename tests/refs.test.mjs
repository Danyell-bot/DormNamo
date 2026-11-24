// Reference numbers (UUID v4 on every listing) and the cover / room photo split.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import { jsPath } from "../tools/js-files.mjs";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function browser({ crypto = webcrypto, listings } = {}) {
  const store = new Map(listings ? [["dormnamo:listings", JSON.stringify(listings)]] : []);
  const ctx = {
    console,
    Math,
    JSON,
    Date,
    crypto,
    Uint8Array,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      key: (i) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
    document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["data", "utils", "photos", "listings"])
    vm.runInContext(fs.readFileSync(jsPath(f), "utf8"), ctx, { filename: f + ".js" });
  return { ctx, store, run: (code) => vm.runInContext(code, ctx) };
}

test("every listing in data.js has its own UUID v4 reference number", () => {
  const b = browser();
  const refs = b.run("HOUSES.map(function (h) { return h.ref; })");
  assert.ok(refs.length > 0);
  refs.forEach((r) => assert.match(r, V4));
  assert.equal(new Set(refs).size, refs.length, "no two listings share a reference number");
  assert.equal(b.run("refShort(HOUSES[0])"), "DN-" + refs[0].slice(0, 8).toUpperCase());
});

test("uuid() makes valid v4 ids, also in browsers without crypto.randomUUID", () => {
  const withApi = browser();
  const noApi = browser({ crypto: { getRandomValues: (a) => webcrypto.getRandomValues(a) } });
  for (const b of [withApi, noApi]) {
    const ids = b.run("Array.from({ length: 200 }, uuid)");
    ids.forEach((id) => assert.match(id, V4));
    assert.equal(new Set(ids).size, 200);
  }
});

test("owner listings get a reference number when saved, and old ones get one once", () => {
  const old = {
    id: 99,
    n: "Old Place",
    a: "Tibanga",
    s: "MSU-IIT",
    d: 0.4,
    t: "Dormitory",
    am: [],
    uid: "u1",
  };
  const b = browser({ listings: [old] });
  const ref = JSON.parse(b.store.get("dormnamo:listings"))[0].ref;
  assert.match(ref, V4, "added at load and saved");
  assert.equal(b.run("HOUSES.filter(function (h) { return h.id === 99; })[0].ref"), ref);
  // it never changes afterwards
  b.run("Listings.save(Listings.get(99)); Listings.apply();");
  assert.equal(JSON.parse(b.store.get("dormnamo:listings"))[0].ref, ref);
  // a new listing gets its own
  const fresh = b.run(
    'Listings.save({ n: "New", a: "Pala-o", s: "MSU-IIT", d: 1, t: "Apartment", am: [] }).rec.ref',
  );
  assert.match(fresh, V4);
  assert.notEqual(fresh, ref);
});

test("cover and room photos are kept apart", () => {
  const b = browser();
  b.run(`
    PHOTOS.dorm[1] = [{ src: "a.jpg", kind: "room" }, { src: "c.jpg", kind: "cover" }, { src: "b.jpg", kind: "room" }];
    PHOTOS.dorm[2] = [{ src: "x.jpg" }, { src: "y.jpg" }];
    PHOTOS.dorm[3] = [{ src: "r.jpg", kind: "room" }];`);
  const s1 = b.run("Photos.split(HOUSES.filter(function (h) { return h.id === 1; })[0])");
  assert.equal(s1.cover.src, "c.jpg");
  assert.deepEqual([...s1.rooms.map((p) => p.src)], ["a.jpg", "b.jpg"]);
  // without kinds: the first photo is the cover, the rest are room photos
  const s2 = b.run("Photos.split(HOUSES.filter(function (h) { return h.id === 2; })[0])");
  assert.equal(s2.cover.src, "x.jpg");
  assert.deepEqual([...s2.rooms.map((p) => p.src)], ["y.jpg"]);
  // the dialog header shows only the cover; with no cover, the first room photo
  assert.deepEqual(
    [
      ...b.run(
        "Photos.forHouse(HOUSES.filter(function (h) { return h.id === 1; })[0]).list.map(function (p) { return p.src; })",
      ),
    ],
    ["c.jpg"],
  );
  assert.equal(
    b.run("Photos.forHouse(HOUSES.filter(function (h) { return h.id === 3; })[0]).list[0].src"),
    "r.jpg",
  );
  // owner records: cover and room photos are tagged when merged
  b.run(
    'Listings.save({ id: 5, n: "Tagged", a: "Tibanga", s: "MSU-IIT", d: 0.2, t: "Dormitory", am: [], cover: "data:c", photos: ["data:1", "data:2"] });',
  );
  const s5 = b.run("Photos.split(HOUSES.filter(function (h) { return h.id === 5; })[0])");
  assert.equal(s5.cover.src, "data:c");
  assert.equal(s5.rooms.length, 2);
});
