// Accounts with roles (student / landowner / both) and inbox.js: interest -> offer -> tenant group.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import { jsPath } from "../tools/js-files.mjs";

/** One browser with three accounts already signed up (written directly, so no slow password hashing). */
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
      key: (i) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
    document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  store.set(
    "dormnamo:accounts",
    JSON.stringify({
      "lola@x.ph": {
        id: "uOwner",
        name: "Lola Reyes",
        email: "lola@x.ph",
        hash: "-",
        roles: ["owner"],
        bio: "Quiet dorm",
      },
      "ana@x.ph": { id: "uAna", name: "Ana Cruz", email: "ana@x.ph", hash: "-", roles: ["student"] },
      "ben@x.ph": { id: "uBen", name: "Ben Lim", email: "ben@x.ph", hash: "-" }, // older account: no roles yet
    }),
  );
  for (const f of ["data", "utils", "photos", "listings", "accounts", "inbox"])
    vm.runInContext(fs.readFileSync(jsPath(f), "utf8"), ctx, { filename: f + ".js" });
  const run = (code) => vm.runInContext(code, ctx);
  const as = (id, name) => run(`USER = { id: ${JSON.stringify(id)}, name: ${JSON.stringify(name)} };`);
  return { run, as, store };
}

test("roles: student, landowner, both; listing a place makes you a landowner", () => {
  const b = browser();
  assert.equal(b.run('Accounts.person("uAna").student && !Accounts.person("uAna").owner'), true);
  assert.equal(b.run('Accounts.person("uBen").roles.join()'), "student", "old accounts default to student");
  assert.match(b.run('Accounts.describe(Accounts.person("uOwner"))'), /^Landowner · no places listed yet/);
  // Ben lists a place: now he is both
  b.as("uBen", "Ben Lim");
  b.run(
    'Listings.save({ id: 501, n: "Ben Rooms", a: "Tibanga", s: "MSU-IIT", d: 0.4, t: "Dormitory", p: 3500, am: [] })',
  );
  const ben = b.run('Accounts.person("uBen")');
  assert.equal(ben.owner && ben.student, true);
  assert.match(
    b.run('Accounts.describe(Accounts.person("uBen"))'),
    /Landowner · 1 place on DormNamo · also looking for a room/,
  );
  assert.equal(b.run("Accounts.owners().map(function (p) { return p.id; }).join()"), "uBen,uOwner");
  // emails never appear in public profiles
  assert.equal(b.run('Accounts.person("uAna").email'), undefined);
});

test("the full deal: interest, offer, counter-offer, accept, tenant group", () => {
  const b = browser();
  b.as("uOwner", "Lola Reyes");
  b.run(
    'Listings.save({ id: 900, n: "Lola Dorm", a: "Pala-o", s: "MSU-IIT", d: 0.5, t: "Dormitory", p: 4000, am: [] })',
  );

  // a place from Google Maps has no landowner account: no chat
  b.as("uAna", "Ana Cruz");
  assert.equal(b.run("Inbox.interest(1).error"), "no-owner");

  // Ana is interested
  const tid = b.run('Inbox.interest(900, "Is a room free in June?").thread.id');
  assert.equal(b.run(`Inbox.get("${tid}").status`), "inquiry");
  assert.equal(b.run("Inbox.interest(900).thread.id"), tid, "the same chat is reopened, not duplicated");

  // the landowner sees it as unread and replies with an offer
  b.as("uOwner", "Lola Reyes");
  assert.equal(b.run("Inbox.unread()"), 1);
  assert.equal(b.run("Inbox.threads()[0].t.roles.uOwner"), "owner");
  b.run(`Inbox.markRead("${tid}")`);
  assert.equal(b.run("Inbox.unread()"), 0);
  const o1 = b.run(`Inbox.offer("${tid}", { rent: 4000, move: "2027-06-01", note: "Water included" }).id`);
  assert.equal(b.run(`Inbox.get("${tid}").status`), "negotiating");
  assert.equal(b.run(`Inbox.answer("${o1}", true)`), null, "you can't accept your own offer");

  // Ana counters; the first offer is replaced
  b.as("uAna", "Ana Cruz");
  const o2 = b.run(`Inbox.offer("${tid}", { rent: 3600 }).id`);
  assert.equal(
    b.run(`Inbox.messages("${tid}").filter(function (m) { return m.id === "${o1}"; })[0].data.state`),
    "replaced",
  );

  // the landowner accepts: Ana is a tenant and joins the group chat
  b.as("uOwner", "Lola Reyes");
  const r = b.run(`JSON.stringify(Inbox.answer("${o2}", true))`);
  const { thread, group } = JSON.parse(r);
  assert.equal(thread.status, "agreed");
  assert.equal(group.type, "group");
  assert.deepEqual(group.members, ["uOwner", "uAna"]);
  assert.equal(group.roles.uAna, "tenant");
  assert.equal(b.run(`Inbox.title(Inbox.get("${group.id}"))`), "Lola Dorm tenants");
  assert.equal(b.run(`Inbox.offer("${tid}", { rent: 1 })`), null, "no more offers after a deal");

  // a second student agreeing joins the same group
  b.as("uBen", "Ben Lim");
  const t2 = b.run("Inbox.interest(900).thread.id");
  const o3 = b.run(`Inbox.offer("${t2}", { rent: 3800 }).id`);
  b.as("uOwner", "Lola Reyes");
  b.run(`Inbox.answer("${o3}", true)`);
  assert.equal(b.run(`Inbox.get("${group.id}").members.join()`), "uOwner,uAna,uBen");

  // group chat: tenants talk; the landowner can remove a tenant; a tenant can leave
  b.as("uAna", "Ana Cruz");
  assert.ok(b.run(`Inbox.send("${group.id}", "Hi housemates!")`));
  assert.equal(b.run(`Inbox.leave("${group.id}", "uBen")`), null, "tenants can't remove each other");
  b.as("uOwner", "Lola Reyes");
  b.run(`Inbox.leave("${group.id}", "uBen")`);
  assert.equal(b.run(`Inbox.get("${group.id}").members.join()`), "uOwner,uAna");
  b.as("uBen", "Ben Lim");
  assert.equal(b.run(`Inbox.send("${group.id}", "still here?")`), null, "removed members can't post");
});

