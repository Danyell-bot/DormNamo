/* ==========================================================
   consent.js - cookie / storage consent, asked FIRST (before log-in)
   main.js boot() waits for the answer. Then:
     Accept          the student's preferences and swipes are saved in this
                     browser (localStorage) and a small "dn_prefs" cookie holds
                     the key preferences (school, walk, budget, must-haves) for
                     180 days. On the next visit the browser sends it back with
                     every DormNamo page request and the site reads it at once,
                     e.g. to start the Rooms search where the student left off.
     Essential only  preferences live only in this tab (sessionStorage) and any
                     earlier saved preferences are deleted.
   Always kept (needed for the site to work): the log-in session, accounts, and
   the choice itself ("dn_consent" cookie, mirrored in localStorage because
   browsers ignore cookies on file:// pages).
   GitHub Pages doesn't read cookies on its server; only DormNamo's own
   JavaScript does. Cookies are scoped to this site's folder, so other sites on
   the same github.io address never see them.
   Change it any time: account menu -> Privacy & cookies.
   ========================================================== */
var Consent = (function () {
  var KEY = "dormnamo:consent",
    DAYS_CHOICE = 365,
    DAYS_PREFS = 180;

  /* ---------- cookies ---------- */
  /** The site's root folder (e.g. "/DormNamo/"), the same from every page, so all pages share the cookies. */
  function path() {
    try {
      if (window.SITE_ROOT && /^https?:/.test(SITE_ROOT)) return new URL(SITE_ROOT).pathname || "/";
    } catch (e) {}
    var p = location.pathname || "/";
    return p.slice(0, p.lastIndexOf("/") + 1) || "/"; // e.g. "/DormNamo/" on GitHub Pages
  }
  function setCookie(name, value, days) {
    try {
      document.cookie =
        name +
        "=" +
        encodeURIComponent(value) +
        "; Max-Age=" +
        Math.round(days * 86400) +
        "; Path=" +
        path() +
        "; SameSite=Lax" +
        (location.protocol === "https:" ? "; Secure" : "");
    } catch (e) {}
  }
  function getCookie(name) {
    try {
      var parts = ("; " + (document.cookie || "")).split("; " + name + "=");
      return parts.length > 1 ? decodeURIComponent(parts.pop().split(";")[0]) : null;
    } catch (e) {
      return null;
    }
  }
  function delCookie(name) {
    setCookie(name, "", 0);
  }

  /* ---------- the choice ---------- */
  function record() {
    var raw = getCookie("dn_consent");
    if (!raw)
      try {
        raw = localStorage.getItem(KEY);
      } catch (e) {}
    try {
      var r = JSON.parse(raw);
      return r && typeof r.prefs === "boolean" ? r : null;
    } catch (e) {
      return null;
    }
  }
  function asked() {
    return !!record();
  }
  function prefs() {
    var r = record();
    return !!(r && r.prefs);
  }
  /** Save the choice, then move the student's data to match it. */
  function set(yes) {
    var r = JSON.stringify({ prefs: !!yes, at: Date.now(), v: 1 });
    setCookie("dn_consent", r, DAYS_CHOICE);
    try {
      localStorage.setItem(KEY, r);
    } catch (e) {}
    if (yes) {
      if (window.USER && window.S) save(); // keep what they did this visit
    } else {
      delCookie("dn_prefs");
      if (window.Accounts && Accounts.forgetStates) Accounts.forgetStates(); // delete saved preferences
      if (window.USER && window.S) save(); // this tab only from now on
    }
  }

  /* ---------- the preferences cookie (only with consent) ---------- */
  var MKEYS = [
    "dist",
    "budget",
    "cap",
    "gender",
    "water",
    "elec",
    "env",
    "kit",
    "wifi",
    "space",
    "curfew",
    "vis",
  ];
  /** Called by save(): a compact copy of the preferences, about 150 bytes. */
  function rememberPrefs(P) {
    if (!prefs() || !P) return;
    var m = MKEYS.map(function (k) {
      return P.m && P.m[k] != null ? P.m[k] : 1;
    }).join("");
    setCookie(
      "dn_prefs",
      JSON.stringify({ s: P.school, k: P.maxKm, b: P.bhMax, a: P.aptMax, c: P.cap, g: P.gender, m: m }),
      DAYS_PREFS,
    );
  }
  /** The saved preferences, or null (no consent, no cookie, or not readable). */
  function readPrefs() {
    if (!prefs()) return null;
    try {
      var c = JSON.parse(getCookie("dn_prefs"));
      if (!c || typeof c.b !== "number" || typeof c.k !== "number") return null;
      var m = {};
      MKEYS.forEach(function (k, i) {
        var v = +String(c.m || "").charAt(i);
        m[k] = v === 0 || v === 2 ? v : 1;
      });
      return {
        school: String(c.s || ""),
        maxKm: c.k,
        bhMax: c.b,
        aptMax: +c.a || null,
        cap: c.c,
        gender: c.g,
        m: m,
      };
    } catch (e) {
      return null;
    }
  }

  /* ---------- the card ---------- */
  var box = null;
  /** Ask (first visit) or let them change their mind (account menu). done() runs after a choice. */
  function show(done) {
    if (box) box.remove();
    var r = record();
    box = document.createElement("div");
    box.className = "ck";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-labelledby", "ckH");
    box.setAttribute("aria-describedby", "ckD");
    box.innerHTML =
      '<span class="ck-i" aria-hidden="true">' +
      ico("sliders") +
      "</span>" +
      '<div class="ck-b"><h2 id="ckH">Can DormNamo remember your room preferences?</h2>' +
      '<p id="ckD">With your OK, we save your budget, walking distance, must-haves and the rooms you like in this browser, plus a small preferences cookie, so your matches are ready the next time you visit.</p>' +
      '<details class="ck-more"><summary>What is stored</summary><ul>' +
      "<li><b>Always, because the site needs it:</b> your log-in on this device and this choice.</li>" +
      "<li><b>Only if you accept:</b> your preferences and swipes in this browser, and a cookie with your key preferences for 180 days. Your browser sends it back only to DormNamo's own pages.</li>" +
      "<li><b>With essential only:</b> your preferences last until you close this tab, and anything saved before is deleted.</li>" +
      "<li>Nothing is used for ads or shared. Change it any time: account menu, then <b>Privacy &amp; cookies</b>.</li>" +
      "</ul></details>" +
      (r
        ? '<p class="ck-now">Right now: <b>' +
          (r.prefs ? "preferences are remembered" : "essential only") +
          "</b>.</p>"
        : "") +
      '<div class="ck-acts"><button class="btn" type="button" data-ck="1">Accept preference cookies</button>' +
      '<button class="btn alt" type="button" data-ck="0">Essential only</button></div></div>';
    document.body.appendChild(box);
    box.onclick = function (e) {
      var b = e.target.closest("[data-ck]");
      if (!b) return;
      var yes = b.dataset.ck === "1";
      set(yes);
      box.remove();
      box = null;
      if (done) done(yes);
    };
    var first = box.querySelector("[data-ck]");
    if (first) first.focus({ preventScroll: true });
  }

  return {
    asked: asked,
    prefs: prefs,
    set: set,
    show: show,
    rememberPrefs: rememberPrefs,
    readPrefs: readPrefs,
    getCookie: getCookie,
  };
})();
