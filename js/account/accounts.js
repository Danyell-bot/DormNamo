/* ==========================================================
   accounts.js - sign up / log in / sessions / saved state
   Passwords are hashed with Argon2id (argon2id.js). Everything is stored in this browser's localStorage so the
   site works with no server. To use a real backend, replace
   the bodies of the functions in `Accounts` (keep the names).

   Profiles and roles: one account can be both kinds of user.
     "student"  = looking for a room (a customer of landowners)
     "owner"    = a landowner: owns or manages a place. Anyone who lists a place
                  on DormNamo counts as a landowner automatically.
   Public profile = name, roles, "about" text, school, member since, and the phone
   only if the person chose to show it. Email and the password hash never leave
   the account's own view.
   ========================================================== */
var Accounts = (function () {
  var ACCOUNTS_KEY = "dormnamo:accounts";
  var SESSION_KEY = "dormnamo:session";
  var STATE_PREFIX = "dormnamo:state:";

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
      bot: !!u.bot, // a test bot (js/account/testbot.js), never a real person
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
    write(SESSION_KEY, { id: user.id, name: user.name, email: user.email || "" });
    return read(SESSION_KEY, null);
  }

  return {
    /** The logged-in user ({id, name, email}) or null. */
    current: function () {
      return read(SESSION_KEY, null);
    },

    signUp: function (name, email, password, roles) {
      email = email.trim().toLowerCase();
      var all = read(ACCOUNTS_KEY, {});
      if (!name.trim()) return Promise.reject(new Error("Please enter your name."));
      if (!/^\S+@\S+\.\S+$/.test(email)) return Promise.reject(new Error("Enter a valid email address."));
      if (password.length < 8) return Promise.reject(new Error("Password must be at least 8 characters."));
      if (all[email]) return Promise.reject(new Error("An account with this email already exists."));
      return Argon2id.hash(password).then(function (encoded) {
        var user = {
          id: "u" + Date.now().toString(36),
          name: name.trim(),
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
      email = email.trim().toLowerCase();
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

    /* ---------- profiles ---------- */
    /** Public profile of any account ({id, name, roles, owner, student, bio, school, phone, joined, places}) or null. */
    person: function (id) {
      var f = byId(id);
      return f ? publicOf(f.user) : null;
    },
    /** Every account's public profile, landowners first, then by name. */
    people: function () {
      var all = read(ACCOUNTS_KEY, {});
      return Object.keys(all)
        .map(function (k) {
          return publicOf(all[k]);
        })
        .sort(function (a, b) {
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
        f = s && byId(s.id);
      if (!f) return null;
      var p = publicOf(f.user);
      p.email = f.user.email;
      p.phone = f.user.phone || "";
      p.showPhone = !!f.user.showPhone;
      p.setRoles = cleanRoles(f.user.roles);
      return p;
    },
    /** Save the logged-in account's profile: {name, bio, school, phone, showPhone, roles}. */
    updateProfile: function (fields) {
      var s = read(SESSION_KEY, null),
        f = s && byId(s.id);
      if (!f) return Promise.reject(new Error("Log in with an account to edit a profile."));
      var u = f.user;
      if (fields.name != null) {
        if (!String(fields.name).trim()) return Promise.reject(new Error("Please enter your name."));
        u.name = String(fields.name).trim().slice(0, 60);
      }
      if (fields.bio != null) u.bio = String(fields.bio).trim().slice(0, 280);
      if (fields.school != null) u.school = String(fields.school);
      if (fields.phone != null) u.phone = String(fields.phone).trim();
      if (fields.showPhone != null) u.showPhone = !!fields.showPhone;
      if (fields.roles) u.roles = cleanRoles(fields.roles);
      f.all[f.key] = u;
      write(ACCOUNTS_KEY, f.all);
      return Promise.resolve(startSession(u));
    },
    describe: describe,
    /** Test bot accounts (testbot.js): no password, so nobody can log in as one. */
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
    logOut: function () {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (e) {}
    },

    /** Per-user saved data: preferences, likes, passes, bookmarks, model weights.
        Kept in this browser only if the student accepted preference cookies (consent.js);
        otherwise only for this tab (sessionStorage), gone when it closes. */
    loadState: function (userId) {
      var k = STATE_PREFIX + userId;
      if (window.Consent && !Consent.prefs()) return tab(k);
      return read(k, null) || tab(k);
    },
    saveState: function (userId, state) {
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
    },
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
