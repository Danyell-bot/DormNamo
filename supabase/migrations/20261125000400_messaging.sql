-- 04 Messages and deals (Inbox in shared/js/account/inbox.js)
-- Members read their chats. Plain text and photos are inserted directly; everything that changes
-- a deal or who is in a chat goes through the functions below, which check the rules:
--   inquiry -> negotiating (any offer; a newer one replaces the open one)
--           -> agreed (the OTHER side answers yes; the student joins the place's tenant group)
--           -> declined (only the landowner closes)

alter table public.threads enable row level security;
drop policy if exists "member threads" on public.threads;
drop policy if exists "threads: members read" on public.threads;
create policy "threads: members read" on public.threads
  for select to authenticated using ((select auth.uid()) = any (members));

alter table public.messages enable row level security;
drop policy if exists "member messages" on public.messages;
drop policy if exists "send as yourself" on public.messages;
drop policy if exists "messages: members read" on public.messages;
drop policy if exists "messages: send text or photo" on public.messages;
create policy "messages: members read" on public.messages
  for select to authenticated using (
    exists (select 1 from public.threads t where t.id = thread_id and (select auth.uid()) = any (t.members)));
create policy "messages: send text or photo" on public.messages
  for insert to authenticated with check (
    sender = (select auth.uid())
    and kind in ('text', 'photo')
    and exists (select 1 from public.threads t where t.id = thread_id and (select auth.uid()) = any (t.members)));

-- a new message moves its chat to the top
create or replace function public.bump_thread()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.threads set updated_at = now() where id = new.thread_id;
  return new;
end $$;
drop trigger if exists bump_thread on public.messages;
create trigger bump_thread after insert on public.messages for each row execute function public.bump_thread();

-- "I'm interested · Message": open (or reuse) the chat with the place's landowner
create or replace function private.start_interest(p_listing uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  own uuid;
  tid uuid;
begin
  if me is null then raise exception 'login_required'; end if;
  select owner_id into own from public.listings where ref = p_listing and not coalesce(hidden, false);
  if own is null then raise exception 'no_landowner'; end if;
  if own = me then raise exception 'own_listing'; end if;

  select id into tid from public.threads
   where kind = 'dm' and listing_ref = p_listing and members @> array[me, own]
   limit 1;
  if tid is null then
    insert into public.threads (kind, listing_ref, members, roles, status)
    values ('dm', p_listing, array[me, own],
            jsonb_build_object(me::text, 'student', own::text, 'owner'), 'inquiry')
    returning id into tid;
    insert into public.messages (thread_id, sender, kind, text, data)
    values (tid, me, 'interest', '', jsonb_build_object('listing', p_listing));
  end if;
  return tid;
end $$;

-- a plain one-to-one chat with someone (Landowners page "Message")
create or replace function private.start_dm(p_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  tid uuid;
  role_of jsonb;
begin
  if me is null then raise exception 'login_required'; end if;
  if p_user is null or p_user = me then raise exception 'bad_person'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'bad_person'; end if;

  select id into tid from public.threads
   where kind = 'dm' and listing_ref is null and members @> array[me, p_user] and cardinality(members) = 2
   limit 1;
  if tid is null then
    select jsonb_object_agg(id::text, case when 'owner' = any (roles) then 'owner' else 'student' end)
      into role_of from public.profiles where id in (me, p_user);
    insert into public.threads (kind, listing_ref, members, roles, status)
    values ('dm', null, array[me, p_user], role_of, null)
    returning id into tid;
  end if;
  return tid;
end $$;

-- make an offer (rent, move-in date, note); replaces the open one
create or replace function private.send_offer(p_thread uuid, p_rent int, p_move date default null, p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t public.threads;
  mid bigint;
  o jsonb;
begin
  select * into t from public.threads where id = p_thread for update;
  if t.id is null or not (me = any (t.members)) then raise exception 'not_a_member'; end if;
  if t.kind <> 'dm' or t.listing_ref is null then raise exception 'no_deal_here'; end if;
  if t.status in ('agreed', 'declined') then raise exception 'deal_closed'; end if;
  if p_rent is null or p_rent < 0 or p_rent > 100000 then raise exception 'bad_rent'; end if;

  update public.messages set data = jsonb_set(data, '{state}', '"replaced"')
   where thread_id = p_thread and kind = 'offer' and data ->> 'state' = 'open';

  o := jsonb_build_object('rent', p_rent, 'move', p_move, 'note', left(p_note, 500), 'state', 'open');
  insert into public.messages (thread_id, sender, kind, text, data)
  values (p_thread, me, 'offer', '', o)
  returning id into mid;

  update public.threads
     set status = 'negotiating',
         offer = (o - 'state') || jsonb_build_object('by', me, 'message', mid)
   where id = p_thread;
  return mid;
end $$;

-- answer an offer: only the other side; yes = agreed and the student joins the tenant group
create or replace function private.answer_offer(p_message bigint, p_yes boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  m public.messages;
  t public.threads;
  own uuid;
  student uuid;
  g uuid;
begin
  select * into m from public.messages where id = p_message for update;
  if m.id is null or m.kind <> 'offer' then raise exception 'no_offer'; end if;
  select * into t from public.threads where id = m.thread_id for update;
  if not (me = any (t.members)) then raise exception 'not_a_member'; end if;
  if m.sender = me then raise exception 'answer_own_offer'; end if;
  if coalesce(m.data ->> 'state', '') <> 'open' then raise exception 'offer_not_open'; end if;

  if not p_yes then
    update public.messages set data = jsonb_set(data, '{state}', '"declined"') where id = m.id;
    return t.status;
  end if;

  update public.messages set data = jsonb_set(data, '{state}', '"accepted"') where id = m.id;
  update public.threads set status = 'agreed' where id = t.id;

  select owner_id into own from public.listings where ref = t.listing_ref;
  select x into student from unnest(t.members) as x where x <> own limit 1;

  select id into g from public.threads where kind = 'group' and listing_ref = t.listing_ref limit 1;
  if g is null then
    insert into public.threads (kind, listing_ref, members, roles, status)
    values ('group', t.listing_ref, array[own], jsonb_build_object(own::text, 'owner'), null)
    returning id into g;
  end if;
  if student is not null then
    update public.threads
       set members = array_append(members, student),
           roles = roles || jsonb_build_object(student::text, 'tenant')
     where id = g and not (student = any (members));
    insert into public.messages (thread_id, sender, kind, text) values (g, null, 'system', 'A new tenant joined.');
  end if;
  return 'agreed';
end $$;

-- the landowner ends a deal
create or replace function private.close_thread(p_thread uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t public.threads;
begin
  select * into t from public.threads where id = p_thread for update;
  if t.id is null or not (me = any (t.members)) then raise exception 'not_a_member'; end if;
  if coalesce(t.roles ->> me::text, '') <> 'owner' then raise exception 'landowner_only'; end if;
  update public.messages set data = jsonb_set(data, '{state}', '"declined"')
   where thread_id = p_thread and kind = 'offer' and data ->> 'state' = 'open';
  update public.threads set status = 'declined' where id = p_thread;
end $$;

-- a tenant leaves the group; the landowner can't leave their own place's group
create or replace function private.leave_group(p_thread uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t public.threads;
begin
  select * into t from public.threads where id = p_thread for update;
  if t.id is null or t.kind <> 'group' or not (me = any (t.members)) then raise exception 'not_a_member'; end if;
  if t.roles ->> me::text = 'owner' then raise exception 'owner_stays'; end if;
  update public.threads set members = array_remove(members, me), roles = roles - me::text where id = p_thread;
end $$;

-- the landowner removes a tenant from the group
create or replace function private.remove_tenant(p_thread uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  t public.threads;
begin
  select * into t from public.threads where id = p_thread for update;
  if t.id is null or t.kind <> 'group' or coalesce(t.roles ->> me::text, '') <> 'owner' then
    raise exception 'landowner_only';
  end if;
  if p_user = me then raise exception 'owner_stays'; end if;
  update public.threads set members = array_remove(members, p_user), roles = roles - p_user::text where id = p_thread;
end $$;

-- unread counts (Inbox.unread): remember when each member last read a chat
create or replace function private.mark_read(p_thread uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  update public.threads
     set read_at = read_at || jsonb_build_object(me::text, now())
   where id = p_thread and me = any (members);
end $$;

-- The functions above live in `private` (not reachable through the API) and run with extra rights.
-- The site calls these thin public versions, which run with the caller's own rights
-- (security invoker), as Supabase's security advisor recommends. Same names and arguments.
create or replace function public.start_interest(p_listing uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.start_interest(p_listing)
$$;
create or replace function public.start_dm(p_user uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select private.start_dm(p_user)
$$;
create or replace function public.send_offer(p_thread uuid, p_rent int, p_move date default null, p_note text default null)
returns bigint language sql security invoker set search_path = '' as $$
  select private.send_offer(p_thread, p_rent, p_move, p_note)
$$;
create or replace function public.answer_offer(p_message bigint, p_yes boolean)
returns text language sql security invoker set search_path = '' as $$
  select private.answer_offer(p_message, p_yes)
$$;
create or replace function public.close_thread(p_thread uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.close_thread(p_thread)
$$;
create or replace function public.leave_group(p_thread uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.leave_group(p_thread)
$$;
create or replace function public.remove_tenant(p_thread uuid, p_user uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.remove_tenant(p_thread, p_user)
$$;
create or replace function public.mark_read(p_thread uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.mark_read(p_thread)
$$;

-- live updates: the other person's browser hears new messages and deal changes
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'threads') then
      alter publication supabase_realtime add table public.threads;
    end if;
  end if;
end $$;
