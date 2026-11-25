// npm run db:test - run supabase/migrations on a real Postgres (PGlite, in Node) with stand-ins for
// Supabase's auth and storage schemas, then check the rules: limits, server-only columns, privacy,
// deals, ratings. It also proves the migrations upgrade the first hand-made schema and can be re-run.
// Needs the dev dependency: npm install
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const db = new PGlite();
const ok = [];
const bad = [];
const check = (name, cond) => (cond ? ok : bad).push(name);

async function q(sql, params) {
  return db.query(sql, params);
}
async function fails(sql, params) {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return e.message;
  }
}
async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
async function asAnon(fn) {
  await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role;`);
  }
}

// --- Supabase stand-ins ---
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
  create publication supabase_realtime;
`);

// --- the first hand-made version (to prove the migrations upgrade it safely) ---
await db.exec(`
  create table profiles (id uuid primary key references auth.users on delete cascade, name text not null,
    roles text[] default '{student}', bio text, school text, phone text, show_phone boolean default false,
    created_at timestamptz default now());
  create table listings (ref uuid primary key default gen_random_uuid(), owner_id uuid references profiles on delete cascade,
    n text not null, brgy text, street text, addr text, s text, t text, p int, c text, ds text, am text[] default '{}',
    facts jsonb default '{}', plan text default 'basic', pay text default 'full', f boolean default false,
    cover text, photos text[] default '{}', created_at timestamptz default now(), updated_at timestamptz default now());
  create table threads (id uuid primary key default gen_random_uuid(), kind text check (kind in ('dm','group')),
    listing_ref uuid references listings on delete cascade, members uuid[] not null, status text default 'inquiry',
    offer jsonb, updated_at timestamptz default now());
  create table messages (id bigint generated always as identity primary key, thread_id uuid references threads on delete cascade,
    sender uuid references profiles, text text, data jsonb, created_at timestamptz default now());
  alter table profiles enable row level security;
  create policy "read profiles" on profiles for select using (true);
  create policy "edit own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
`);

// --- run every migration, twice (they must be safe to re-run) ---
const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (let round = 1; round <= 2; round++)
  for (const f of files) {
    try {
      await db.exec(fs.readFileSync(path.join(DIR, f), "utf8"));
    } catch (e) {
      console.log(`FAILED round ${round}: ${f}\n  ${e.message}`);
      process.exit(1);
    }
  }
check(`all ${files.length} migrations run, and re-run`, true);

// --- people ---
const A = "00000000-0000-0000-0000-00000000000a"; // landowner
const B = "00000000-0000-0000-0000-00000000000b"; // student
const C = "00000000-0000-0000-0000-00000000000c"; // another student
await q(`insert into auth.users values ($1, 'ana@x.ph', '{"name":"Ana","roles":["owner","admin"]}')`, [A]);
await q(`insert into auth.users values ($1, 'ben@x.ph', '{"name":"Ben"}')`, [B]);
await q(`insert into auth.users values ($1, 'cy@x.ph', '{"roles":"owner"}')`, [C]);
const prof = (await q(`select id, name, roles from profiles order by id`)).rows;
check("sign-up makes a profile; unknown roles dropped", JSON.stringify(prof[0].roles) === '["owner"]');
check("no roles given = student; name from email", prof[1].roles[0] === "student" && prof[2].name === "cy");
await q(`update profiles set phone = '09171234567', show_phone = false where id = $1`, [A]);

