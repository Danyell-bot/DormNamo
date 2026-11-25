// shared/js/account/accounts.js in Supabase mode, against a small in-memory stand-in for supabase-js.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { jsPath } from "../tools/js-files.mjs";

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    dump: () => Object.fromEntries(m),
  };
}

/** The parts of supabase-js accounts.js uses, backed by plain objects. */
function fakeSupabase({ confirmEmail = false } = {}) {
  const users = {}; // email -> {id, password}
  const profiles = {}; // id -> row (what the handle_new_user trigger makes)
  let session = null,
    n = 0;
  const calls = [];
  const ok = (data) => Promise.resolve({ data, error: null });
  const auth = {
    signUp({ email, password, options }) {
      calls.push(["signUp", options]);
      if (users[email]) return ok({ user: { id: "x", identities: [] }, session: null });
      const id = "00000000-0000-0000-0000-00000000000" + ++n;
      users[email] = { id, password };
      profiles[id] = {
        id,
        name: options.data.name,
        roles: options.data.roles,
        bio: null,
        school: null,
        phone: null,
        show_phone: false,
        created_at: "2026-11-25T00:00:00Z",
      };
      const user = { id, email, identities: [{}], user_metadata: options.data };
      session = confirmEmail ? null : { user };
      return ok({ user, session });
    },
    signInWithPassword({ email, password }) {
      const u = users[email];
      if (!u || u.password !== password)
        return Promise.resolve({ data: {}, error: { message: "Invalid login credentials" } });
      session = { user: { id: u.id, email } };
      return ok({ user: session.user, session });
    },
    getSession: () => ok({ session }),
    onAuthStateChange() {},
    signOut() {
      session = null;
      return ok({});
    },
    resetPasswordForEmail: (email, o) => (calls.push(["reset", email, o]), ok({})),
  };
  function from(table) {
    const q = { table, op: "select", filters: [], one: false };
    const b = {
      select: () => b,
      eq: (c, v) => (q.filters.push([c, v]), b),
      update: (row) => ((q.op = "update"), (q.row = row), b),
      maybeSingle: () => ((q.one = true), b),
      single: () => ((q.one = true), b),
      then(res, rej) {
        let rows;
        if (table === "public_profiles")
          rows = Object.values(profiles).map((p) => ({
            ...p,
            phone: p.show_phone ? p.phone : null,
            show_phone: undefined,
          }));
        else rows = Object.values(profiles);
        rows = rows.filter((r) => q.filters.every(([c, v]) => r[c] === v));
        if (q.op === "update") {
          calls.push(["update", table, q.row]);
          rows.forEach((r) => Object.assign(profiles[r.id], q.row));
          rows = rows.map((r) => ({ ...profiles[r.id] }));
        }
        return Promise.resolve({ data: q.one ? rows[0] || null : rows, error: null }).then(res, rej);
      },
    };
    return b;
  }
  return { client: { auth, from }, calls, profiles };
}

function boot({ supabase, local = {}, tab = {}, config } = {}) {
  const localStorage = memoryStorage(local),
    sessionStorage = memoryStorage(tab);
  const window = {
    DN_CONFIG:
      config === undefined
        ? { supabaseUrl: "https://abcdefgh.supabase.co", supabaseKey: "k".repeat(40) }
        : config,
    supabase: supabase && { createClient: () => supabase.client },
  };
  const ctx = {
    window,
    localStorage,
    sessionStorage,
    location: { protocol: "https:", hash: "", search: "", pathname: "/DormNamo/" },
    document: {
      currentScript: { src: "https://ktens.me/DormNamo/shared/js/app/utils.js" },
      head: { appendChild() {} },
      getElementById() {},
    },
    history: { replaceState() {} },
    TextEncoder,
    Promise,
    setTimeout,
  };
  window.localStorage = localStorage;
  vm.createContext(ctx);
  for (const f of ["utils", "db", "accounts"])
    vm.runInContext(fs.readFileSync(jsPath(f), "utf8"), ctx, { filename: f });
  vm.runInContext("window.DB = DB; window.Accounts = Accounts;", ctx);
  return { run: (code) => vm.runInContext(code, ctx), localStorage, sessionStorage };
}

test("without Supabase config, accounts stay in this browser (as before)", async () => {
  const b = boot({ config: {} });
  assert.equal(await b.run("Accounts.init()"), false);
  assert.equal(b.run("Accounts.cloud()"), false);
});

