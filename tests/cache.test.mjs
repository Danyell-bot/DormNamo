import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCache, memoryStore, cacheKey, clampTtl, DEFAULT_TTL_S, MAX_TTL_S } from "../worker/cache.mjs";

test("clampTtl: default 24 h, never above 30 days, never below 60 s", () => {
  assert.equal(DEFAULT_TTL_S, 86400);
  assert.equal(clampTtl(undefined), 86400);
  assert.equal(clampTtl("abc"), 86400);
  assert.equal(clampTtl(0), 86400);
  assert.equal(clampTtl(10), 60);
  assert.equal(clampTtl(90000), 90000);
  assert.equal(clampTtl(99999999), MAX_TTL_S);
});

test("entries expire after their TTL", async () => {
  let t = 1_000_000;
  const c = makeCache(memoryStore(), () => t);
  await c.set("k", { a: 1 }, 86400);
  assert.deepEqual((await c.get("k")).value, { a: 1 });
  t += 86399 * 1000;
  assert.ok(await c.get("k"), "still fresh 1 s before expiry");
  t += 1000;
  assert.equal(await c.get("k"), null, "expired exactly at TTL");
});

test("KV-style store gets expirationTtl and a JSON string", async () => {
  const calls = [];
  const kv = {
    async get() {
      return null;
    },
    async put(k, v, o) {
      calls.push([k, v, o]);
    },
  };
  await makeCache(kv, () => 0).set("k", { x: 1 }, 100);
  assert.equal(calls[0][2].expirationTtl, 100);
  assert.deepEqual(JSON.parse(calls[0][1]), { v: { x: 1 }, exp: 100000, at: 0 });
});

test("broken or failing stores read as a miss instead of throwing", async () => {
  assert.equal(
    await makeCache({
      async get() {
        return "{not json";
      },
    }).get("k"),
    null,
  );
  assert.equal(
    await makeCache({
      async get() {
        throw new Error("down");
      },
    }).get("k"),
    null,
  );
  await makeCache({
    async put() {
      throw new Error("down");
    },
  }).set("k", 1, 100); // no throw
});

test("cacheKey: rounds coordinates, order-independent radii, varies by options", () => {
  const a = cacheKey({
    lat: 8.240812,
    lng: 124.243711,
    radii: { mall: 3000, convenience: 1000 },
    routes: null,
    categories: ["convenience", "mall"],
  });
  const b = cacheKey({
    lat: 8.240849,
    lng: 124.243749,
    radii: { convenience: 1000, mall: 3000 },
    routes: null,
    categories: ["convenience", "mall"],
  });
  assert.equal(a, b);
  assert.notEqual(
    a,
    cacheKey({
      lat: 8.240812,
      lng: 124.243711,
      radii: { mall: 1000, convenience: 1000 },
      categories: ["convenience", "mall"],
    }),
  );
  assert.notEqual(
    a,
    cacheKey({
      lat: 8.240812,
      lng: 124.243711,
      radii: { mall: 3000, convenience: 1000 },
      routes: "WALK",
      categories: ["convenience", "mall"],
    }),
  );
});
