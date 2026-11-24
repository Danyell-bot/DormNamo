// Owner plan limits (listings.js): Basic covers 2 places per account, Owner Pro covers 5.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import { jsPath } from "../tools/js-files.mjs";

function browser() {
  const store = new Map();
  const ctx = {
    console,
    Math,
    JSON,
    Date,
    crypto: webcrypto,
    Uint8Array,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["data", "utils", "photos", "listings"])
    vm.runInContext(fs.readFileSync(jsPath(f), "utf8"), ctx, { filename: f + ".js" });
  const run = (code) => vm.runInContext(code, ctx);
  run('USER = { id: "uLola", name: "Lola" };');
  let n = 0;
  const add = (plan) =>
    run(
      `Listings.save({ id: ${++n}, n: "Place ${n}", a: "Tibanga", t: "Boarding house", p: 2500, plan: "${plan}" })`,
    );
  return { run, add };
}

test("Basic: 2 places free, the third is refused with the reason", () => {
  const b = browser();
  assert.ok(b.add("basic").rec);
  assert.ok(b.add("b30").rec, "a boost is still a Basic account");
  const third = b.add("basic");
  assert.equal(third.error, "limit");
  assert.equal(third.max, 2);
  assert.equal(third.pro, false);
  assert.equal(b.run("Listings.mine().length"), 2);
});

test("Owner Pro lifts the limit to 5, and editing an existing place is never blocked", () => {
  const b = browser();
  b.add("basic");
  b.add("basic");
  assert.ok(b.add("pro-y").rec, "adding with Owner Pro is allowed");
  assert.ok(b.add("basic").rec);
  assert.ok(b.add("basic").rec);
  assert.equal(b.add("basic").error, "limit");
  assert.deepEqual(JSON.parse(b.run("JSON.stringify(Listings.quota())")), { used: 5, max: 5, pro: true });
  // updating place 1 (already saved) still works at the limit
  assert.ok(b.run('Listings.save(Object.assign(Listings.get(1), { n: "Renamed" })).rec'));
});

test("bot listings are not counted against people", () => {
  const b = browser();
  b.add("basic");
  b.add("basic");
  assert.ok(
    b.run('Listings.save({ id: 990001, uid: "bot-landowner", n: "Test", a: "Tibanga", plan: "basic" }).rec'),
  );
});
