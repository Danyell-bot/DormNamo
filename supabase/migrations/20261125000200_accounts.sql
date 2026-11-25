-- 02 Accounts: profile on sign-up, private fields, public view, updated_at

-- keep updated_at honest on every table that has it
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'listings', 'user_state', 'threads', 'subscriptions'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format(
      'create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- a profile row for every new login (name and roles come from the sign-up form's metadata)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text[];
begin
  select coalesce(array_agg(distinct x), '{}'::text[]) into r
    from jsonb_array_elements_text(
      case when jsonb_typeof(meta -> 'roles') = 'array' then meta -> 'roles' else '[]'::jsonb end) as x
   where x in ('student', 'owner');
  if cardinality(r) = 0 then r := array['student']; end if;

  insert into public.profiles (id, name, roles)
  values (new.id,
          left(coalesce(nullif(trim(meta ->> 'name'), ''), split_part(new.email, '@', 1), 'Student'), 80),
          r)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- profiles: you read and edit only your own row (phone, school…)
alter table public.profiles enable row level security;
drop policy if exists "read profiles" on public.profiles;
drop policy if exists "edit own profile" on public.profiles;
drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: update own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- no insert policy: rows are made by handle_new_user. No delete: the delete-account function does it.

-- what anyone may see about a person (Accounts.person / people / owners):
-- never the email, and the phone only when they chose to show it.
-- Reading other people's rows needs more rights than the visitor has, so that one step lives in a
-- function in the `private` schema, which the API doesn't expose. The view itself runs with the
-- visitor's own rights (security_invoker), as Supabase's security advisor asks.
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.public_profile_rows()
returns table (id uuid, name text, roles text[], bio text, school text, phone text,
               avatar_url text, created_at timestamptz, places int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.roles, p.bio, p.school,
         case when p.show_phone then p.phone end,
         p.avatar_url, p.created_at,
         (select count(*)::int from public.listings l
           where l.owner_id = p.id and not coalesce(l.hidden, false))
    from public.profiles p
$$;

-- the first version of this view ran with its owner's rights; replace it
drop view if exists public.public_profiles;
create view public.public_profiles with (security_invoker = true) as
  select * from private.public_profile_rows();
comment on view public.public_profiles is
  'Public profile fields only: no email, phone only when show_phone. Rows come from private.public_profile_rows().';
