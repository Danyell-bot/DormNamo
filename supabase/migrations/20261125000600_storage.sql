-- 06 File storage
-- listing-photos: public to view (cards and the dialog show them), each owner writes only into
--   listing-photos/<their user id>/...
-- chat-photos: private; only the chat's members upload and view, at chat-photos/<thread id>/...
-- Both accept JPEG, PNG and WebP up to 5 MB (the site shrinks photos before upload anyway).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- listing photos (names match the first version, so re-running replaces them)
drop policy if exists "upload own photos" on storage.objects;
drop policy if exists "change own photos" on storage.objects;
drop policy if exists "delete own photos" on storage.objects;
create policy "upload own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "change own photos" on storage.objects for update to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- chat photos
drop policy if exists "chat photos: members upload" on storage.objects;
drop policy if exists "chat photos: members view" on storage.objects;
create policy "chat photos: members upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-photos'
    and exists (select 1 from public.threads t
                 where t.id::text = (storage.foldername(name))[1] and (select auth.uid()) = any (t.members)));
create policy "chat photos: members view" on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-photos'
    and exists (select 1 from public.threads t
                 where t.id::text = (storage.foldername(name))[1] and (select auth.uid()) = any (t.members)));
