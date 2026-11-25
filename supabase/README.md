# supabase/ — DormNamo's backend

The database, its security rules and the server functions for the Supabase project. The website
itself stays static: browsers talk to Supabase directly with the public anon key, and the rules
here decide what each logged-in person may read or change.

| File | Purpose |
|---|---|
| `migrations/` | The backend, in order. Each file is safe to run again and never drops data (the first version was made by hand, so they only add what's missing). |
| `setup.sql` | All migrations in one file, made by `npm run db:bundle`. Paste it into the SQL editor. Don't edit it by hand. |
| `admin.sql` | Team-only snippets: give someone Owner Pro, feature a place, hide a listing, list users, check RLS. |
| `functions/delete-account/` | Edge Function: a person deletes their own account (needs the service role, so it can't run in the browser). |
| `tests/rules.mjs` | `npm run db:test`: runs the migrations on a real Postgres in Node (PGlite) and checks 38 rules. |

## Migrations

| # | File | What it adds |
|---|---|---|
| 01 | `…0100_tables.sql` | Tables: profiles, listings, user_state, threads, messages, comments, hearts, subscriptions, boosts; indexes; data checks (rent range, roles, message length…). |
| 02 | `…0200_accounts.sql` | A profile on every sign-up; you read and edit only your own profile; `public_profiles` shows others without email or a hidden phone. |
| 03 | `…0300_listings_and_plans.sql` | Listing rules; **2 places on Basic, 5 on Owner Pro, checked on the server**; listing makes you a landowner; 3 Featured spots per barangay; `featured_listings`, `featured_spots_left()`. |
| 04 | `…0400_messaging.sql` | Chats only members see; deals only through functions (bodies in the hidden `private` schema, thin public versions the site calls): `start_interest`, `start_dm`, `send_offer`, `answer_offer`, `close_thread`, `leave_group`, `remove_tenant`, `mark_read`; Realtime for messages and threads. |
| 05 | `…0500_comments_hearts_state.sql` | Private saved state; comments; one star rating per person (latest wins), none for your own place; `comment_stats`, `heart_counts`. |
| 06 | `…0600_storage.sql` | `listing-photos` (public view, owners write in their own folder) and `chat-photos` (private to the chat's members); images up to 5 MB. |
| 07 | `…0700_grants.sql` | Exactly which tables and columns the browser key may touch. `plan`, `f` (Featured), `subscriptions` and `boosts` are server-only. |
| 08 | `…0800_descriptions.sql` | A description on every table and column, shown in the Table Editor and Schema Visualizer. |

## Rules the server enforces

- You only see your own profile row; others see your name, roles, bio and school, and your phone only if you chose to show it.
- A new listing past your plan's limit fails with `listing_limit`. Owners can't change `plan`, `f` or `owner_id`.
- Plans and boosts are written only by the team or a payment function, never by the browser.
- In a chat, only members read and write. Offers, accepting and closing go through functions: only the other side can accept, only the landowner can close, a newer offer replaces the open one, and an agreed deal adds the student to the place's tenant group.
- Comments: one rating per person per place; owners can't rate their own place.
- Deleting an account keeps the other side's messages (the sender becomes empty).

Errors come back as short codes (`listing_limit`, `not_a_member`, …); `DB.message(code)` in
`shared/js/app/db.js` turns them into sentences for the page.

## Set it up or update it

**SQL editor (easiest).** Run `npm run db:bundle`, open `supabase/setup.sql`, copy all of it into
Supabase → SQL Editor → New query, and click Run. Run it again after any change to a migration.

**Supabase CLI (optional).**
```
npx supabase login
npx supabase link --project-ref <your project ref>
npx supabase db push
npx supabase functions deploy delete-account
```

**Check it.** `npm install` once (for the test's Postgres), then `npm run db:test`. In Supabase,
the last query in `admin.sql` should show `rls_on = true` for every table.

**Site settings.** `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env`, then `npm run config`. Never
put the service_role key in `.env` for the site or anywhere in the browser code.

## Next steps (browser side)

`shared/js/app/db.js` connects to this backend. Each module moves onto it while keeping its own
API, in this order: Accounts (Supabase Auth) → Listings + photos → user_state → Inbox (functions
above + Realtime) → Comments → Hearts. Online payments would be one more Edge Function that writes
`subscriptions` and `boosts` after the payment provider confirms.
