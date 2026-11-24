/* ==========================================================
   namo-guard.js - fact check for AI-worded Namo replies (no DOM, no network)
   Used by the browser (global `NamoGuard`, js/namo/namo-ai.js), the Cloudflare
   Worker (worker/namo.mjs) and the tests.

   Gemini only REWORDS facts that DormNamo's own code produced (explain.js).
   check() rejects a reply that adds anything those facts don't contain:
     - a number (rent, km, minutes, %, rating, count) not in the facts
     - a peso amount when the facts have none (so "Rate on request" stays that)
     - a listing name that isn't in the facts (when the caller passes names)
     - promises nobody made ("verified", "available now", "guaranteed", discounts…)
   In "chat" mode (small talk, no facts) the reply may not contain any number,
   price or listing name at all. A rejected reply is never shown: Namo uses its
   own wording instead.
   ========================================================== */
(function (root) {
  var MAX_REPLY = 900;
  var CLAIMS =
    /\b(guarantee\w*|verified|vacanc\w*|vacant|available (now|today|immediately)|slots? (left|open)|discount\w*|promo\w*|free (wi-?fi|water|electricity|rent)|book(ed)? now|reserve(d)? now|deposit-free|no deposit)\b/gi;

  /** Every number in a text, normalized: "₱4,000" -> "4000", "0.30" -> "0.3", "82%" -> "82". */
  function numbers(text) {
    var out = [];
    String(text || "").replace(/\d[\d,]*(?:\.\d+)?/g, function (m) {
      var n = String(parseFloat(m.replace(/,/g, "")));
      if (out.indexOf(n) < 0) out.push(n);
      return m;
    });
    return out;
  }
  function claims(text) {
    var out = [];
    String(text || "").replace(CLAIMS, function (m) {
      m = m.toLowerCase();
      if (out.indexOf(m) < 0) out.push(m);
      return m;
    });
    return out;
  }
  function has(text, phrase) {
    return phrase && String(text).toLowerCase().indexOf(String(phrase).toLowerCase()) >= 0;
  }

  /**
   * Is an AI reply safe to show?
   * reply  the AI's text
   * facts  the plain-text facts it was given ("" in chat mode)
   * opts   { mode: "explain" | "chat", names: [[full, short], …] all listing names }
   * Returns { ok: true } or { ok: false, why: "…" }.
   */
  function check(reply, facts, opts) {
    opts = opts || {};
    reply = String(reply || "").trim();
    facts = String(facts || "");
    var chat = opts.mode === "chat";
    if (!reply) return { ok: false, why: "empty" };
    if (reply.length > MAX_REPLY) return { ok: false, why: "too long" };
    if (/<[a-z\/!]|\]\(|https?:\/\//i.test(reply)) return { ok: false, why: "markup or link" };

    var allowed = chat ? [] : numbers(facts),
      extra = numbers(reply).filter(function (n) {
        return allowed.indexOf(n) < 0;
      });
    if (extra.length) return { ok: false, why: "number not in the facts: " + extra.join(", ") };
    if (/₱|\bphp\b|\bpesos?\b/i.test(reply) && !/₱|\bphp\b|\bpesos?\b/i.test(facts))
      return { ok: false, why: "price not in the facts" };

    var newClaims = claims(reply).filter(function (c) {
      return !has(facts, c);
    });
    if (newClaims.length) return { ok: false, why: "claim not in the facts: " + newClaims.join(", ") };

    var names = opts.names || [];
    for (var i = 0; i < names.length; i++) {
      var full = names[i][0],
        short = names[i][1];
      var named =
        has(reply, full) ||
        (short && short.length > 3 && new RegExp("\\b" + esc(short) + "\\b", "i").test(reply));
      if (named && (chat || !(has(facts, full) || has(facts, short))))
        return { ok: false, why: "listing not in the facts: " + full };
    }
    return { ok: true };
  }
  function esc(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  var api = { check: check, numbers: numbers, claims: claims, MAX_REPLY: MAX_REPLY };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NamoGuard = api;
})(typeof self !== "undefined" ? self : this);