// privacy
const others = await as(B, () => q(`select id from profiles`));
check("profiles: you only see your own row", others.rows.length === 1 && others.rows[0].id === B);
const pub = await asAnon(() => q(`select name, phone from public_profiles where id = $1`, [A]));
check(
  "public_profiles hides a phone that isn't shown",
  pub.rows[0].phone === null && pub.rows[0].name === "Ana",
);
const definerViews = (
  await q(`select c.relname from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
              and not coalesce(c.reloptions @> array['security_invoker=true'], false)`)
).rows.map((r) => r.relname);
check("no SECURITY DEFINER views in public (Supabase advisor)", definerViews.length === 0);
const definerFns = (
  await q(`select p.proname from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prosecdef
              and p.prorettype <> 'trigger'::regtype`)
).rows.map((r) => r.proname);
check(
  "no callable SECURITY DEFINER functions in public (Supabase advisor): " + (definerFns.join(", ") || "none"),
  definerFns.length === 0,
);
const fkNoIndex = (
  await q(`select c.conrelid::regclass::text || '.' || a.attname as col
             from pg_constraint c
             join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
            where c.contype = 'f' and c.connamespace = 'public'::regnamespace
              and not exists (select 1 from pg_index i
                               where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])`)
).rows.map((r) => r.col);
check("every foreign key has an index (Supabase advisor): " + (fkNoIndex.join(", ") || "none"), fkNoIndex.length === 0);
check(
  "you can't make yourself an admin",
  !!(await as(B, () => fails(`update profiles set roles = '{admin}' where id = $1`, [B]))),
);

// listings: limit and server-only columns
const add = (uid, n) =>
  as(uid, () => q(`insert into listings (n, brgy) values ($1, 'Tibanga') returning ref`, [n]));
const r1 = (await add(B, "Ben 1")).rows[0].ref;
await add(B, "Ben 2");
const third = await as(B, () => fails(`insert into listings (n, brgy) values ('Ben 3', 'Tibanga')`));
check("Basic: a 3rd place is refused (listing_limit)", /listing_limit/.test(third || ""));
check(
  "listing a place makes you a landowner",
  (await q(`select roles from profiles where id = $1`, [B])).rows[0].roles.includes("owner"),
);
check(
  "owners can't set their own plan",
  !!(await as(B, () => fails(`update listings set plan = 'pro-y' where ref = $1`, [r1]))),
);
check(
  "owners can't mark themselves Featured",
  !!(await as(B, () => fails(`update listings set f = true where ref = $1`, [r1]))),
);
check(
  "owners can't take someone else's place",
  !!(await as(B, () => fails(`update listings set owner_id = $2 where ref = $1`, [r1, C]))),
);
const upd = await as(C, () => q(`update listings set n = 'hacked' where ref = $1 returning ref`, [r1]));
check("you can't edit another owner's listing", upd.rows.length === 0);
check(
  "nobody can write their own subscription",
  !!(await as(B, () =>
    fails(`insert into subscriptions values ($1, 'pro-y', 'active', now() + interval '1 year')`, [B]),
  )),
);
await q(
  `insert into subscriptions (user_id, plan, current_period_end) values ($1, 'pro-y', now() + interval '1 year')`,
  [B],
);
await add(B, "Ben 3");
await add(B, "Ben 4");
await add(B, "Ben 5");
const sixth = await as(B, () => fails(`insert into listings (n) values ('Ben 6')`));
check("Owner Pro: 5 places, the 6th refused", /listing_limit/.test(sixth || ""));

// featured spots
const refs = (await q(`select ref from listings where owner_id = $1 order by n`, [B])).rows.map((r) => r.ref);
for (let i = 0; i < 3; i++)
  await q(`insert into boosts (listing_ref, kind, ends_at) values ($1, 'b7', now() + interval '7 days')`, [
    refs[i],
  ]);
const fourth = await fails(
  `insert into boosts (listing_ref, kind, ends_at) values ($1, 'b7', now() + interval '7 days')`,
  [refs[3]],
);
check("3 Featured spots per barangay, the 4th refused", /no_featured_spots/.test(fourth || ""));
check(
  "spots left = 0 in Tibanga",
  (await asAnon(() => q(`select featured_spots_left('Tibanga') n`))).rows[0].n === 0,
);

