/* ==========================================================
   accounts.js - sign up / log in / sessions / profiles / saved state
   Two modes, same API:
   - Supabase (when db.js is configured: DB.enabled()): logins are Supabase Auth accounts,
     profiles live in the `profiles` table (others are read from `public_profiles`), so one
     account works on every device. Accounts.init() loads your profile and the directory once,
     and every function below answers from that copy, so the rest of the site stays synchronous.
   - This browser only (no config, or Supabase can't load): accounts in localStorage, passwords
     hashed with Argon2id (argon2id.js), exactly as before.
   Test bots (testbot.js) are always local. Saved state (preferences, likes, model) is still per
   browser in both modes; it moves to the user_state table in a later step.

   Profiles and roles: one account can be both kinds of user.
     "student"  = looking for a room (a customer of landowners)
     "owner"    = a landowner: owns or manages a place. Anyone who lists a place
                  on DormNamo counts as a landowner automatically.
   Public profile = name, roles, "about" text, school, member since, and the phone
   only if the person chose to show it. Email and the password never leave
   the account's own view.
   ========================================================== */
var Accounts = (function () {
  var ACCOUNTS_KEY = "dormnamo:accounts";
  var SESSION_KEY = "dormnamo:session";
  var STATE_PREFIX = "dormnamo:state:";
  var SB_KEY = "dormnamo:sb-auth"; // where supabase-js keeps its session (db.js storageKey)
  var CARRY_KEY = "dormnamo:carry"; // an older this-browser account whose preferences move to the new login

  function read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }
  function drop(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  // Legacy only: old accounts used salted SHA-256 and are upgraded to Argon2id on next login.
  function hash(password, salt) {
    var bytes = new TextEncoder().encode(salt + password);
    if (window.crypto && crypto.subtle) {
      return crypto.subtle.digest("SHA-256", bytes).then(function (buf) {
        return Array.from(new Uint8Array(buf))
          .map(function (b) {
            return b.toString(16).padStart(2, "0");
          })
          .join("");
      });
    }
    var h = 5381;
    bytes.forEach(function (b) {
      h = ((h << 5) + h + b) >>> 0;
    });
    return Promise.resolve("weak" + h);
  }

  function tab(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key)) || null;
    } catch (e) {
      return null;
    }
  }
  var ROLES = ["student", "owner"];
  function cleanRoles(r) {
    r = (Array.isArray(r) ? r : []).filter(function (x) {
      return ROLES.indexOf(x) >= 0;
    });
    return r.length ? r : ["student"];
  }
  /** Places this account listed on DormNamo (listings.js), newest first. */
  function placesOf(id) {
    return window.Listings
      ? Listings.all()
          .filter(function (r) {
            return r.uid === id;
          })
          .sort(function (a, b) {
            return (b.upd || b.at) - (a.upd || a.at);
          })
      : [];
  }
  /** Sign-up time of older accounts, read from their id ("u" + Date.now() in base 36); 0 when unknown. */
  function idTime(id) {
    var t = parseInt(String(id).slice(1), 36);
    return t > 1.5e12 && t < Date.now() + 864e5 ? t : 0;
  }
  /** What everyone may see about an account. */
  function publicOf(u) {
    var places = placesOf(u.id),
      roles = cleanRoles(u.roles);
    if (places.length && roles.indexOf("owner") < 0) roles = roles.concat("owner"); // listing a place makes you a landowner
    return {
      id: u.id,
      name: u.name,
      roles: roles,
      owner: roles.indexOf("owner") >= 0,
      bot: !!u.bot, // a test bot (shared/js/account/testbot.js), never a real person
      student: roles.indexOf("student") >= 0,
      bio: u.bio || "",
      school: u.school || "",
      phone: u.showPhone && u.phone ? u.phone : "",
      joined: u.joined || idTime(u.id),
      places: places.map(function (r) {
        return r.id;
      }),
    };
  }
  /** One line that sorts an account into a category, e.g. "Landowner · 2 places · also looking for a room". */
  function describe(p) {
    if (!p) return "";
    var n = p.places.length,
      bits = p.bot ? ["Test bot"] : [];
    if (p.owner) {
      bits.push("Landowner");
      bits.push(n ? n + (n === 1 ? " place" : " places") + " on DormNamo" : "no places listed yet");
      if (p.student) bits.push("also looking for a room");
    } else bits.push("Student · looking for a room");
    if (p.school) bits.push("near " + p.school);
    return bits.join(" · ");
  }
  function byId(id) {
    var all = read(ACCOUNTS_KEY, {});
    for (var k in all) if (all[k].id === id) return { key: k, user: all[k], all: all };
    return null;
  }

  function startSession(user) {
    var s = { id: user.id, name: user.name, email: user.email || "" };
    if (user.cloud) s.cloud = true;
    write(SESSION_KEY, s);
    return read(SESSION_KEY, null) || s;
  }

  /** Shared checks for the sign-up form. Returns an error message or "". */
  function signUpProblem(name, email, password) {
    if (!String(name || "").trim()) return "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(email)) return "Enter a valid email address.";
    if (String(password || "").length < 8) return "Password must be at least 8 characters.";
    return "";
  }

  /* ---------- saved state (preferences, likes, model): this browser, both modes ---------- */
  function loadState(userId) {
    var k = STATE_PREFIX + userId;
    if (window.Consent && !Consent.prefs()) return tab(k);
    return read(k, null) || tab(k);
  }
  function saveState(userId, state) {
    var k = STATE_PREFIX + userId;
    if (window.Consent && !Consent.prefs()) {
      try {
        sessionStorage.setItem(k, JSON.stringify(state));
      } catch (e) {}
      return;
    }
    write(k, state);
    try {
      sessionStorage.removeItem(k);
    } catch (e) {}
  }

  /* ==========================================================
     Supabase mode
     ========================================================== */
  var cloud = { on: false, client: null, me: null, people: [], recovery: false };

  /** profiles / public_profiles row -> the account shape the rest of this file uses */
  function fromRow(r, own) {
    return {
      id: r.id,
      name: r.name || "DormNamo user",
      roles: cleanRoles(r.roles),
      bio: r.bio || "",
      school: r.school || "",
      phone: r.phone || "",
      showPhone: own ? !!r.show_phone : !!r.phone, // public_profiles already hides a phone that isn't shown
      joined: r.created_at ? Date.parse(r.created_at) || 0 : 0,
      cloud: true,
    };
  }
  /** Supabase Auth / database errors -> a sentence for the form (never the raw server text). */
  function authMessage(err) {
    var m = String((err && (err.message || err.code || err.name)) || "");
    if (/already (been )?registered|already exists|user_already_exists/i.test(m))
      return "An account with this email already exists. Log in instead.";
    if (/invalid login credentials|invalid_credentials/i.test(m)) return "Wrong email or password.";
    if (/not confirmed|email_not_confirmed/i.test(m))
      return "Confirm your email first: open the link we sent you, then log in.";
    if (/password/i.test(m) && /(least|short|weak|characters|strength)/i.test(m))
      return "Choose a stronger password: at least 8 characters, not easy to guess.";
    if (/rate limit|too many|over_email_send_rate_limit|429/i.test(m))
      return "Too many tries. Wait a minute, then try again.";
    if (/fetch|network|failed to|timeout/i.test(m))
      return window.DB ? DB.message("offline") : "Can't connect.";
    return "Something went wrong. Try again.";
  }
  function loadPeople() {
    return cloud.client
      .from("public_profiles")
      .select("*")
      .then(function (r) {
        if (!r.error && r.data)
          cloud.people = r.data.map(function (x) {
            return fromRow(x, false);
          });
      })
      .catch(function () {});
  }
  function loadMe(user) {
    return cloud.client
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(
        function (r) {
          return r && r.data;
        },
        function () {
          return null;
        },
      )
      .then(function (row) {
        var meta = user.user_metadata || {};
        cloud.me = fromRow(
          row || {
            id: user.id,
            name: meta.name || String(user.email || "").split("@")[0],
            roles: meta.roles,
            created_at: user.created_at,
          },
          true,
        );
        cloud.me.email = user.email || "";
        return startSession(cloud.me);
      });
  }
  /** After a log-in or sign-up: load your profile and the directory, move older preferences over. */
  function signedIn(user) {
    return Promise.all([loadMe(user), loadPeople()]).then(function () {
      carryState(cloud.me.id);
      return read(SESSION_KEY, null);
    });
  }
  /** Your preferences and likes from an older this-browser account follow you to your new login, once. */
  function carryState(newId) {
    var from = null;
    try {
      from = sessionStorage.getItem(CARRY_KEY);
      sessionStorage.removeItem(CARRY_KEY);
    } catch (e) {}
    if (!from || from === newId || loadState(newId)) return;
    var old = loadState(from);
    if (old) saveState(newId, old);
  }

  /** Connect to Supabase if configured. Resolves true in Supabase mode, false when local. Safe to call again. */
  var started = null;
  function init() {
    if (started) return started;
    if (!window.DB || !DB.enabled()) return (started = Promise.resolve(false));
    // a password-reset link lands here with "type=recovery" in the address
    cloud.recovery = /(^|[#&?])type=recovery(&|$)/.test(location.hash + "&" + location.search);
    started = DB.ready().then(function (c) {
      if (!c) return false;
      cloud.on = true;
      cloud.client = c;
      c.auth.onAuthStateChange(function (ev) {
        if (ev === "PASSWORD_RECOVERY") cloud.recovery = true;
        if (ev === "SIGNED_OUT") cloud.me = null;
      });
      var s = read(SESSION_KEY, null);
      return c.auth.getSession().then(
        function (r) {
          var user = r && r.data && r.data.session && r.data.session.user;
          if (user)
            return Promise.all([loadMe(user), loadPeople()]).then(function () {
              return true;
            });
          // not logged in to Supabase: an older this-browser account is retired (its preferences
          // move to the new login once you sign up); guests stay guests
          if (s && s.id !== "guest") {
            if (!s.cloud)
              try {
                sessionStorage.setItem(CARRY_KEY, s.id);
              } catch (e) {}
            drop(SESSION_KEY);
          }
          return loadPeople().then(function () {
            return true;
          });
        },
        function () {
          return true;
        },
      );
    });
    return started;
  }

  return {
    init: init,
    /** true when accounts are Supabase logins (any device); false = this browser only. */
    cloud: function () {
      return cloud.on;
    },

    /** The logged-in user ({id, name, email}) or null. */
    current: function () {
      return read(SESSION_KEY, null);
    },

    signUp: function (name, email, password, roles) {
      email = String(email || "")
        .trim()
        .toLowerCase();
      var problem = signUpProblem(name, email, password);
      if (problem) return Promise.reject(new Error(problem));
      if (cloud.on)
        return cloud.client.auth
          .signUp({
            email: email,
            password: password,
            options: {
              data: { name: String(name).trim().slice(0, 60), roles: cleanRoles(roles) },
              emailRedirectTo: pageUrl("home"),
            },
          })
          .then(function (r) {
            if (r.error) throw new Error(authMessage(r.error));
            var u = r.data && r.data.user;
            // with email confirmation on, Supabase answers an existing email with a user that has no identities
            if (u && u.identities && !u.identities.length)
              throw new Error("An account with this email already exists. Log in instead.");
            if (!r.data.session) {
              var wait = new Error(
                "Almost done: we sent a confirmation link to " + email + ". Open it, then log in here.",
              );
              wait.info = true;
              throw wait;
            }
            return signedIn(r.data.session.user);
          });

      var all = read(ACCOUNTS_KEY, {});
      if (all[email]) return Promise.reject(new Error("An account with this email already exists."));
      return Argon2id.hash(password).then(function (encoded) {
        var user = {
          id: "u" + Date.now().toString(36),
          name: String(name).trim(),
          email: email,
          hash: encoded,
          roles: cleanRoles(roles),
          joined: Date.now(),
        };
        all[email] = user;
        write(ACCOUNTS_KEY, all);
        return startSession(user);
      });
    },

    logIn: function (email, password) {
      email = String(email || "")
        .trim()
        .toLowerCase();
      if (cloud.on)
        return cloud.client.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
          if (r.error) throw new Error(authMessage(r.error));
          return signedIn(r.data.user);
        });

      var all = read(ACCOUNTS_KEY, {}),
        user = all[email];
      var bad = new Error("Wrong email or password.");
      if (!user || user.bot) return Promise.reject(bad); // test bots have no password
      if (user.hash.indexOf("$argon2id$") === 0) {
        return Argon2id.verify(password, user.hash).then(function (ok) {
          if (!ok) throw bad;
          return startSession(user);
        });
      }
      // Older accounts (salted SHA-256): check once, then upgrade to Argon2id.
      return hash(password, user.salt).then(function (h) {
        if (h !== user.hash) throw bad;
        return Argon2id.hash(password).then(function (encoded) {
          user.hash = encoded;
          delete user.salt;
          all[email] = user;
          write(ACCOUNTS_KEY, all);
          return startSession(user);
        });
      });
    },

    /* ---------- forgotten password (Supabase mode) ---------- */
    /** Email a reset link. Always answers the same, so nobody can test which emails have accounts. */
    resetPassword: function (email) {
      email = String(email || "")
        .trim()
        .toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email))
        return Promise.reject(new Error("Enter the email you signed up with."));
      if (!cloud.on) return Promise.reject(new Error("Password reset needs the online accounts."));
      return cloud.client.auth
        .resetPasswordForEmail(email, { redirectTo: pageUrl("home") })
        .then(function (r) {
          if (r && r.error && /rate limit|too many|429/i.test(String(r.error.message)))
            throw new Error(authMessage(r.error));
          return true;
        });
    },
    /** True right after someone opened a password-reset link. */
    recovering: function () {
      return cloud.on && cloud.recovery;
    },
    /** Set a new password (from the reset link), then you're logged in. */
    setPassword: function (password) {
      if (String(password || "").length < 8)
        return Promise.reject(new Error("Password must be at least 8 characters."));
      return cloud.client.auth.updateUser({ password: password }).then(function (r) {
        if (r.error) throw new Error(authMessage(r.error));
        cloud.recovery = false;
        try {
          history.replaceState(null, "", location.pathname + location.search);
        } catch (e) {}
        return signedIn(r.data.user);
      });
    },

    /* ---------- profiles ---------- */
    /** Public profile of any account ({id, name, roles, owner, student, bio, school, phone, joined, places}) or null. */
    person: function (id) {
      var f = byId(id);
      if (f && (!cloud.on || f.user.bot)) return publicOf(f.user);
      if (cloud.on) {
        for (var i = 0; i < cloud.people.length; i++)
          if (cloud.people[i].id === id) return publicOf(cloud.people[i]);
        if (cloud.me && cloud.me.id === id) return publicOf(cloud.me);
      }
      return null;
    },
    /** Every account's public profile, landowners first, then by name. */
    people: function () {
      var all = read(ACCOUNTS_KEY, {}),
        list = Object.keys(all)
          .map(function (k) {
            return all[k];
          })
          .filter(function (u) {
            return !cloud.on || u.bot; // in Supabase mode only the test bots stay local
          });
      if (cloud.on) list = cloud.people.concat(list);
      return list.map(publicOf).sort(function (a, b) {
        return b.owner - a.owner || a.name.localeCompare(b.name);
      });
    },
    owners: function () {
      return this.people().filter(function (p) {
        return p.owner;
      });
    },
    /** The logged-in account's own view: the public profile plus email, phone and settings. */
    me: function () {
      var s = read(SESSION_KEY, null),
        u = null;
      if (cloud.on) u = s && cloud.me && cloud.me.id === s.id ? cloud.me : null;
      else {
        var f = s && byId(s.id);
        u = f && f.user;
      }
      if (!u) return null;
      var p = publicOf(u);
      p.email = u.email;
      p.phone = u.phone || "";
      p.showPhone = !!u.showPhone;
      p.setRoles = cleanRoles(u.roles);
      return p;
    },
    /** Save the logged-in account's profile: {name, bio, school, phone, showPhone, roles}. */
    updateProfile: function (fields) {
      if (fields.name != null && !String(fields.name).trim())
        return Promise.reject(new Error("Please enter your name."));
      if (cloud.on) {
        if (!cloud.me) return Promise.reject(new Error("Log in with an account to edit a profile."));
        var row = {};
        if (fields.name != null) row.name = String(fields.name).trim().slice(0, 60);
        if (fields.bio != null) row.bio = String(fields.bio).trim().slice(0, 280);
        if (fields.school != null) row.school = String(fields.school);
        if (fields.phone != null) row.phone = String(fields.phone).trim();
        if (fields.showPhone != null) row.show_phone = !!fields.showPhone;
        if (fields.roles) row.roles = cleanRoles(fields.roles);
        return cloud.client
          .from("profiles")
          .update(row)
          .eq("id", cloud.me.id)
          .select()
          .single()
          .then(function (r) {
            if (r.error || !r.data) throw new Error(window.DB ? DB.message("error") : "Couldn't save.");
            var email = cloud.me.email;
            cloud.me = fromRow(r.data, true);
            cloud.me.email = email;
            return loadPeople().then(function () {
              return startSession(cloud.me);
            });
          });
      }
      var s = read(SESSION_KEY, null),
        f = s && byId(s.id);
      if (!f) return Promise.reject(new Error("Log in with an account to edit a profile."));
      var u = f.user;
      if (fields.name != null) u.name = String(fields.name).trim().slice(0, 60);
      if (fields.bio != null) u.bio = String(fields.bio).trim().slice(0, 280);
      if (fields.school != null) u.school = String(fields.school);
      if (fields.phone != null) u.phone = String(fields.phone).trim();
      if (fields.showPhone != null) u.showPhone = !!fields.showPhone;
      if (fields.roles) u.roles = cleanRoles(fields.roles);
      f.all[f.key] = u;
      write(ACCOUNTS_KEY, f.all);
      return Promise.resolve(startSession(u));
    },
    /** Delete your own account (Supabase mode, via the delete-account Edge Function). */
    deleteAccount: function () {
      if (!cloud.on || !cloud.me)
        return Promise.reject(new Error("Only online accounts can be deleted here."));
      var id = cloud.me.id;
      return DB.deleteAccount().then(function (r) {
        if (r.error) throw new Error(DB.message(r.error));
        drop(STATE_PREFIX + id);
        drop(SESSION_KEY);
        drop(SB_KEY);
        cloud.me = null;
        return true;
      });
    },
    describe: describe,
    /** Test bot accounts (testbot.js): no password, so nobody can log in as one. Always local. */
    addBot: function (b) {
      var all = read(ACCOUNTS_KEY, {}),
        key = b.email || b.id + "@bot.dormnamo";
      all[key] = {
        id: b.id,
        name: b.name,
        email: key,
        hash: "!bot",
        bot: true,
        roles: cleanRoles(b.roles),
        bio: b.bio || "",
        joined: all[key] && all[key].joined ? all[key].joined : Date.now(),
      };
      write(ACCOUNTS_KEY, all);
      return publicOf(all[key]);
    },
    removeBot: function (id) {
      var all = read(ACCOUNTS_KEY, {});
      Object.keys(all).forEach(function (k) {
        if (all[k].id === id && all[k].bot) delete all[k];
      });
      write(ACCOUNTS_KEY, all);
    },

    guest: function () {
      return startSession({ id: "guest", name: "Guest" });
    },
    /** Log out. Returns a promise: wait for it before reloading (Supabase signs out on its server). */
    logOut: function () {
      drop(SESSION_KEY);
      if (!cloud.on) return Promise.resolve();
      cloud.me = null;
      var done = cloud.client.auth.signOut().catch(function () {});
      return Promise.race([
        done,
        new Promise(function (r) {
          setTimeout(r, 1500);
        }),
      ]).then(function () {
        drop(SB_KEY); // never stay logged in, even if the server didn't answer
      });
    },

    /** Per-user saved data: preferences, likes, passes, bookmarks, model weights.
        Kept in this browser only if the student accepted preference cookies (consent.js);
        otherwise only for this tab (sessionStorage), gone when it closes. */
    loadState: loadState,
    saveState: saveState,
    /** "Essential only": delete every saved preference state in this browser (accounts and log-in stay). */
    forgetStates: function () {
      try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
          var k = localStorage.key(i);
          if (k && k.indexOf(STATE_PREFIX) === 0) localStorage.removeItem(k);
        }
      } catch (e) {}
    },
  };
})();
