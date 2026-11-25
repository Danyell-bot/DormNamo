-- 03 Listings and plans: who may change what, the 2 / 5 place limit, Featured spots
-- The browser can never set `plan`, `f` (featured) or `owner_id` on an update: those columns
-- are not granted (see 08_grants). Plans and boosts are written only by the server after payment.

alter table public.listings enable row level security;
drop policy if exists "read listings" on public.listings;
drop policy if exists "own listings" on public.listings;
drop policy if exists "listings: read visible" on public.listings;
drop policy if exists "listings: add own" on public.listings;
drop policy if exists "listings: edit own" on public.listings;
drop policy if exists "listings: delete own" on public.listings;
create policy "listings: read visible" on public.listings
  for select using (not coalesce(hidden, false) or owner_id = (select auth.uid()));
create policy "listings: add own" on public.listings
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "listings: edit own" on public.listings
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "listings: delete own" on public.listings
  for delete to authenticated using (owner_id = (select auth.uid()));

alter table public.subscriptions enable row level security;
drop policy if exists "subscriptions: read own" on public.subscriptions;
create policy "subscriptions: read own" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.boosts enable row level security;
drop policy if exists "boosts: read" on public.boosts;
create policy "boosts: read" on public.boosts for select using (true);

-- how many places someone may list: Basic 2, Owner Pro 5 (Listings.LIMIT in listings.js)
drop function if exists public.listing_limit(uuid);
create or replace function private.listing_limit(uid uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case when exists (
           select 1 from public.subscriptions s
            where s.user_id = uid and s.status = 'active' and s.current_period_end > now())
         then 5 else 2 end
$$;

-- refuse a new place past the limit; listing a place makes you a landowner
create or replace function public.check_listing_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  used int;
  cap int;
begin
  -- one owner's inserts wait for each other, so two tabs can't both slip past the limit
  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  select count(*) into used from public.listings where owner_id = new.owner_id;
  cap := private.listing_limit(new.owner_id);
  if used >= cap then
    raise exception 'listing_limit'
      using detail = format('%s of %s places used', used, cap),
            hint = case when cap < 5 then 'Owner Pro lists up to 5 places.' else 'This is the Owner Pro maximum.' end;
  end if;

  update public.profiles
     set roles = array(select distinct r from unnest(roles || array['owner']) as r)
   where id = new.owner_id and not ('owner' = any (roles));
  return new;
end $$;

drop trigger if exists listing_quota on public.listings;
create trigger listing_quota
  before insert on public.listings for each row execute function public.check_listing_quota();

-- at most 3 Featured places per barangay at the same time (owners.js SPOTS)
create or replace function public.check_boost_spots()
returns trigger language plpgsql set search_path = '' as $$
declare
  b text;
  taken int;
begin
  select brgy into b from public.listings where ref = new.listing_ref;
  select count(distinct x.listing_ref) into taken
    from public.boosts x join public.listings l on l.ref = x.listing_ref
   where l.brgy is not distinct from b
     and x.listing_ref <> new.listing_ref
     and x.starts_at < new.ends_at and x.ends_at > new.starts_at;
  if taken >= 3 then
    raise exception 'no_featured_spots' using detail = coalesce(b, 'This area') || ' already has 3 Featured places';
  end if;
  return new;
end $$;

drop trigger if exists boost_spots on public.boosts;
create trigger boost_spots
  before insert on public.boosts for each row execute function public.check_boost_spots();

-- which places are Featured right now (cards and Discover show the badge from this)
create or replace view public.featured_listings with (security_invoker = true) as
  select b.listing_ref, l.brgy, max(b.ends_at) as until
    from public.boosts b
    join public.listings l on l.ref = b.listing_ref
   where now() between b.starts_at and b.ends_at
   group by b.listing_ref, l.brgy;

-- Featured spots left in a barangay (owners.js bill() "spots left")
create or replace function public.featured_spots_left(p_brgy text)
returns int language sql stable set search_path = '' as $$
  select greatest(0, 3 - count(*)::int)
    from public.featured_listings where brgy is not distinct from p_brgy
$$;
