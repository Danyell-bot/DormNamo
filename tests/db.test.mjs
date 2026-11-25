// shared/js/app/db.js: the Supabase connection stays off without config, and maps backend errors.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { jsPath } from "../tools/js-files.mjs";

function load(config, supabase) {
  const head = { appendChild() {} };
  const window = { DN_CONFIG: config, supabase };
  const ctx = { window, document: { head, createElement: () => ({}) }, Promise };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(jsPath("db"), "utf8"), ctx);
  return ctx.DB;
}
const GOOD = { supabaseUrl: "https://abcdefgh.supabase.co/", supabaseKey: "x".repeat(40) };

test("off without config, or with a URL that isn't a Supabase project", async () => {
  assert.equal(load(undefined).enabled(), false);
  assert.equal(
    load({ supabaseUrl: "https://evil.example.com", supabaseKey: "x".repeat(40) }).enabled(),
    false,
  );
  assert.equal(await load({}).ready(), null);
  assert.deepEqual({ ...(await load({}).rpc("start_interest", {})) }, { error: "offline" });
});

test("on with config: makes one client and passes database errors through as short codes", async () => {
  let made = 0;
  const fake = {
    createClient(url, key) {
      made++;
      assert.equal(url, "https://abcdefgh.supabase.co");
      return {
        rpc: (name) =>
          Promise.resolve(
            name === "ok" ? { data: 7 } : { error: { message: "listing_limit", code: "P0001" } },
          ),
      };
    },
  };
  const DB = load(GOOD, fake);
  assert.equal(DB.enabled(), true);
  await DB.ready();
  await DB.ready();
  assert.equal(made, 1);
  assert.equal((await DB.rpc("ok")).data, 7);
  const r = await DB.rpc("start_interest", {});
  assert.equal(r.error, "listing_limit");
  assert.match(DB.message(r.error), /Owner Pro lists up to 5/);
});

test("unknown or long errors become a generic message, never raw server text", () => {
  const DB = load({});
  assert.equal(DB.code({ message: 'duplicate key value violates unique constraint "x"' }), "error");
  assert.equal(DB.message("error"), "Something went wrong. Try again.");
});
