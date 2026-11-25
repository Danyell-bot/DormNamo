/* ==========================================================
   inbox.js - messages between students and landowners (every page)
   Two kinds of conversation:
     "dm"    one to one: a student who is interested in a place and its
             landowner (or any two accounts, from a profile). The first
             message is an "interest" card naming the place.
     "group" one per place: the landowner and the tenants who agreed a deal.
   Negotiation happens in the dm with "offer" messages (rent a month,
   move-in date, note). Either side can make one; the other side accepts or
   declines. An accepted offer makes the student a tenant: the dm is marked
   "agreed" and the student joins the place's tenant group chat.
   Status of a dm: inquiry -> negotiating -> agreed (or declined).
   Messages can carry photos (data.imgs: small JPEG data URLs, shrunk in the
   browser) and emojis (plain text). Test bot accounts (ids "bot-…", see
   shared/js/account/testbot.js) may post through the optional `as` argument;
   real accounts always post as the logged-in user.
   Stored in localStorage ("dormnamo:inbox" = {threads, msgs}), so it only
   exists in this browser, like accounts. To move to a real backend, replace
   load/store (and on() with a socket) and keep the API.
   ========================================================== */
var Inbox = (function () {
  var KEY = "dormnamo:inbox",
    MAX_PER_THREAD = 500,
    STATUS = {
      inquiry: "Interested",
      negotiating: "Negotiating",
      agreed: "Agreed · tenant",
      declined: "Closed",
    };

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.threads) && Array.isArray(d.msgs)) return d;
    } catch (e) {}
    return { threads: [], msgs: [] };
  }
  function store(d) {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch (e) {
      return false;
    }
    emit();
    return true;
  }
  function me() {
    return window.USER && USER.id !== "guest" ? USER.id : null;
  }
  /** Who is writing: the logged-in user, or a test bot when `as` names one ("bot-…"). */
  function who(as) {
    return as && /^bot-/.test(as) ? as : me();
  }
  var MAX_IMGS = 4;
  function newId(p) {
    return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ---------- who and what ---------- */
  /** The landowner account of a listing, or null (places from Google Maps have no account on DormNamo). */
  function ownerOf(listingId) {
    var r = window.Listings ? Listings.get(listingId) : null;
    return r && r.uid && r.uid !== "guest" ? { id: r.uid, name: r.owner || "Owner" } : null;
  }
  function house(id) {
    return id == null
      ? null
      : HOUSES.filter(function (h) {
          return h.id === id;
        })[0] || null;
  }
  function nameOf(uid) {
    var p = window.Accounts && Accounts.person ? Accounts.person(uid) : null;
    return p ? p.name : "Former member";
  }

  /* ---------- reading ---------- */
  function get(id, d) {
    return (
      (d || load()).threads.filter(function (t) {
        return t.id === id;
      })[0] || null
    );
  }
  function messages(id) {
    return load().msgs.filter(function (m) {
      return m.t === id;
    });
  }
  /** Conversations of the logged-in account, newest activity first, each with its last message and unread count. */
  function threads() {
    var uid = me();
    if (!uid) return [];
    var d = load();
    return d.threads
      .filter(function (t) {
        return t.members.indexOf(uid) >= 0;
      })
      .map(function (t) {
        var ms = d.msgs.filter(function (m) {
            return m.t === t.id;
          }),
          seen = (t.read || {})[uid] || 0;
        return {
          t: t,
          last: ms[ms.length - 1] || null,
          unread: ms.filter(function (m) {
            return m.at > seen && m.from !== uid;
          }).length,
        };
      })
      .sort(function (a, b) {
        return b.t.upd - a.t.upd;
      });
  }
  function unread() {
    return threads().reduce(function (n, x) {
      return n + x.unread;
    }, 0);
  }
  /** Role of an account in a conversation: "owner", "tenant" or "student". */
  function roleIn(t, uid) {
    return (t.roles || {})[uid] || "student";
  }
  /** The other person in a dm (for a group: null). */
  function other(t) {
    var uid = me();
    return t.type === "dm"
      ? t.members.filter(function (x) {
          return x !== uid;
        })[0] || null
      : null;
  }
  function title(t) {
    if (t.type === "group") {
      var h = house(t.listing);
      return (h ? h.n : t.name || "Place") + " tenants";
    }
    return nameOf(other(t));
  }

  /* ---------- writing ---------- */
  function post(d, t, from, kind, text, data) {
    var m = { id: newId("m"), t: t.id, from: from, kind: kind, text: text || "", at: Date.now() };
    if (data) m.data = data;
    d.msgs.push(m);
    // keep each conversation to its newest messages
    var mine = d.msgs.filter(function (x) {
      return x.t === t.id;
    });
    if (mine.length > MAX_PER_THREAD) {
      var drop = mine.slice(0, mine.length - MAX_PER_THREAD).map(function (x) {
        return x.id;
      });
      d.msgs = d.msgs.filter(function (x) {
        return drop.indexOf(x.id) < 0;
      });
    }
    t.upd = m.at;
    if (from) {
      t.read = t.read || {};
      t.read[from] = m.at; // you have read what you just wrote
    }
    return m;
  }
  /** Find or start the one-to-one chat between the logged-in account and `withId` (about a place, or general). */
  function dm(withId, listingId) {
    var uid = me();
    if (!uid) return { error: "account" };
    if (!withId || withId === uid) return { error: "self" };
    var d = load(),
      lid = listingId == null ? null : listingId,
      t = d.threads.filter(function (x) {
        return (
          x.type === "dm" &&
          x.listing === lid &&
          x.members.indexOf(uid) >= 0 &&
          x.members.indexOf(withId) >= 0
        );
      })[0];
    if (!t) {
      var own = lid != null ? ownerOf(lid) : null,
        roles = {};
      roles[uid] = own && own.id === uid ? "owner" : "student";
      roles[withId] = own && own.id === withId ? "owner" : "student";
      t = {
        id: newId("t"),
        type: "dm",
        listing: lid,
        members: [uid, withId],
        roles: roles,
        status: lid != null ? "inquiry" : null,
        at: Date.now(),
        upd: Date.now(),
        read: {},
      };
      d.threads.push(t);
      store(d);
    }
    return { thread: t };
  }
  /** "I'm interested": start (or reopen) the chat with the landowner of a place and send the interest card. */
  function interest(listingId, note) {
    var own = ownerOf(listingId),
      h = house(listingId);
    if (!own) return { error: "no-owner" };
    if (!me()) return { error: "account" };
    if (own.id === me()) return { error: "self" };
    var r = dm(own.id, listingId);
    if (r.error) return r;
    var d = load(),
      t = get(r.thread.id, d),
      before = d.msgs.some(function (m) {
        return m.t === t.id && m.kind === "interest";
      });
    if (!before || note)
      post(d, t, me(), "interest", note || "", {
        listing: listingId,
        ref: h && h.ref,
        name: h ? h.n : "",
        rent: h ? h.p : null,
      });
    if (t.status === "declined") t.status = "inquiry";
    store(d);
    return { thread: t };
  }
  /** Send text and/or photos: opts {imgs: [dataURL], as}. Returns the message, null, or {error: "full"}. */
  function send(id, text, opts) {
    opts = opts || {};
    text = String(text || "").trim();
    var imgs = (opts.imgs || [])
        .filter(function (u) {
          return /^data:image\/(jpeg|png|webp);base64,/.test(u);
        })
        .slice(0, MAX_IMGS),
      d = load(),
      t = get(id, d),
      uid = who(opts.as);
    if (!t || !uid || t.members.indexOf(uid) < 0 || (!text && !imgs.length)) return null;
    var m = post(d, t, uid, "text", text.slice(0, 2000), imgs.length ? { imgs: imgs } : null);
    if (!store(d)) return { error: "full" }; // browser storage (about 5 MB) is full: photos take the most
    return m;
  }
  /** An offer in a dm about a place: {rent, move, note}. Earlier open offers in the chat are replaced. */
  function offer(id, o, as) {
    var d = load(),
      t = get(id, d),
      uid = who(as);
    if (!t || t.type !== "dm" || t.listing == null || !uid || t.status === "agreed") return null;
    // any amount is fine; it only has to be a number (kept to centavos)
    var rent = Math.round(parseFloat(String(o.rent).replace(/,/g, "")) * 100) / 100;
    if (!isFinite(rent) || rent <= 0) return { error: "rent" };
    d.msgs.forEach(function (m) {
      if (m.t === id && m.kind === "offer" && m.data.state === "open") m.data.state = "replaced";
    });
    var m = post(d, t, uid, "offer", String(o.note || "").slice(0, 300), {
      rent: rent,
      move: o.move || "",
      state: "open",
    });
    t.status = "negotiating";
    store(d);
    return m;
  }
  /** Accept or decline an open offer made by the other side. Accepting adds the student to the tenant group. */
  function answer(msgId, yes, as) {
    var d = load(),
      m = d.msgs.filter(function (x) {
        return x.id === msgId;
      })[0],
      uid = who(as);
    if (!m || m.kind !== "offer" || m.data.state !== "open" || m.from === uid) return null;
    var t = get(m.t, d);
    if (!t || t.members.indexOf(uid) < 0) return null;
    m.data.state = yes ? "accepted" : "declined";
    post(
      d,
      t,
      null,
      "system",
      (yes ? "Offer accepted: " : "Offer declined: ") +
        "₱" +
        m.data.rent.toLocaleString("en-PH") +
        " a month.",
    );
    var g = null;
    if (yes) {
      t.status = "agreed";
      var student = t.members.filter(function (x) {
        return roleIn(t, x) !== "owner";
      })[0];
      g = joinGroup(d, t.listing, student);
      post(
        d,
        t,
        null,
        "system",
        nameOf(student) + " is now a tenant and joined the " + title(g) + " group chat.",
      );
    }
    store(d);
    return { thread: t, group: g };
  }
  /** The landowner closes a dm (no deal). */
  function close(id) {
    var d = load(),
      t = get(id, d),
      uid = me();
    if (!t || roleIn(t, uid) !== "owner" || t.status === "agreed") return null;
    t.status = "declined";
    post(d, t, null, "system", nameOf(uid) + " closed this inquiry.");
    store(d);
    return t;
  }
  /** Find or create the tenant group of a place and add a tenant (inside an open load/store). */
  function joinGroup(d, listingId, tenant) {
    var own = ownerOf(listingId),
      g = d.threads.filter(function (x) {
        return x.type === "group" && x.listing === listingId;
      })[0];
    if (!g) {
      var roles = {};
      if (own) roles[own.id] = "owner";
      g = {
        id: newId("g"),
        type: "group",
        listing: listingId,
        members: own ? [own.id] : [],
        roles: roles,
        at: Date.now(),
        upd: Date.now(),
        read: {},
      };
      d.threads.push(g);
      post(
        d,
        g,
        null,
        "system",
        "Group chat for the tenants of " + ((house(listingId) || {}).n || "this place") + ".",
      );
    }
    if (g.members.indexOf(tenant) < 0) {
      g.members.push(tenant);
      g.roles[tenant] = "tenant";
      post(d, g, null, "system", nameOf(tenant) + " joined as a tenant. Welcome!");
    }
    return g;
  }
  /** Leave a group (a tenant), or remove a tenant from it (the landowner). */
  function leave(id, uid) {
    var d = load(),
      g = get(id, d),
      by = me();
    uid = uid || by;
    if (!g || g.type !== "group" || g.members.indexOf(uid) < 0 || roleIn(g, uid) === "owner") return null;
    if (uid !== by && roleIn(g, by) !== "owner") return null;
    g.members.splice(g.members.indexOf(uid), 1);
    post(
      d,
      g,
      null,
      "system",
      nameOf(uid) + (uid === by ? " left the group." : " was removed by the landowner."),
    );
    store(d);
    return g;
  }
  /** Delete every conversation an account is in, with its messages (used to remove the test bot). */
  function forget(uid) {
    var d = load(),
      gone = {};
    d.threads = d.threads.filter(function (t) {
      if (t.members.indexOf(uid) < 0) return true;
      gone[t.id] = 1;
      return false;
    });
    d.msgs = d.msgs.filter(function (m) {
      return !gone[m.t];
    });
    store(d);
  }
  /** Mark a conversation read. quiet = don't notify listeners (used while the Messages page renders). */
  function markRead(id, quiet) {
    var d = load(),
      t = get(id, d),
      uid = me();
    if (!t || !uid) return;
    var last = d.msgs.filter(function (m) {
      return m.t === id;
    });
    var at = last.length ? last[last.length - 1].at : Date.now();
    if (((t.read || {})[uid] || 0) >= at) return;
    t.read = t.read || {};
    t.read[uid] = at;
    if (quiet)
      try {
        localStorage.setItem(KEY, JSON.stringify(d));
      } catch (e) {}
    else store(d);
  }

  /* ---------- live updates: other tabs write localStorage, this tab hears it ---------- */
  var subs = [];
  function on(fn) {
    subs.push(fn);
  }
  function emit() {
    subs.forEach(function (fn) {
      try {
        fn();
      } catch (e) {}
    });
  }
  if (window.addEventListener)
    window.addEventListener("storage", function (e) {
      if (e.key === KEY) emit();
    });

  return {
    STATUS: STATUS,
    ownerOf: ownerOf,
    house: house,
    nameOf: nameOf,
    get: function (id) {
      return get(id);
    },
    messages: messages,
    threads: threads,
    unread: unread,
    roleIn: roleIn,
    other: other,
    title: title,
    dm: dm,
    interest: interest,
    send: send,
    MAX_IMGS: MAX_IMGS,
    offer: offer,
    answer: answer,
    close: close,
    leave: leave,
    markRead: markRead,
    forget: forget,
    markReadQuiet: function (id) {
      markRead(id, true);
    },
    on: on,
  };
})();
