/* ==========================================================
   insights.js - Namo learns what a student likes, ONLY with consent
   Namo asks first (chat.js shows the question). With a "yes" it reads
   what the student does on DormNamo, never anything outside it: a
   website cannot read other sites' cookies or history, and Namo
   doesn't try to.

   Signals (kept in the user's own state S, in this browser):
     hearts / likes, bookmarks, inquiries     strong "I like this"
     passes (Discover)                        "not for me"
     rooms opened + seconds spent looking     S.act.v {id: {n, t}}
     searches and filters on Rooms            S.act.q [ {p, types, am, near, q, at} ]
   profile() turns them into a weighted picture (typical rent and walk,
   room type, features they keep choosing, what they skip) and
   suggestions() into preference changes Namo can offer to apply.
   S.learn: undefined = not asked yet, true = yes, false = no.
   ========================================================== */
var Insights = (function () {
  function on() {
    return !!(window.S && S.learn === true);
  }
  function asked() {
    return !!(window.S && S.learn != null);
  }
  function act() {
    return S.act || (S.act = { v: {}, q: [] });
  }
  function setConsent(yes) {
    if (!window.S) return;
    S.learn = !!yes;
    S.learnAt = Date.now();
    if (!yes) delete S.act; // "no" also drops anything collected before
    save();
  }
  function forget() {
    if (!window.S) return;
    delete S.act;
    save();
  }

  /* ---------- rooms opened, and for how long ---------- */
  var openId = null,
    openAt = 0;
  function viewStart(id) {
    if (!on()) return;
    viewEnd();
    openId = id;
    openAt = Date.now();
  }
  function viewEnd() {
    if (openId == null || !on()) return (openId = null);
    var s = Math.min(300, (Date.now() - openAt) / 1000), // cap: a dialog left open over lunch isn't 2 h of interest
      a = act(),
      v = a.v[openId] || (a.v[openId] = { n: 0, t: 0 });
    v.n++;
    v.t = Math.round((v.t + s) * 10) / 10;
    openId = null;
    save();
  }
  if (typeof open === "function") {
    var _open = open;
    open = function (id) {
      _open(id);
      viewStart(id);
    };
  }
  var dlg = document.getElementById("dlg");
  if (dlg) dlg.addEventListener("close", viewEnd);
  window.addEventListener("pagehide", viewEnd);

  /* ---------- searches and filters (browse.js calls this from render) ---------- */
  var ft = 0;
  function filters(F) {
    if (!on()) return;
    clearTimeout(ft);
    ft = setTimeout(function () {
      // only settled, meaningful filters (wait until the student stops dragging the slider)
      if (!(F.p < 10000 || F.types.length || F.am.length || F.near || F.q)) return;
      var e = {
          p: F.p < 10000 ? F.p : null,
          types: F.types.slice(),
          am: F.am.slice(),
          near: F.near || null,
          q: F.q || null,
        },
        a = act(),
        last = a.q[a.q.length - 1],
        key = JSON.stringify(e);
      if (last && last.k === key) return;
      e.k = key;
      e.at = Date.now();
      a.q.push(e);
      a.q = a.q.slice(-20);
      save();
    }, 1500);
  }

  /* ---------- profile ---------- */
  function own(h) {
    var r = h.own && window.Listings ? Listings.get(h.id) : null;
    return !!(r && window.USER && r.uid === USER.id);
  }
  /** Weight per listing id: how much the student's actions say "I like this". */
  function weights() {
    var w = {};
    function add(id, x) {
      w[id] = (w[id] || 0) + x;
    }
    S.likes.forEach(function (id) {
      add(id, 3);
    });
    S.marks.forEach(function (id) {
      add(id, 3);
    });
    S.inq.forEach(function (id) {
      add(id, 4);
    });
    S.passes.forEach(function (id) {
      add(id, -2);
    });
    Object.keys(S.views || {}).forEach(function (id) {
      add(+id, 0.5);
    });
    if (S.act)
      Object.keys(S.act.v).forEach(function (id) {
        var v = S.act.v[id];
        add(+id, Math.min(3, 0.6 * v.n + v.t / 40)); // opened often, or read for a while
      });
    return w;
  }
  function wmedian(xs) {
    // xs: [[value, weight]]
    xs = xs.slice().sort(function (a, b) {
      return a[0] - b[0];
    });
    var tot = 0,
      acc = 0,
      i;
    for (i = 0; i < xs.length; i++) tot += xs[i][1];
    for (i = 0; i < xs.length; i++) if ((acc += xs[i][1]) >= tot / 2) return xs[i][0];
    return null;
  }
  var FEATS = [
    [
      "wifi",
      "Wi-Fi",
      function (f, h) {
        return f.wifi === true;
      },
    ],
    [
      "kit",
      "a kitchen",
      function (f) {
        return f.kit === true;
      },
    ],
    [
      "water",
      "water included",
      function (f) {
        return f.water === "incl";
      },
    ],
    [
      "env",
      "a clean, quiet place",
      function (f) {
        return f.env === true;
      },
    ],
    [
      "aircon",
      "aircon",
      function (f, h) {
        return h.am.indexOf("Aircon") >= 0;
      },
    ],
    [
      "cr",
      "a CR inside",
      function (f, h) {
        return h.am.indexOf("CR inside") >= 0;
      },
    ],
  ];
  function profile() {
    if (!window.S) return { ready: false, n: 0 };
    var w = weights(),
      pos = [],
      neg = [],
      tot = 0;
    Object.keys(w).forEach(function (id) {
      var h = byId(+id);
      if (!h || own(h) || !w[id]) return;
      if (w[id] > 0) {
        pos.push({ h: h, w: w[id] });
        tot += w[id];
      } else neg.push({ h: h, w: -w[id] });
    });
    var p = { ready: pos.length >= 3 && tot >= 4, n: pos.length, pos: pos, neg: neg };
    if (!p.ready) return p;

    var priced = pos.filter(function (x) {
      return x.h.p != null;
    });
    p.rent =
      priced.length >= 2
        ? wmedian(
            priced.map(function (x) {
              return [x.h.p, x.w];
            }),
          )
        : null;
    p.walk = wmedian(
      pos.map(function (x) {
        return [x.h.d, x.w];
      }),
    );
    p.far = Math.max.apply(
      null,
      pos.map(function (x) {
        return x.h.d;
      }),
    );

    var types = {};
    pos.forEach(function (x) {
      types[x.h.t] = (types[x.h.t] || 0) + x.w;
    });
    var top = Object.keys(types).sort(function (a, b) {
      return types[b] - types[a];
    })[0];
    p.type = types[top] / tot >= 0.6 ? { t: top, share: types[top] / tot } : null;

    // features they keep choosing more often than the listings in general have them
    p.feats = [];
    FEATS.forEach(function (ft) {
      var mine = 0,
        base = 0;
      pos.forEach(function (x) {
        if (ft[2](facts(x.h), x.h)) mine += x.w;
      });
      HOUSES.forEach(function (h) {
        if (ft[2](facts(h), h)) base++;
      });
      var share = mine / tot,
        rate = base / HOUSES.length;
      if (share >= 0.6 && share >= rate + 0.15) p.feats.push({ k: ft[0], label: ft[1], share: share });
    });

    // what they skip
    if (neg.length >= 2) {
      var nd = wmedian(
        neg.map(function (x) {
          return [x.h.d, x.w];
        }),
      );
      if (nd > p.walk * 1.8 && nd - p.walk >= 0.3) p.skipFar = nd;
      var np = neg.filter(function (x) {
        return x.h.p != null;
      });
      if (np.length >= 2 && p.rent) {
        var npm = wmedian(
          np.map(function (x) {
            return [x.h.p, x.w];
          }),
        );
        if (npm > p.rent * 1.3) p.skipPricey = npm;
      }
    }
    // a price limit they keep setting in the filters
    var qs = (S.act && S.act.q) || [],
      caps = qs
        .map(function (q) {
          return q.p;
        })
        .filter(Boolean);
    if (caps.length >= 2)
      p.searchCap = wmedian(
        caps.map(function (c) {
          return [c, 1];
        }),
      );
    return p;
  }

  /** Preference changes that would match what they actually do. [{label, apply(P)}] */
  function suggestions(p) {
    p = p || profile();
    if (!p.ready) return [];
    var P = S.P,
      out = [],
      round100 = function (x) {
        return Math.ceil(x / 100) * 100;
      };
    var cap = p.searchCap || (p.rent ? round100(p.rent * 1.15) : null);
    if (cap && cap < P.bhMax * 0.85)
      out.push({
        label: "Boarding house budget → " + peso(cap),
        apply: function (Q) {
          Q.bhMax = cap;
          Q.m.budget = Math.max(Q.m.budget, 1);
        },
      });
    var km = Math.max(0.3, Math.round(Math.max(p.walk * 1.5, p.far) * 10) / 10);
    if (km < P.maxKm * 0.75)
      out.push({
        label: "Max walk → " + km + " km",
        apply: function (Q) {
          Q.maxKm = km;
          Q.m.dist = Math.max(Q.m.dist, 1);
        },
      });
    p.feats.forEach(function (f) {
      var k = { wifi: "wifi", kit: "kit", water: "water", env: "env" }[f.k];
      if (k && !P.m[k])
        out.push({
          label: LBL[k] + " → nice to have",
          apply: function (Q) {
            Q.m[k] = 1;
          },
        });
    });
    return out;
  }

  function pct(x) {
    return Math.round(x * 100) + "%";
  }
  /** What Namo has learned, in plain words. */
  function summaryHTML() {
    var p = profile();
    if (!p.ready)
      return (
        "I'm still getting to know you: so far I've seen " +
        p.n +
        (p.n === 1 ? " room" : " rooms") +
        " you opened, hearted or saved. Look around a bit more (open a few rooms, heart the ones you like, skip the ones you don't) and ask me again! 🔍"
      );
    var li = [];
    if (p.type)
      li.push(
        "You lean toward <b>" +
          esc(p.type.t.toLowerCase()) +
          "s</b> (" +
          pct(p.type.share) +
          " of what you like).",
      );
    if (p.rent) li.push("The rooms you like usually cost around <b>" + peso(p.rent) + "</b> a month.");
    li.push(
      "You like being close: usually within <b>" +
        p.walk +
        " km</b> (about " +
        Math.max(1, Math.round(p.walk * 12)) +
        " min walk).",
    );
    if (p.feats.length)
      li.push(
        "You keep picking places with <b>" +
          esc(
            p.feats
              .map(function (f) {
                return f.label;
              })
              .join(", "),
          ) +
          "</b>.",
      );
    if (p.skipFar) li.push("You tend to skip places around " + p.skipFar + " km away.");
    if (p.skipPricey) li.push("You tend to skip places around " + peso(p.skipPricey) + ".");
    if (p.searchCap) li.push("When you search, you usually cap rent at <b>" + peso(p.searchCap) + "</b>.");
    return (
      "Here's what I've picked up from the <b>" +
      p.n +
      " rooms</b> you opened, hearted or saved:<ul><li>" +
      li.join("</li><li>") +
      "</li></ul>"
    );
  }

  /** The consent question, with Yes / No buttons (chat.js handles data-consent). */
  function askHTML() {
    return (
      "Can I learn from what you do on DormNamo? 🧠 I'd look at the rooms you open (and how long you look), heart, skip, save and search for, so I can understand what you like and suggest better matches." +
      '<small class="c-note">It stays in this browser. I never look at other websites, your cookies or your history, and you can say “stop learning” any time.</small>' +
      '<span class="c-qr"><button type="button" data-consent="1">Yes, learn from my activity</button><button type="button" data-consent="0">No thanks</button></span>'
    );
  }

  return {
    on: on,
    asked: asked,
    setConsent: setConsent,
    forget: forget,
    filters: filters,
    profile: profile,
    suggestions: suggestions,
    summaryHTML: summaryHTML,
    askHTML: askHTML,
  };
})();
