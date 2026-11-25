/* ==========================================================
   db.js - the connection to the Supabase backend (supabase/ in the repo)
   Loaded on every app page right after config.js. It does nothing until
   DN_CONFIG has supabaseUrl + supabaseKey (npm run config); then it loads
   supabase-js on demand, so pages without Supabase don't pay for it.

   DB.enabled()          true when the site is configured for Supabase
   DB.ready()            Promise of the client, or null (not configured / offline)
   DB.rpc(name, args)    call a database function, e.g. DB.rpc("start_interest", {p_listing: ref})
   DB.deleteAccount()    the delete-account Edge Function
   DB.message(error)     a plain sentence for a backend error code (listing_limit, …)

   The modules that keep data (Accounts, Listings, Inbox, Comments, Hearts)
   move onto this one by one, keeping their own API; until then they use
   this browser's storage as before.
   ========================================================== */
var DB = (function () {
  var LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js";
  var cfg = (typeof window !== "undefined" && window.DN_CONFIG) || {},
    url = String(cfg.supabaseUrl || "").replace(/\/+$/, ""),
    key = String(cfg.supabaseKey || ""),
    on = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key.length > 20,
    pending = null;

  function enabled() {
    return on;
  }

  /** Load supabase-js once and make the client. Resolves null when Supabase is off or can't load. */
  function ready() {
    if (!on) return Promise.resolve(null);
    if (pending) return pending;
    pending = new Promise(function (resolve) {
      function make() {
        try {
          resolve(
            window.supabase.createClient(url, key, {
              auth: { persistSession: true, autoRefreshToken: true, storageKey: "dormnamo:sb-auth" },
            }),
          );
        } catch (e) {
          resolve(null);
        }
      }
      if (window.supabase && window.supabase.createClient) return make();
      var s = document.createElement("script");
      s.src = LIB;
      s.async = true;
      s.onload = make;
      s.onerror = function () {
        resolve(null);
      };
      document.head.appendChild(s);
    });
    return pending;
  }

  /** Call a database function. Resolves {data} or {error: code}. */
  function rpc(name, args) {
    return ready().then(function (c) {
      if (!c) return { error: "offline" };
      return c.rpc(name, args || {}).then(function (r) {
        return r.error ? { error: code(r.error) } : { data: r.data };
      });
    });
  }

  function deleteAccount() {
    return ready().then(function (c) {
      if (!c) return { error: "offline" };
      return c.functions.invoke("delete-account", { method: "POST" }).then(function (r) {
        return r.error ? { error: "delete_failed" } : { data: r.data };
      });
    });
  }

  /** The short code the database raises (supabase/migrations): "listing_limit", "not_a_member", … */
  function code(err) {
    var m = String((err && (err.message || err.code)) || "error");
    return /^[a-z_]+$/.test(m) ? m : "error";
  }

  var MESSAGES = {
    offline: "Can't reach DormNamo's server right now. Try again in a moment.",
    login_required: "Log in first.",
    listing_limit: "You've reached your plan's limit of places. Owner Pro lists up to 5.",
    no_featured_spots: "This barangay already has 3 Featured places. Try again when a spot frees up.",
    no_landowner: "This place has no landowner on DormNamo yet.",
    own_listing: "That's your own place.",
    not_a_member: "You're not part of this chat.",
    deal_closed: "This deal is already closed.",
    answer_own_offer: "Wait for the other side to answer your offer.",
    offer_not_open: "That offer was already answered or replaced.",
    landowner_only: "Only the landowner can do that.",
    owner_stays: "The landowner stays in their place's group.",
    bad_rent: "Enter a rent between ₱0 and ₱100,000.",
    delete_failed: "Your account couldn't be deleted. Try again.",
  };
  function message(c) {
    return MESSAGES[c] || "Something went wrong. Try again.";
  }

  return {
    enabled: enabled,
    ready: ready,
    rpc: rpc,
    deleteAccount: deleteAccount,
    message: message,
    code: code,
  };
})();
