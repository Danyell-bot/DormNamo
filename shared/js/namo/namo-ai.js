/* ==========================================================
   namo-ai.js - optional Gemini wording for Namo (free tier, via the worker)
   Namo still decides everything itself (chat.js, explain.js). This only asks
   Google Gemini, through POST {nearbyApiUrl}/namo (worker/namo.mjs), to reword
   an answer more naturally. It is used only when:
     - the worker URL is configured (DN_CONFIG.nearbyApiUrl) and DN_CONFIG.namoAI isn't false,
     - the student said yes (S.ai === true); Namo asks once, because on the free
       tier Google may use what is sent to improve its products,
     - the reply passes NamoGuard.check() here too (numbers, prices, claims and
       listing names must all come from DormNamo's own facts).
   Anything else (no consent, offline, quota used up, slow, failed check) -> Namo's
   own wording, so the chat never breaks. A small per-browser daily cap keeps the
   free quota for everyone.
   ========================================================== */
var NamoAI = (function () {
  var cache = {},
    DAILY = 60,
    KEY = "dn:namoAI",
    TIMEOUT = 9000;

  function url() {
    var c = window.DN_CONFIG || {};
    return c.nearbyApiUrl && c.namoAI !== false ? String(c.nearbyApiUrl).replace(/\/+$/, "") + "/namo" : "";
  }
  function available() {
    return !!url() && typeof fetch === "function";
  }
  function asked() {
    return !!(window.S && S.ai != null);
  }
  function on() {
    return available() && !!(window.S && S.ai === true);
  }
  function setConsent(yes) {
    if (!window.S) return;
    S.ai = !!yes;
    save();
  }
  /** Per-browser daily cap, so one student can't use up the shared free quota. */
  function budget() {
    try {
      var d = new Date().toISOString().slice(0, 10),
        s = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (s.d !== d) s = { d: d, n: 0 };
      if (s.n >= DAILY) return false;
      s.n++;
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {}
    return true;
  }

  /** Name used in casual mentions ("Gonzales-Deanon", "Flora's"), same rule as explain.js. */
  function shortName(n) {
    return n
      .replace(
        /\b(boarding|house|dormitory|dorm|residence|residences|hall|apartments?|rooms?|bedspace|inn|lodge)\b/gi,
        " ",
      )
      .replace(/\s+\w\b/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(" ");
  }
  function names() {
    return HOUSES.map(function (h) {
      return [h.n, shortName(h.n)];
    });
  }
  /** HTML answer -> the plain-text facts sent to Gemini (and checked against). */
  function plain(html) {
    return String(html || "")
      .replace(/<li>/g, "\n- ")
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ")
      .replace(/ \./g, ".")
      .trim();
  }
  /** Plain reply -> safe HTML: escaped, listing names in bold, and a small "worded by Gemini" note. */
  function format(reply) {
    var h = esc(reply);
    HOUSES.forEach(function (x) {
      var n = esc(x.n);
      if (h.indexOf(n) >= 0) h = h.split(n).join("<b>" + n + "</b>");
    });
    return (
      h.replace(/\n+/g, "<br>") +
      '<small class="c-note c-ai">Worded by Google Gemini from DormNamo\'s own data</small>'
    );
  }

  /** job: {mode: "explain"|"chat", q, facts}. Resolves to checked HTML, or null (use Namo's own wording). */
  function phrase(job) {
    if (!on() || !job || !job.q) return Promise.resolve(null);
    var k = job.mode + "|" + job.q + "|" + job.facts;
    if (cache[k]) return Promise.resolve(cache[k]);
    if (!budget()) return Promise.resolve(null);
    var ctrl = typeof AbortController === "function" ? new AbortController() : null,
      timer = setTimeout(function () {
        if (ctrl) ctrl.abort();
      }, TIMEOUT);
    return fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: job.mode,
        q: String(job.q).slice(0, 300),
        facts: String(job.facts || "").slice(0, 3000),
      }),
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (d) {
        clearTimeout(timer);
        if (!d || typeof d.reply !== "string") return null;
        var r = NamoGuard.plain(d.reply);
        var g = NamoGuard.check(r, job.facts, { mode: job.mode, names: names() });
        return g.ok ? (cache[k] = format(r)) : null;
      })
      .catch(function () {
        clearTimeout(timer);
        return null;
      });
  }

  /** Asked once, before anything is sent to Google (chat.js handles data-ai). */
  function askHTML() {
    return (
      '<p class="c-follow">Want me to use Google Gemini (free) to word my answers more naturally?</p>' +
      '<small class="c-note">I still pick every fact myself and check each reply before you see it. Your message and the room facts would be sent to Google, and on the free tier Google may use them to improve its products. Nothing about your account is sent. Say “stop using AI” any time.</small>' +
      '<span class="c-qr"><button type="button" data-ai="1">Yes, use Gemini</button><button type="button" data-ai="0">No, keep it local</button></span>'
    );
  }

  return {
    available: available,
    asked: asked,
    on: on,
    setConsent: setConsent,
    phrase: phrase,
    plain: plain,
    askHTML: askHTML,
    names: names,
  };
})();
