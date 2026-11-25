-- 05 Comments, hearts and each student's saved state

-- your preferences, swipes and model weights are private
alter table public.user_state enable row level security;
drop policy if exists "own state" on public.user_state;
drop policy if exists "user_state: own" on public.user_state;
create policy "user_state: own" on public.user_state
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- comments: everyone reads; you add and delete only your own
alter table public.comments enable row level security;
drop policy if exists "read comments" on public.comments;
drop policy if exists "own comments" on public.comments;
drop policy if exists "comments: read" on public.comments;
drop policy if exists "comments: add own" on public.comments;
drop policy if exists "comments: delete own" on public.comments;
create policy "comments: read" on public.comments for select using (true);
create policy "comments: add own" on public.comments
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "comments: delete own" on public.comments
  for delete to authenticated using (user_id = (select auth.uid()));

-- stars: one rating per person per place (the latest wins), and owners can't rate their own place
create or replace function public.comment_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stars is not null then
    if new.listing_ref is not null and exists (
         select 1 from public.listings l where l.ref = new.listing_ref and l.owner_id = new.user_id) then
      new.stars := null;
    else
      update public.comments
         set stars = null
       where user_id = new.user_id and stars is not null
         and listing_ref is not distinct from new.listing_ref
         and listing_id is not distinct from new.listing_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists comment_rules on public.comments;
create trigger comment_rules before insert on public.comments for each row execute function public.comment_rules();

create or replace view public.comment_stats with (security_invoker = true) as
  select coalesce(listing_ref::text, listing_id::text) as listing_key,
         count(*)::int as comments,
         count(stars)::int as ratings,
         round(avg(stars)::numeric, 2) as stars
    from public.comments
   group by 1;

-- hearts: everyone sees the counts; you heart and un-heart only for yourself
alter table public.hearts enable row level security;
drop policy if exists "read hearts" on public.hearts;
drop policy if exists "own hearts" on public.hearts;
drop policy if exists "hearts: read" on public.hearts;
drop policy if exists "hearts: add own" on public.hearts;
drop policy if exists "hearts: remove own" on public.hearts;
create policy "hearts: read" on public.hearts for select using (true);
create policy "hearts: add own" on public.hearts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "hearts: remove own" on public.hearts
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace view public.heart_counts with (security_invoker = true) as
  select listing_key, count(*)::int as hearts from public.hearts group by listing_key;
