/* ==========================================================
   matching.js - turns listing text into facts, scores listings against preferences
   (must-have filters, weighted score, "unverified" labels), builds the swipe queue
   ========================================================== */

function facts(h) {
  var t = (
      h.n +
      " " +
      h.ds +
      " " +
      h.am.join(" ") +
      " " +
      h.rev
        .map(function (r) {
          return r[1];
        })
        .join(" ")
    ).toLowerCase(),
    f = {};
  f.cap = /four to a room|4 to a room|fit 4/.test(t)
    ? 4
    : /two per room|two to a room|good for two/.test(t)
      ? 2
      : /six per room|6 per room/.test(t)
        ? 6
        : /solo|private room/.test(t)
          ? 1
          : null;
  f.gender = /for boys|male-only/.test(t)
    ? ["male"]
    : /separate floors/.test(t)
      ? ["male", "female", "mixed"]
      : /female-only floor/.test(t)
        ? ["female", "mixed"]
        : null;
  f.wifi = /wi-fi/.test(t) ? true : null;
  f.kit = /kitchen/.test(t) ? true : null;
  f.water = /water included/.test(t) ? "incl" : null;
  f.env = /limpyo|malinis|clean|safe|luwas|tahimik|quiet|calm/.test(t) ? true : null;
  f.space = /spacious/.test(t) ? true : /gamay/.test(t) ? false : null;
  f.curfew = /curfew/.test(t) ? true : null;
  if (h.facts) for (var k in h.facts) f[k] = h.facts[k];
  return f;
}
function ev(h) {
  var P = S.P,
    f = facts(h),
    o = [],
    lim = h.t === "Apartment" ? P.aptMax : P.bhMax,
    c = P.cap;
  function a(k, s, y, u) {
    if (P.m[k] > 0) o.push({ k: k, s: s, y: y, u: u || LBL[k] + " unverified" });
  }
  a(
    "dist",
    h.s === P.school ? h.d <= P.maxKm : false,
    "walking distance to " + P.school + " (" + h.d + " km)",
  );
  a("budget", h.p == null ? null : h.p <= lim, "within budget (" + peso(h.p) + ")", "Rent not published");
  if (c !== "any")
    a(
      "cap",
      f.cap ? (c === "4" ? f.cap === 4 : f.cap >= 2 && f.cap <= 3) : null,
      "good for " + f.cap + (f.cap === 1 ? " person" : " persons"),
      "Capacity not stated",
    );
  if (P.gender !== "any")
    a(
      "gender",
      f.gender ? f.gender.indexOf(P.gender) >= 0 : null,
      P.gender + " accommodation",
      "Gender policy not stated",
    );
  a(
    "water",
    f.water247 === true ? true : f.water247 === false ? false : null,
    "24/7 water supply",
    f.water === "incl"
      ? "Water is included in rent but 24/7 supply is unverified"
      : "Water supply unverified",
  );
  a(
    "elec",
    f.elec === "incl" ? true : f.elec === "extra" ? false : null,
    "electricity included",
    "Electricity arrangement not stated",
  );
  a("env", f.env, "described as clean/safe/peaceful by reviewers", "Cleanliness and environment unverified");
  a("kit", f.kit, "kitchen/cooking area");
  a("wifi", f.wifi, "Wi-Fi", "Internet unverified");
  a("space", f.space, "spacious room", "Room space unverified");
  a("curfew", f.curfew == null ? null : !f.curfew, "no curfew", "Curfew not stated");
  a("vis", f.vis == null ? null : f.vis, "visitors allowed", "Visitor policy not stated");
  o.sort(function (x, y) {
    return W[y.k] - W[x.k];
  });
  return o;
}
function peso2(n) {
  return "₱" + n.toLocaleString("en-PH");
}
/* ---- ranking ---- */
function alpha() {
  return Math.min(0.5, (S.likes.length + S.passes.length + S.marks.length) / 40);
}
function score(h) {
  var o = ev(h),
    tot = 0,
    kn = 0,
    ea = 0,
    fail = false,
    unk = [],
    must = [];
  o.forEach(function (x) {
    var w = W[x.k];
    tot += w;
    if (x.s != null) {
      kn += w;
      if (x.s) ea += w;
    }
    if (S.P.m[x.k] === 2) {
      if (x.s === false) fail = true;
      if (x.s == null) must.push(x.u);
    }
    if (x.s == null) unk.push(x.u);
  });
  var pct = kn ? ea / kn : 0,
    ws = pct * (0.7 + 0.3 * (tot ? kn / tot : 0)),
    al = alpha(),
    fin = al ? (1 - al) * ws + (al * (cosv(uvec(), dvec(h)) + 1)) / 2 : ws;
  return {
    h: h,
    o: o,
    fail: fail,
    unk: unk,
    must: must,
    pct: Math.round(fin * 100),
    cov: kn + "/" + tot,
    al: al,
    fin: fin - must.length * 0.05,
  };
}
function why(s) {
  var y = s.o
    .filter(function (x) {
      return x.s === true;
    })
    .map(function (x) {
      return x.y;
    })
    .slice(0, 6);
  return s.pct + "% Match" + (y.length ? ": " + y.join(", ") + "." : ": no preference verified yet.");
}
function queue() {
  var seen = S.likes.concat(S.passes, S.marks),
    out = [],
    ids = {};
  HOUSES.forEach(function (h) {
    if (h.unavail || seen.indexOf(h.id) >= 0 || ids[h.id]) return;
    ids[h.id] = 1;
    var s = score(h);
    if (!s.fail) out.push(s);
  });
  return out.sort(function (a, b) {
    return b.fin - a.fin;
  });
}
