// delete-account - Supabase Edge Function: a logged-in person deletes their own account.
// The browser can't do this itself: deleting a login needs the service role key, which exists
// only here on the server (Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY to every Edge Function; nothing to configure).
//
// Deletes: their listing photos (Storage), then the login. The database cascades the rest:
// profile, listings, saved state, comments, hearts, plan. Messages they sent stay in the other
// person's chat with no sender.
//
// Deploy: npx supabase functions deploy delete-account
// Call:   supabase.functions.invoke("delete-account", { method: "POST" })   (from shared/js/app/db.js)
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";

  // who is asking: checked with their own token, never trusted from the request body
  const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: who, error } = await asUser.auth.getUser();
  if (error || !who?.user) return json(401, { error: "login_required" });
  const uid = who.user.id;

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // their listing photos live under listing-photos/<uid>/ (one folder per listing inside)
  const bucket = admin.storage.from("listing-photos");
  const paths: string[] = [];
  async function collect(prefix: string) {
    const { data } = await bucket.list(prefix, { limit: 1000 });
    for (const item of data ?? []) {
      const p = prefix + "/" + item.name;
      if (item.id)
        paths.push(p); // a file
      else await collect(p); // a folder
    }
  }
  await collect(uid);
  for (let i = 0; i < paths.length; i += 100) await bucket.remove(paths.slice(i, i + 100));

  const { error: delError } = await admin.auth.admin.deleteUser(uid);
  if (delError) return json(500, { error: "delete_failed" });
  return json(200, { deleted: true, photos: paths.length });
});
