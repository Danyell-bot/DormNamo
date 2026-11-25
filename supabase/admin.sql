-- admin.sql - things only the team does, in Supabase's SQL editor (it runs with full rights).
-- Not a migration: copy the part you need, fill in the email / reference, and run it.
-- Until online payment is connected, this is how a paid plan or a boost is switched on.

-- Give someone Owner Pro (yearly) after they paid. Owner Pro = up to 5 places.
insert into public.subscriptions (user_id, plan, status, current_period_end)
select id, 'pro-y', 'active', now() + interval '1 year' from auth.users where email = 'owner@example.com'
on conflict (user_id) do update
  set plan = excluded.plan, status = 'active', current_period_end = excluded.current_period_end;

-- Monthly instead: plan 'pro-m' and interval '1 month'. End it early:
-- update public.subscriptions set status = 'canceled' where user_id = (select id from auth.users where email = 'owner@example.com');

-- Feature a place: b7 = 7 days, b30 = 30 days, bsem = 150 days. Fails with no_featured_spots
-- when its barangay already has 3 Featured places at the same time.
insert into public.boosts (listing_ref, kind, ends_at)
values ('00000000-0000-0000-0000-000000000000', 'b7', now() + interval '7 days');
update public.listings set plan = 'b7', f = true where ref = '00000000-0000-0000-0000-000000000000';

-- Hide a listing that breaks the rules (the owner still sees it; nobody else does):
-- update public.listings set hidden = true where ref = '00000000-0000-0000-0000-000000000000';

-- Who is on DormNamo
select u.email, p.name, p.roles, p.created_at,
       (select count(*) from public.listings l where l.owner_id = p.id) as places,
       s.plan, s.current_period_end
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.subscriptions s on s.user_id = p.id
 order by p.created_at desc;

-- Check that every table is protected by Row Level Security (all rows should say true)
select relname as table_name, relrowsecurity as rls_on
  from pg_class
 where relnamespace = 'public'::regnamespace and relkind = 'r'
 order by relname;