test("sign up: a Supabase login with name and roles; your profile and the directory load", async () => {
  const sb = fakeSupabase();
  const b = boot({ supabase: sb });
  assert.equal(await b.run("Accounts.init()"), true);
  const s = await b.run('Accounts.signUp("Ana Cruz", " Ana@X.ph ", "longpassword", ["owner"])');
  assert.equal(s.cloud, true);
  assert.equal(s.email, "ana@x.ph");
  const opts = sb.calls.find((c) => c[0] === "signUp")[1];
  assert.deepEqual({ ...opts.data, roles: [...opts.data.roles] }, { name: "Ana Cruz", roles: ["owner"] });
  assert.equal(opts.emailRedirectTo, "https://ktens.me/DormNamo/");
  assert.equal(b.run("Accounts.me().email"), "ana@x.ph");
  assert.equal(b.run("Accounts.person(Accounts.current().id).owner"), true);
  assert.equal(b.run("Accounts.people().length"), 1);
});

test("clear messages: taken email, wrong password, confirmation email, short password", async () => {
  const sb = fakeSupabase();
  const b = boot({ supabase: sb });
  await b.run("Accounts.init()");
  await b.run('Accounts.signUp("Ana", "ana@x.ph", "longpassword", ["student"])');
  await assert.rejects(b.run('Accounts.signUp("Ana", "ana@x.ph", "otherpassword", [])'), /already exists/);
  await assert.rejects(b.run('Accounts.logIn("ana@x.ph", "nope-nope")'), /Wrong email or password/);
  await assert.rejects(b.run('Accounts.signUp("Ben", "ben@x.ph", "short", [])'), /at least 8/);

  const c = boot({ supabase: fakeSupabase({ confirmEmail: true }) });
  await c.run("Accounts.init()");
  const err = await c.run(
    'Accounts.signUp("Cy", "cy@x.ph", "longpassword", []).catch(function (e) { return e; })',
  );
  assert.equal(err.info, true);
  assert.match(err.message, /confirmation link to cy@x\.ph/);
  assert.equal(c.run("Accounts.current()"), null);
});

test("profile edits save to Supabase; a hidden phone stays hidden from others", async () => {
  const sb = fakeSupabase();
  const b = boot({ supabase: sb });
  await b.run("Accounts.init()");
  await b.run('Accounts.signUp("Ana", "ana@x.ph", "longpassword", ["student"])');
  await b.run(
    'Accounts.updateProfile({ name: "Ana C.", phone: "0917 123 4567", showPhone: false, bio: "Hi" })',
  );
  const row = sb.calls.find((c) => c[0] === "update")[2];
  assert.equal(row.show_phone, false);
  assert.equal(row.name, "Ana C.");
  assert.equal(b.run("Accounts.me().phone"), "0917 123 4567");
  assert.equal(b.run("Accounts.person(Accounts.current().id).phone"), "");
  await b.run("Accounts.updateProfile({ showPhone: true })");
  assert.equal(b.run("Accounts.person(Accounts.current().id).phone"), "0917 123 4567");
});

test("an older this-browser account: logged out once, its preferences move to the new login", async () => {
  const sb = fakeSupabase();
  const b = boot({
    supabase: sb,
    local: {
      "dormnamo:session": JSON.stringify({ id: "uOld", name: "Old", email: "old@x.ph" }),
      "dormnamo:state:uOld": JSON.stringify({ P: { bhMax: 3500 }, likes: [5] }),
    },
  });
  await b.run("Accounts.init()");
  assert.equal(b.run("Accounts.current()"), null, "asked to sign up with an online account");
  await b.run('Accounts.signUp("Old", "old@x.ph", "longpassword", ["student"])');
  assert.equal(b.run("Accounts.loadState(Accounts.current().id).P.bhMax"), 3500);
});

test("log out signs out of Supabase and forgets the session in this browser", async () => {
  const sb = fakeSupabase();
  const b = boot({ supabase: sb });
  await b.run("Accounts.init()");
  await b.run('Accounts.signUp("Ana", "ana@x.ph", "longpassword", ["student"])');
  b.localStorage.setItem("dormnamo:sb-auth", "{}");
  await b.run("Accounts.logOut()");
  assert.equal(b.run("Accounts.current()"), null);
  assert.equal(b.localStorage.getItem("dormnamo:sb-auth"), null);
  assert.equal((await sb.client.auth.getSession()).data.session, null);
});

test("forgot password sends a reset link back to this site", async () => {
  const sb = fakeSupabase();
  const b = boot({ supabase: sb });
  await b.run("Accounts.init()");
  await b.run('Accounts.resetPassword("Ana@X.ph")');
  const c = sb.calls.find((x) => x[0] === "reset");
  assert.equal(c[1], "ana@x.ph");
  assert.equal(c[2].redirectTo, "https://ktens.me/DormNamo/");
});
