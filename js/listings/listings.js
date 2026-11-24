/* ==========================================================
   listings.js - places that owners list on DormNamo (all pages)
   Stored in localStorage ("dormnamo:listings" = [record]), like accounts
   and comments, so they only exist in this browser. At load, every record
   is merged into HOUSES and its photos into PHOTOS.dorm, so cards, Discover
   and the details dialog show them like any other listing.
   Record: { id, ref, uid, owner, brgy (one of BARANGAYS), street, addr (full address), n, a, s, d, t, p, c, ds, am, facts, plan, f,
             cover, photos: [dataURL], at, upd }
   facts only holds what the owner stated (cap, gender, water, water247,
   elec, curfew, vis); anything left out stays unknown, never guessed.
   ref is the listing's permanent reference number (random UUID v4, utils.js uuid()),
   the key a real database would use; id stays the short in-page number.
   Photos: cover = the one main photo (dialog header, cards); photos = room photos
   (shown in their own "Room photos" section). Owners set them separately.
   To move to a real backend, replace load/store and keep the API.
   ========================================================== */
var Listings = (function () {
  var KEY = "dormnamo:listings";

  function load() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }
  /** Returns "" when saved, or a message for the owner (usually: storage full). */
  function store(a) {
    try {
      localStorage.setItem(KEY, JSON.stringify(a));
      return "";
    } catch (e) {
      return /quota/i.test(e.name + e.message) || e.code === 22 ? "full" : "error";
    }
  }
  function all() {
    return load();
  }
  function mine() {
    return window.USER
      ? load()
          .filter(function (r) {
            return r.uid === USER.id;
          })
          .sort(function (a, b) {
            return (b.upd || b.at) - (a.upd || a.at);
          })
      : [];
  }
  function get(id) {
    return (
      load().filter(function (r) {
        return r.id === id;
      })[0] || null
    );
  }

  /* How many places one account may list: Basic (free) covers 2, Owner Pro covers 5.
     Keep in step with the plan cards in index.html and owners.js. */
  var LIMIT = { free: 2, pro: 5 };
  function isPro(plan) {
    return plan === "pro-m" || plan === "pro-y";
  }
  /** {used, max, pro} for the account uid (default: the logged-in user); `plan` = the plan being added. */
  function quota(plan, uid) {
    uid = uid || (window.USER ? USER.id : "guest");
    var m = load().filter(function (r) {
        return r.uid === uid;
      }),
      pro =
        isPro(plan) ||
        m.some(function (r) {
          return isPro(r.plan);
        });
    return { used: m.length, max: pro ? LIMIT.pro : LIMIT.free, pro: pro };
  }

  /** Insert or update one record (owner set from USER).
      Returns {rec} or {error: "full" | "error" | "limit", max}. "limit": a new place past the plan's quota. */
  function save(rec) {
    var a = load(),
      now = Date.now(),
      i;
    rec = JSON.parse(JSON.stringify(rec));
    if (!rec.id) rec.id = now;
    if (!rec.ref || !UUID_RX.test(rec.ref)) rec.ref = uuid();
    rec.uid = rec.uid || (window.USER ? USER.id : "guest");
    rec.owner = rec.owner || (window.USER ? USER.name : "Owner");
    rec.at = rec.at || now;
    rec.upd = now;
    for (i = 0; i < a.length && a[i].id !== rec.id; i++);
    if (i === a.length && !/^bot-/.test(rec.uid)) {
      var q = quota(rec.plan, rec.uid);
      if (q.used >= q.max) return { error: "limit", max: q.max, pro: q.pro };
    }
    a[i] = rec;
    var err = store(a);
    if (err) return { error: err };
    apply(rec);
    return { rec: rec };
  }
  function remove(id) {
    var err = store(
      load().filter(function (r) {
        return r.id !== id;
      }),
    );
    if (err) return false;
    for (var i = HOUSES.length - 1; i >= 0; i--) if (HOUSES[i].id === id) HOUSES.splice(i, 1);
    delete PHOTOS.dorm[id];
    return true;
  }

  /** The record as a HOUSES entry (same terse keys as data.js). */
  function toHouse(r) {
    return {
      id: r.id,
      ref: r.ref,
      n: r.n,
      a: r.a,
      brgy: r.brgy || "",
      addr:
        r.addr || (typeof fullAddress === "function" ? fullAddress(r.street, r.brgy || barangayOf(r.a)) : ""),
      s: r.s,
      d: +r.d || 0,
      t: r.t,
      p: r.p == null || r.p === "" ? null : +r.p,
      r: 0,
      rc: 0,
      v: 0,
      f: r.f ? 1 : 0,
      am: (r.am || []).slice(),
      ds: r.ds || "New listing.",
      o: r.owner || "Owner",
      c: r.c || "",
      rev: [],
      facts: r.facts || {},
      src: "the owner",
      own: 1,
    };
  }
  function photoList(r) {
    var by = r.owner || "Owner",
      out = [];
    if (r.cover)
      out.push({
        src: r.cover,
        kind: "cover",
        alt: "Cover photo of " + r.n,
        credit: by + " (owner)",
        license: "",
      });
    (r.photos || []).forEach(function (src, i) {
      out.push({
        src: src,
        kind: "room",
        alt: "Room photo " + (i + 1) + " of " + r.n,
        credit: by + " (owner)",
        license: "",
      });
    });
    return out;
  }
  /** Put one record (or all of them) into HOUSES and PHOTOS.dorm. */
  function apply(r) {
    if (!r) {
      // records saved before reference numbers existed get one now, once, and keep it
      var a = load(),
        added = 0;
      a.forEach(function (x) {
        if (!x.ref || !UUID_RX.test(x.ref)) {
          x.ref = uuid();
          added++;
        }
      });
      if (added) store(a);
      a.forEach(apply);
      return;
    }
    var h = toHouse(r),
      i;
    for (i = 0; i < HOUSES.length && HOUSES[i].id !== r.id; i++);
    if (i < HOUSES.length) HOUSES[i] = h;
    else HOUSES.unshift(h);
    var ph = photoList(r);
    if (ph.length) PHOTOS.dorm[r.id] = ph;
    else delete PHOTOS.dorm[r.id];
  }

  /** Rough share of this browser's storage in use (most browsers allow about 5 MB per site). */
  function usage() {
    var n = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        n += k.length + (localStorage.getItem(k) || "").length;
      }
    } catch (e) {}
    return { used: n * 2, limit: 5 * 1024 * 1024 };
  }

  /** Read an image file, scale it down and re-encode it as JPEG so it fits in browser storage. cb(err, dataURL) */
  function shrink(file, max, quality, cb) {
    if (!file || !/^image\//.test(file.type)) return cb("type");
    if (file.size > 25 * 1024 * 1024) return cb("big");
    var url = URL.createObjectURL(file),
      img = new Image();
    img.onload = function () {
      var w = img.naturalWidth,
        h = img.naturalHeight,
        k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement("canvas");
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      var g = c.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      cb(null, c.toDataURL("image/jpeg", quality));
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      cb("read");
    };
    img.src = url;
  }

  apply(); // every page: owners' listings show up in the room list, Discover and the dialog
  return {
    all: all,
    mine: mine,
    quota: quota,
    LIMIT: LIMIT,
    get: get,
    save: save,
    remove: remove,
    apply: apply,
    usage: usage,
    shrink: shrink,
  };
})();
