// shared/js/app/consent.js: ask first, then save preferences (browser + dn_prefs cookie) only with consent.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { jsPath } from "../tools/js-files.mjs";

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    keys: () => [...m.keys()],
  };
}

/** A small browser: cookie jar (Max-Age=0 deletes), both storages, a GitHub Pages address. */
function site({ cookies = true, protocol = "https:" } = {}) {
  const jar = {},
    written = [];
  const ctx = {
    console,
    Date,
    Math,
    JSON,
    String,
    Array,
    Object,
    Number,
    RegExp,
    localStorage: memStorage(),
    sessionStorage: memStorage(),
    location: { pathname: "/DormNamo/index.html", protocol },
    document: {
      get cookie() {
        return Object.entries(jar)
          .map(([k, v]) => k + "=" + v)
          .join("; ");
      },
      set cookie(c) {
        written.push(c);
        if (!cookies) return; // file:// pages: browsers ignore cookies
        const [nv, ...attrs] = c.split("; ");
        const i = nv.indexOf("="),
          maxAge = attrs.find((a) => a.startsWith("Max-Age="));
        if (maxAge && +maxAge.slice(8) <= 0) delete jar[nv.slice(0, i)];
        else jar[nv.slice(0, i)] = nv.slice(i + 1);
      },
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["data", "utils", "consent", "accounts", "matching", "twotower", "state"])
    vm.runInContext(fs.readFileSync(jsPath(f), "utf8"), ctx, { filename: f + ".js" });
  const run = (code) => vm.runInContext(code, ctx);
  run('loadState({ id: "u1", name: "Ana" }); S.P.bhMax = 3000; S.P.maxKm = 0.8; S.P.m.wifi = 2;');
  return { ctx, jar, written, run };
}

test("nothing is asked yet: no consent, nothing saved to this browser", () => {
  const b = site();
  assert.equal(b.run("Consent.asked()"), false);
  b.run("save()");
  assert.equal(b.ctx.localStorage.getItem("dormnamo:state:u1"), null);
  assert.ok(b.ctx.sessionStorage.getItem("dormnamo:state:u1"), "kept for this tab only");
  assert.equal(b.jar.dn_prefs, undefined);
});

test("essential only: preferences last for this tab, no preferences cookie", () => {
  const b = site();
  b.run("Consent.set(false); save();");
  assert.equal(b.run("Consent.asked() && !Consent.prefs()"), true);
  assert.equal(b.ctx.localStorage.getItem("dormnamo:state:u1"), null);
  assert.ok(b.ctx.sessionStorage.getItem("dormnamo:state:u1"));
  assert.equal(b.jar.dn_prefs, undefined);
  assert.ok(b.jar.dn_consent, "the choice itself is remembered");
});

test("accept: saved in this browser and in a preferences cookie that comes back", () => {
  const b = site();
  b.run("Consent.set(true); save();");
  assert.ok(b.ctx.localStorage.getItem("dormnamo:state:u1"));
  const prefsCookie = b.written.filter((c) => c.startsWith("dn_prefs=")).pop();
  assert.match(prefsCookie, /Max-Age=15552000/); // 180 days
  assert.match(prefsCookie, /Path=\/DormNamo\//); // only this site's folder on github.io
  assert.match(prefsCookie, /SameSite=Lax; Secure/);
  assert.ok(prefsCookie.length < 400, "small cookie");
  const p = b.run("Consent.readPrefs()");
  assert.equal(p.bhMax, 3000);
  assert.equal(p.maxKm, 0.8);
  assert.equal(p.school, "MSU-IIT");
  assert.equal(p.m.wifi, 2);
  // next visit: the saved state loads again
  assert.equal(b.run('Accounts.loadState("u1").P.bhMax'), 3000);
});

test("changing to essential only deletes saved preferences but keeps the log-in", () => {
  const b = site();
  b.run(
    'Consent.set(true); save(); localStorage.setItem("dormnamo:session", "{}"); localStorage.setItem("dormnamo:state:other", "{}");',
  );
  b.run("Consent.set(false);");
  assert.equal(b.ctx.localStorage.getItem("dormnamo:state:u1"), null);
  assert.equal(b.ctx.localStorage.getItem("dormnamo:state:other"), null);
  assert.equal(b.jar.dn_prefs, undefined);
  assert.equal(b.run("Consent.readPrefs()"), null);
  assert.equal(b.ctx.localStorage.getItem("dormnamo:session"), "{}", "log-in stays");
});

test("the choice is remembered even where cookies don't work (file:// pages)", () => {
  const b = site({ cookies: false, protocol: "file:" });
  b.run("Consent.set(true);");
  assert.equal(b.run("Consent.asked() && Consent.prefs()"), true);
  assert.ok(!b.written.some((c) => c.includes("Secure")), "no Secure flag off https");
});

test("start-up asks first: nothing is loaded before the answer", () => {
  const b = site();
  b.run("USER = null; S = null;");
  let asked = 0;
  b.ctx.Consent.show = () => asked++;
  b.ctx.Auth = {
    show() {
      throw new Error("log-in must wait for consent");
    },
  };
  vm.runInContext(fs.readFileSync(jsPath("main"), "utf8"), b.ctx, { filename: "main.js" });
  assert.equal(asked, 1);
  assert.equal(b.run("USER"), null);
});