test("guests can't message, and nobody can message themselves", () => {
  const b = browser();
  b.as("uOwner", "Lola Reyes");
  b.run(
    'Listings.save({ id: 900, n: "Lola Dorm", a: "Pala-o", s: "MSU-IIT", d: 0.5, t: "Dormitory", p: 4000, am: [] })',
  );
  assert.equal(b.run("Inbox.interest(900).error"), "self");
  b.as("guest", "Guest");
  assert.equal(b.run("Inbox.interest(900).error"), "account");
  assert.equal(b.run("Inbox.threads().length"), 0);
});

test("profiles: the owner edits their own account; others see only the public part", async () => {
  const b = browser();
  b.run(
    'localStorage.setItem("dormnamo:session", JSON.stringify({ id: "uAna", name: "Ana Cruz", email: "ana@x.ph" }))',
  );
  await b.run(
    'Accounts.updateProfile({ name: "Ana C.", bio: "2nd-year engineering", phone: "0917 123 4567", showPhone: false, roles: ["student", "owner"] })',
  );
  assert.equal(b.run("Accounts.me().email"), "ana@x.ph");
  assert.equal(b.run("Accounts.me().phone"), "0917 123 4567");
  const pub = b.run('Accounts.person("uAna")');
  assert.equal(pub.name, "Ana C.");
  assert.equal(pub.phone, "", "phone stays private unless shown");
  assert.equal(pub.owner && pub.student, true);
  await assert.rejects(b.run('Accounts.updateProfile({ name: "  " })'));
});

test("offers take any amount; the only rule is that it's a number", () => {
  const b = browser();
  b.as("uOwner", "Lola Reyes");
  b.run('Listings.save({ id: 900, n: "Lola Dorm", a: "Pala-o", s: "MSU-IIT", d: 0.5, t: "Dormitory", p: 4000, am: [] })');
  b.as("uAna", "Ana Cruz");
  const tid = b.run("Inbox.interest(900).thread.id");
  for (const [typed, rent] of [
    ["2900", 2900],
    ["2901", 2901],
    ["150", 150],
    ["2,900", 2900],
    ["2900.50", 2900.5],
    [99999, 99999],
  ])
    assert.equal(b.run(`Inbox.offer("${tid}", { rent: ${JSON.stringify(typed)} }).data.rent`), rent, String(typed));
  for (const bad of ["", "abc", "two thousand", "0", "-5"])
    assert.equal(b.run(`Inbox.offer("${tid}", { rent: ${JSON.stringify(bad)} }).error`), "rent", bad);
});
