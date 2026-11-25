-- 07 Grants: exactly what the browser's key may touch. Row Level Security then narrows it to
-- the right rows. Columns not listed (plan, f, owner_id on update, subscriptions, boosts) can only
-- be changed by the server: the SQL editor, an Edge Function or the service role.

grant usage on schema public to anon, authenticated;

-- start from nothing, then allow
revoke all on all tables in schema public from anon, authenticated;

-- public reading (logged out too)
grant select on public.listings, public.comments, public.hearts, public.boosts to anon, authenticated;
grant select on public.public_profiles, public.featured_listings, public.comment_stats, public.heart_counts
  to anon, authenticated;

-- your own profile
grant select on public.profiles to authenticated;
grant update (name, roles, bio, school, phone, show_phone, avatar_url) on public.profiles to authenticated;

-- your own listings (never plan / f; owner_id only when adding, and RLS makes it yours)
grant insert (owner_id, n, a, brgy, street, addr, s, t, p, c, ds, am, facts, requested_plan, pay,
              cover, photos, lat, lng, hidden) on public.listings to authenticated;
grant update (n, a, brgy, street, addr, s, t, p, c, ds, am, facts, requested_plan, pay,
              cover, photos, lat, lng, hidden) on public.listings to authenticated;
grant delete on public.listings to authenticated;

-- your saved state
grant select, insert, update, delete on public.user_state to authenticated;

-- chats: read; send text and photos; everything else through the functions
grant select on public.threads, public.messages to authenticated;
grant insert (thread_id, sender, kind, text, data) on public.messages to authenticated;

-- comments and hearts
grant insert (listing_ref, listing_id, user_id, text, stars) on public.comments to authenticated;
grant delete on public.comments to authenticated;
grant insert (user_id, listing_key) on public.hearts to authenticated;
grant delete on public.hearts to authenticated;

-- your plan (read only)
grant select on public.subscriptions to authenticated;

-- functions: the chat and plan helpers for logged-in people; nothing for anonymous visitors
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.start_interest(uuid),
  public.start_dm(uuid),
  public.send_offer(uuid, int, date, text),
  public.answer_offer(bigint, boolean),
  public.close_thread(uuid),
  public.leave_group(uuid),
  public.remove_tenant(uuid, uuid),
  public.mark_read(uuid),
  public.featured_spots_left(text)
to authenticated;
grant execute on function public.featured_spots_left(text) to anon;

-- public_profiles reads through this one function; the private schema is not exposed by the API
grant usage on schema private to anon, authenticated;
revoke execute on all functions in schema private from public;
grant execute on function private.public_profile_rows() to anon, authenticated;
-- the deal functions' bodies, reached only through their public versions
grant execute on function
  private.start_interest(uuid),
  private.start_dm(uuid),
  private.send_offer(uuid, int, date, text),
  private.answer_offer(bigint, boolean),
  private.close_thread(uuid),
  private.leave_group(uuid),
  private.remove_tenant(uuid, uuid),
  private.mark_read(uuid)
to authenticated;
