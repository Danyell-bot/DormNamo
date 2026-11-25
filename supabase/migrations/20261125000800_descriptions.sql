-- 08 Descriptions: what every table and column is for. Supabase shows these in the Table Editor
-- and the Schema Visualizer, so the project documents itself. Safe to re-run.

-- schemas
comment on schema public is 'DormNamo app data, reachable through the API (protected by RLS and grants).';
comment on schema private is 'Helper functions the API does not expose.';

-- people
comment on table public.profiles is 'One row per login (made by handle_new_user). Others see people through public_profiles.';
comment on column public.profiles.id is 'Same id as auth.users.';
comment on column public.profiles.name is 'Display name, 1 to 80 characters.';
comment on column public.profiles.roles is 'student and/or owner (landowner). Listing a place adds owner.';
comment on column public.profiles.phone is 'Format 09XX XXX XXXX. Shown to others only when show_phone is true.';
comment on column public.profiles.show_phone is 'Let others see the phone number.';
comment on column public.profiles.avatar_url is 'Profile photo (optional).';

comment on table public.user_state is 'Each student''s private saved state: preferences, likes, passes, activity log, learning-model weights (the S object).';
comment on column public.user_state.state is 'JSON of S from shared/js/app/state.js, up to 300 KB.';

-- listings
comment on table public.listings is 'Places landowners add. Google Maps places stay in shared/js/data/data.js.';
comment on column public.listings.ref is 'Permanent reference number, shown as DN- plus its first 8 characters.';
comment on column public.listings.owner_id is 'The landowner. Set to the logged-in person when added; cannot be changed.';
comment on column public.listings.n is 'Name of the place.';
comment on column public.listings.a is 'Area shown on cards (the barangay).';
comment on column public.listings.brgy is 'Barangay in Iligan City.';
comment on column public.listings.street is 'Street or purok (optional).';
comment on column public.listings.addr is 'Full address made from street + barangay.';
comment on column public.listings.s is 'Nearest school (e.g. MSU-IIT).';
comment on column public.listings.t is 'Room type: Boarding house, Dormitory, Apartment…';
comment on column public.listings.p is 'Monthly rent in pesos. Empty = rate on request (never guessed).';
comment on column public.listings.c is 'Contact number.';
comment on column public.listings.ds is 'Description written by the landowner.';
comment on column public.listings.am is 'Amenities the landowner states (Wi-Fi, CR inside…).';
comment on column public.listings.facts is 'Facts the landowner states (water, curfew, gender…). A missing key means unknown.';
comment on column public.listings.requested_plan is 'Plan the landowner picked; becomes plan once paid.';
comment on column public.listings.plan is 'Plan in effect (basic, b7, b30, bsem, pro-m, pro-y). Server only.';
comment on column public.listings.pay is 'full or parts (pay in parts).';
comment on column public.listings.f is 'Featured right now. Server only.';
comment on column public.listings.cover is 'Cover photo URL (listing-photos bucket).';
comment on column public.listings.photos is 'Room photo URLs (listing-photos bucket).';
comment on column public.listings.lat is 'Map pin latitude.';
comment on column public.listings.lng is 'Map pin longitude.';
comment on column public.listings.hidden is 'Hidden from everyone but the landowner (e.g. paused or removed by the team).';

comment on table public.subscriptions is 'Owner Pro plans. Written only by the team (admin.sql) or a payment function. Active = up to 5 places.';
comment on table public.boosts is 'Featured boosts. Written only by the team or a payment function. At most 3 at a time per barangay.';
comment on column public.boosts.kind is 'b7 = 7 days, b30 = 30 days, bsem = semester.';

-- chats
comment on table public.threads is 'Chats. dm = one-to-one (may carry a deal); group = a place''s tenant group. Changed only through the deal functions.';
comment on column public.threads.kind is 'dm or group.';
comment on column public.threads.listing_ref is 'The place this chat is about (empty for a plain chat).';
comment on column public.threads.members is 'Who is in the chat. Only they can read it.';
comment on column public.threads.roles is 'Role of each member: owner, student or tenant.';
comment on column public.threads.status is 'Deal status: inquiry, negotiating, agreed, declined (empty for plain chats and groups).';
comment on column public.threads.offer is 'The open offer: rent, move-in date, note, who made it.';
comment on column public.threads.read_at is 'When each member last read the chat (for unread counts).';

comment on table public.messages is 'Messages in a chat. People send text and photos; offers, interest cards and system lines come from the deal functions.';
comment on column public.messages.kind is 'text, photo, interest, offer or system.';
comment on column public.messages.sender is 'Who sent it. Empty for system lines or a deleted account.';
comment on column public.messages.data is 'Extra details: photo URLs, or the offer (rent, move, note, state).';

-- feedback
comment on table public.comments is 'Comments on a place, with an optional 1-5 star rating. One rating per person per place (latest wins); owners can''t rate their own place.';
comment on column public.comments.listing_ref is 'For places landowners added.';
comment on column public.comments.listing_id is 'For Google Maps places (their id in data.js).';
comment on table public.hearts is 'Saved rooms (a heart = a Discover like). Counts are public; never part of the star rating.';
comment on column public.hearts.listing_key is 'Listing ref, or the Google Maps place id.';

-- views
comment on view public.featured_listings is 'Places Featured right now, with their barangay.';
comment on view public.comment_stats is 'Per place: number of comments, ratings and the average stars.';
comment on view public.heart_counts is 'Per place: number of hearts.';
