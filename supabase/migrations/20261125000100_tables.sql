-- 01 Tables
-- Safe on a project that already has them: the first version was created by hand in the SQL
-- editor, so every statement here only adds what is missing and never drops data.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  roles text[] default '{student}',
  bio text, school text, phone text, show_phone boolean default false,
  created_at timestamptz default now()
);
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- owner listings (same terse fields as HOUSES in shared/js/data/data.js)
create table if not exists public.listings (
  ref uuid primary key default gen_random_uuid(),   -- the DN- reference number
  owner_id uuid references public.profiles on delete cascade,
  n text not null, brgy text, street text, addr text, s text, t text,
  p int, c text, ds text, am text[] default '{}', facts jsonb default '{}',
  plan text default 'basic', pay text default 'full', f boolean default false,
  cover text, photos text[] default '{}',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.listings add column if not exists a text;                          -- area shown on cards (= barangay)
alter table public.listings add column if not exists lat double precision;
alter table public.listings add column if not exists lng double precision;
alter table public.listings add column if not exists requested_plan text default 'basic'; -- what the owner picked; `plan` is what was paid
alter table public.listings add column if not exists hidden boolean default false;
alter table public.listings alter column owner_id set default auth.uid();

-- each student's preferences, swipes and learning-model weights (the S object)
create table if not exists public.user_state (
  user_id uuid primary key references public.profiles on delete cascade,
  state jsonb not null, updated_at timestamptz default now()
);

-- chats: one-to-one ("dm", may carry a deal) and one tenant group per listing
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  kind text check (kind in ('dm', 'group')),
  listing_ref uuid references public.listings on delete cascade,
  members uuid[] not null, status text default 'inquiry', offer jsonb,
  updated_at timestamptz default now()
);
alter table public.threads add column if not exists roles jsonb not null default '{}';    -- {uid: "owner" | "student" | "tenant"}
alter table public.threads add column if not exists read_at jsonb not null default '{}';  -- {uid: last read time}
alter table public.threads add column if not exists created_at timestamptz default now();

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  thread_id uuid references public.threads on delete cascade,
  sender uuid references public.profiles, text text, data jsonb,
  created_at timestamptz default now()
);
alter table public.messages add column if not exists kind text not null default 'text';
alter table public.messages alter column sender set default auth.uid();
-- keep the conversation when one side deletes their account
alter table public.messages drop constraint if exists messages_sender_fkey;
alter table public.messages
  add constraint messages_sender_fkey foreign key (sender) references public.profiles (id) on delete set null;

-- comments with tenant star ratings; owner listings use listing_ref, Google Maps places listing_id
create table if not exists public.comments (
  id bigint generated always as identity primary key,
  listing_ref uuid, listing_id int,
  user_id uuid references public.profiles on delete cascade,
  text text, stars int check (stars between 1 and 5),
  created_at timestamptz default now()
);
alter table public.comments alter column user_id set default auth.uid();

-- hearts = saved / popular (never the star rating)
create table if not exists public.hearts (
  user_id uuid references public.profiles on delete cascade,
  listing_key text,                    -- listing ref, or the Google Maps place id
  primary key (user_id, listing_key)
);
alter table public.hearts alter column user_id set default auth.uid();
alter table public.hearts add column if not exists created_at timestamptz default now();

-- paid plans: written only by the server (service role / admin), never by the browser
create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles on delete cascade,
  plan text not null check (plan in ('pro-m', 'pro-y')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  current_period_end timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Featured boosts: written only by the server; 3 Featured places per barangay at a time
create table if not exists public.boosts (
  id bigint generated always as identity primary key,
  listing_ref uuid not null references public.listings on delete cascade,
  kind text not null check (kind in ('b7', 'b30', 'bsem')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz default now(),
  check (ends_at > starts_at)
);

-- indexes for the queries the site makes
create index if not exists listings_owner_idx on public.listings (owner_id);
create index if not exists listings_brgy_idx on public.listings (brgy);
create index if not exists threads_members_idx on public.threads using gin (members);
create index if not exists threads_listing_idx on public.threads (listing_ref);
create index if not exists messages_thread_idx on public.messages (thread_id, created_at);
create index if not exists comments_ref_idx on public.comments (listing_ref);
create index if not exists comments_id_idx on public.comments (listing_id);
create index if not exists comments_user_idx on public.comments (user_id);
create index if not exists messages_sender_idx on public.messages (sender);
create index if not exists hearts_key_idx on public.hearts (listing_key);
create index if not exists boosts_listing_idx on public.boosts (listing_ref, ends_at);

-- data rules, added once
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_roles_ok') then
    alter table public.profiles add constraint profiles_roles_ok
      check (roles <@ array['student', 'owner']::text[] and cardinality(roles) between 1 and 2);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_name_len') then
    alter table public.profiles add constraint profiles_name_len check (char_length(name) between 1 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'listings_rent_ok') then
    alter table public.listings add constraint listings_rent_ok check (p is null or p between 0 and 100000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'listings_plan_ok') then
    alter table public.listings add constraint listings_plan_ok
      check (plan in ('basic', 'b7', 'b30', 'bsem', 'pro-m', 'pro-y')
         and coalesce(requested_plan, 'basic') in ('basic', 'b7', 'b30', 'bsem', 'pro-m', 'pro-y'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'threads_status_ok') then
    alter table public.threads add constraint threads_status_ok
      check (status is null or status in ('inquiry', 'negotiating', 'agreed', 'declined'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_kind_ok') then
    alter table public.messages add constraint messages_kind_ok
      check (kind in ('text', 'photo', 'interest', 'offer', 'system'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_text_len') then
    alter table public.messages add constraint messages_text_len check (char_length(coalesce(text, '')) <= 4000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comments_text_len') then
    alter table public.comments add constraint comments_text_len check (char_length(coalesce(text, '')) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'comments_target') then
    alter table public.comments add constraint comments_target check (listing_ref is not null or listing_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_state_size') then
    alter table public.user_state add constraint user_state_size check (octet_length(state::text) <= 300000);
  end if;
end $$;