// deals
const aRef = (await add(A, "Ana's Dorm")).rows[0].ref;
const tid = (await as(C, () => q(`select start_interest($1) id`, [aRef]))).rows[0].id;
const again = (await as(C, () => q(`select start_interest($1) id`, [aRef]))).rows[0].id;
check("I'm interested opens one chat (reused the 2nd time)", tid === again);
check("the landowner sees the chat", (await as(A, () => q(`select id from threads`))).rows.length === 1);
check(
  "an outsider doesn't",
  (await as(B, () => q(`select id from threads where id = $1`, [tid]))).rows.length === 0,
);
check(
  "an outsider can't post into it",
  !!(await as(B, () =>
    fails(`insert into messages (thread_id, sender, kind, text) values ($1, $2, 'text', 'hi')`, [tid, B]),
  )),
);
check(
  "nobody can post a fake offer directly",
  !!(await as(C, () =>
    fails(
      `insert into messages (thread_id, sender, kind, data) values ($1, $2, 'offer', '{"state":"open"}')`,
      [tid, C],
    ),
  )),
);
check(
  "nobody can mark a deal agreed directly",
  !!(await as(C, () => fails(`update threads set status = 'agreed' where id = $1`, [tid]))),
);
const o1 = (await as(C, () => q(`select send_offer($1, 3000, '2027-06-01', 'June?') id`, [tid]))).rows[0].id;
check(
  "you can't accept your own offer",
  /answer_own_offer/.test((await as(C, () => fails(`select answer_offer($1, true)`, [o1]))) || ""),
);
const o2 = (await as(A, () => q(`select send_offer($1, 3500) id`, [tid]))).rows[0].id;
const st1 = (await q(`select data->>'state' s from messages where id = $1`, [o1])).rows[0].s;
check("a newer offer replaces the open one", st1 === "replaced");
check(
  "the student can't close the deal",
  /landowner_only/.test((await as(C, () => fails(`select close_thread($1)`, [tid]))) || ""),
);
await as(C, () => q(`select answer_offer($1, true)`, [o2]));
check(
  "the other side's yes = agreed",
  (await q(`select status from threads where id = $1`, [tid])).rows[0].status === "agreed",
);
const grp = (await as(C, () => q(`select id, members from threads where kind = 'group'`))).rows;
check("agreed: the student joins the tenant group", grp.length === 1 && grp[0].members.includes(C));
await as(C, () => q(`select leave_group($1)`, [grp[0].id]));
check(
  "a tenant can leave",
  (await as(C, () => q(`select id from threads where kind = 'group'`))).rows.length === 0,
);
check(
  "the landowner can't leave their own group",
  /owner_stays/.test((await as(A, () => fails(`select leave_group($1)`, [grp[0].id]))) || ""),
);
check(
  "logged-out visitors can't start chats",
  !!(await asAnon(() => fails(`select start_interest($1)`, [aRef]))),
);

// ratings and hearts
await as(C, () => q(`insert into comments (listing_ref, text, stars) values ($1, 'ok', 3)`, [aRef]));
await as(C, () => q(`insert into comments (listing_ref, text, stars) values ($1, 'better now', 5)`, [aRef]));
await as(A, () =>
  q(`insert into comments (listing_ref, text, stars) values ($1, 'my own place', 5)`, [aRef]),
);
const cs = (await asAnon(() => q(`select ratings, stars from comment_stats where listing_key = $1`, [aRef])))
  .rows[0];
check(
  "one rating per person (latest wins); owners can't rate their own place",
  cs.ratings === 1 && Number(cs.stars) === 5,
);
check(
  "you can't comment as someone else",
  !!(await as(B, () =>
    fails(`insert into comments (listing_ref, user_id, text) values ($1, $2, 'x')`, [aRef, C]),
  )),
);
await as(B, () => q(`insert into hearts (listing_key) values ('5')`));
await as(C, () => q(`insert into hearts (listing_key) values ('5')`));
check(
  "heart counts are public",
  (await asAnon(() => q(`select hearts from heart_counts where listing_key = '5'`))).rows[0].hearts === 2,
);

// saved state
await as(B, () => q(`insert into user_state (user_id, state) values ($1, '{"P":{}}')`, [B]));
check("your saved state is private", (await as(C, () => q(`select * from user_state`))).rows.length === 0);

// deleting an account keeps the other side's chat
await q(`delete from auth.users where id = $1`, [C]);
const left = (await q(`select count(*)::int n from messages where thread_id = $1`, [tid])).rows[0].n;
check("deleting an account keeps the other side's messages", left > 0);

console.log(ok.map((x) => "  ok   " + x).join("\n"));
if (bad.length) console.log(bad.map((x) => "  FAIL " + x).join("\n"));
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
