/* ==========================================================
   accounts.js - sign up / log in / sessions / saved state
   Passwords are hashed with Argon2id (argon2id.js). Everything is stored in this browser's localStorage so the
   site works with no server. To use a real backend, replace
   the bodies of the functions in `Accounts` (keep the names).
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

  function startSession(user) {
    write(SESSION_KEY, { id: user.id, name: user.name, email: user.email || "" });
    return read(SESSION_KEY, null);
  }

  return {
    /** The logged-in user ({id, name, email}) or null. */
    current: function () {
      return read(SESSION_KEY, null);
    },

    signUp: function (name, email, password) {
      email = email.trim().toLowerCase();
      var all = read(ACCOUNTS_KEY, {});
      if (!name.trim()) return Promise.reject(new Error("Please enter your name."));
      if (!/^\S+@\S+\.\S+$/.test(email)) return Promise.reject(new Error("Enter a valid email address."));
      if (password.length < 8) return Promise.reject(new Error("Password must be at least 8 characters."));
      if (all[email]) return Promise.reject(new Error("An account with this email already exists."));
      return Argon2id.hash(password).then(function (encoded) {
        var user = { id: "u" + Date.now().toString(36), name: name.trim(), email: email, hash: encoded };
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
      if (!user) return Promise.reject(bad);
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

    guest: function () {
      return startSession({ id: "guest", name: "Guest" });
    },
    logOut: function () {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch (e) {}
    },

    /** Per-user saved data: preferences, likes, passes, bookmarks, model weights. */
    loadState: function (userId) {
      return read(STATE_PREFIX + userId, null);
    },
    saveState: function (userId, state) {
      write(STATE_PREFIX + userId, state);
    },
  };
})();
