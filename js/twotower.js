/* ==========================================================
   twotower.js - Two-Tower neural network: user tower + dorm tower -> embeddings -> cosine
   similarity; trained in the browser from likes, passes, bookmarks, views, inquiries
   ========================================================== */

/* ---- Two-Tower ---- */
var H = 12,
  DD = 15,
  UD = 14 + 2 * DD;
function lcg(s) {
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}
function cl(x) {
  return Math.max(0, Math.min(1, x));
}
function dvec(h) {
  var f = facts(h),
    t = h.am.join(" ").toLowerCase(),
    g = f.gender || [];
  return [
    cl(h.p / 9000),
    cl(h.d / 5),
    (f.cap || 0) / 6,
    f.cap ? 1 : 0,
    f.wifi ? 1 : 0,
    f.kit ? 1 : 0,
    f.water ? 1 : 0,
    /aircon/.test(t) ? 1 : 0,
    /cctv/.test(t) ? 1 : 0,
    f.curfew ? 1 : 0,
    g.indexOf("male") >= 0 ? 1 : 0,
    g.indexOf("female") >= 0 ? 1 : 0,
    g.indexOf("mixed") >= 0 ? 1 : 0,
    h.v ? 1 : 0,
    h.r / 5,
  ];
}
function cen(ids) {
  var v = [];
  for (var i = 0; i < DD; i++) v.push(0);
  ids.forEach(function (id) {
    var h = byId(id);
    if (h)
      dvec(h).forEach(function (x, i) {
        v[i] += x / ids.length;
      });
  });
  return v;
}
function uvec() {
  var P = S.P,
    m = P.m,
    x = [
      cl(P.bhMax / 9000),
      cl(P.maxKm / 5),
      P.cap === "4" ? 0.67 : P.cap === "2-3" ? 0.5 : 0,
      P.gender === "male" ? 1 : 0,
      P.gender === "female" ? 1 : 0,
      P.gender === "mixed" ? 1 : 0,
    ];
  ["wifi", "kit", "water", "elec", "env", "space", "curfew", "vis"].forEach(function (k) {
    x.push(m[k] / 2);
  });
  return x.concat(cen(S.likes.concat(S.marks)), cen(S.passes));
}
function mv(M, x) {
  return M.map(function (r) {
    var s = 0;
    for (var i = 0; i < x.length; i++) s += r[i] * x[i];
    return Math.tanh(s);
  });
}
function nm(e) {
  var n =
    Math.sqrt(
      e.reduce(function (a, b) {
        return a + b * b;
      }, 0),
    ) || 1e-6;
  return [
    e.map(function (v) {
      return v / n;
    }),
    n,
  ];
}
function cosv(u, d) {
  var a = nm(mv(S.nn.Wu, u))[0],
    b = nm(mv(S.nn.Wd, d))[0];
  return a.reduce(function (s, v, i) {
    return s + v * b[i];
  }, 0);
}
function train() {
  var u = uvec();
  for (var ep = 0; ep < 3; ep++)
    S.log.slice(-60).forEach(function (l) {
      var h = byId(l.id);
      if (!h) return;
      var d = dvec(h),
        eu = mv(S.nn.Wu, u),
        ed = mv(S.nn.Wd, d),
        U = nm(eu),
        D = nm(ed),
        c = 0,
        i,
        j;
      for (i = 0; i < H; i++) c += U[0][i] * D[0][i];
      var g = 5 * (1 / (1 + Math.exp(-5 * c)) - l.y) * l.w;
      for (i = 0; i < H; i++) {
        var du = ((g * (D[0][i] - c * U[0][i])) / U[1]) * (1 - eu[i] * eu[i]),
          dd = ((g * (U[0][i] - c * D[0][i])) / D[1]) * (1 - ed[i] * ed[i]);
        for (j = 0; j < UD; j++) S.nn.Wu[i][j] -= 0.05 * du * u[j];
        for (j = 0; j < DD; j++) S.nn.Wd[i][j] -= 0.05 * dd * d[j];
      }
    });
}
