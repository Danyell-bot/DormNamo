/* ==========================================================
   chat.js - "Namo", the preference chatbot
   Reads natural English sentences (typos ok)
   and turns them into changes to the user's preferences.

   How it works (all local, no API):
   1. normalize + stem each word, fix typos with a bounded
      Levenshtein search limited to words of similar length
   2. look every word up in a hash map (word -> concept), O(1)
   3. split into clauses; per clause detect strength ("must",
      "need"), skip/negation ("don't care", "without"), and
      numbers (km, minutes, pesos, "3k", persons)
   4. PHRASES catch whole ideas said in other words
      ("I'm broke" = cheaper, "online classes" = Wi-Fi)
   5. apply changes to S.P, save, then re-rank with matching.js
   6. anything that isn't a preference goes to talk.js
      (greetings, thanks, questions, feelings, yes/no)

   Meaning, not just keywords:
   - ambiguous words (WEAK: "man", "girl", "power", "share"…) only
     count when the sentence is about a room ("dorm for men") or
     Namo just asked about preferences ("hey man" or "the man at the
     gate" never set gender).
   - every change is explained back in plain words ("Got it, you're
     on a tight budget…"), and Namo asks one useful follow-up
     (budget, walking distance, or whether something is a must).
   - questions about the area without a listing ("what's the
     rent around here?", "where's a cheap one?") are answered from the data.
   - with consent, insights.js learns what the student likes from
     their activity on DormNamo ("what do I like?").
   - knowledge.js holds every variable on the site (all listing details,
     ratings, hearts, comments, the student's preferences, cookie and consent):
     listings are recognized by full or short name or a close typo ("uy pad"),
     any detail can be asked ("does uy pad have aircon?"), questions across all
     listings are answered without changing preferences ("which dorms have wifi
     under 4k?") and Namo then offers to save them, and "what do you know about
     me?" shows the cookie and everything stored. Namo adapts: asking about a
     place counts as interest in the ranking, repeat interest gets a heart offer,
     and returning students are welcomed with their saved preferences.
   - "what's best for me?", "why?", "why not X?", "compare X and Y"
     are answered by explain.js, which writes the explanation from the
     live match data instead of picking a canned reply.
   - optional: with the student's consent, namo-ai.js asks Google Gemini (free tier,
     through the worker) to reword those answers, and to answer small talk Namo
     didn't understand. Every Gemini reply is fact-checked (namo-guard.js); if
     anything fails, Namo's own wording is shown. reply() stays synchronous: it
     leaves an "aiJob" for ask() to try.
   ========================================================== */
var Chat = (function () {
  // concept -> synonyms (stems; trailing "s" is stripped from input)
  var WORDS = {
    dist: "near nearby close closer closest walk walking walkable distance campus gate commute",
    budget: "budget cheap cheaper affordable rent price pricey expensive money cost",
    cap: "roommate sharing share person people pax capacity solo alone",
    gender: "male female boy girl man woman men women mixed coed co-ed gender lady ladie",
    water: "water supply shower",
    elec: "electricity electric power brownout outage",
    env: "clean cleanliness peaceful quiet safe safety secure security noise noisy cctv guard",
    kit: "kitchen cook cooking stove",
    wifi: "wifi wi-fi internet net online connection signal",
    space: "spacious space roomy cramped",
    curfew: "curfew",
    vis: "visitor guest",
  };
  // whole ideas -> a concept (wanted) or an action. Checked per clause, before single words.
  var PHRASES = [
    [
      /\b(broke|tight budget|low budget|limited budget|student budget|no money|save money|can'?t afford|cannot afford|too expensive|too pricey|less expensive|inexpensive|budget[- ]friendly|lower (the )?(price|rent)|on a budget|money is tight|money's tight)\b/,
      "cheaper",
    ],
    [
      /\b(more budget|bigger budget|higher budget|can (spend|pay) more|money (is )?not (an )?(issue|problem)|don'?t mind paying|premium|luxur\w*)\b/,
      "pricier",
    ],
    [
      /\b(don'?t (want|like) to walk|hate walking|short walk|lazy to walk|right next to|beside (the )?(campus|school))\b/,
      "closer",
    ],
    [/\b(walk to (school|class|campus)|near (the )?(school|campus|university))\b/, "dist"],
    [
      /\b(don'?t mind (the |a )?(walk|distance|commute)|far is (fine|ok(ay)?)|can commute|ride (a )?jeep)\b/,
      "farther",
    ],
    [
      /\b(can'?t sleep|light sleeper|study in peace|focus on (my )?stud\w*|need (to )?focus|safe (area|neighborhood|place)|no (noise|cockroach\w*|bugs)|dirty|cockroach\w*|bed ?bugs?|snor\w*|loud neighbou?rs?)\b/,
      "env",
    ],
    [/\b(cook (my )?own|prepare (my )?(own )?food|meal prep|i like to cook|rice cooker|own food)\b/, "kit"],
    [
      /\b(online class\w*|zoom|google meet|stream\w*|gaming|netflix|work from home|wfh|remote work|research|upload|download|data connection|strong signal)\b/,
      "wifi",
    ],
    [
      /\b(big(ger)? room|large room|lots of (stuff|things)|more space|room to move|not cramped|too small)\b/,
      "space",
    ],
    [
      /\b(come home late|go home late|get home late|night shift|late (at )?night|out late|party|parties)\b/,
      "curfew",
    ],
    [
      /\b(friends? (can )?(come|visit|over)|(bf|gf|boyfriend|girlfriend|partner|family|parents|mama|papa|friends?|groupmates?)\b.{0,14}\b(visit\w*|come over|sleep ?over)|group study|study group)\b/,
      "vis",
    ],
    [
      /\b(water (problem|shortage|interruption)|always (have )?water|no water|enough water|water pressure)\b/,
      "water",
    ],
    [/\b(brownouts?|power outage|electric bill|submeter\w*|own meter)\b/, "elec"],
    [/\b(i'?m (a )?(girl|woman|lady|female)|for (girls|ladies|women)|girls only|ladies only)\b/, "female"],
    [/\b(i'?m (a )?(guy|boy|man|male)|for (boys|guys|men)|boys only|guys only)\b/, "male"],
  ];
  var ACTIONS = { cheaper: 1, pricier: 1, closer: 1, farther: 1, female: 1, male: 1 };
  // how Namo says back what it understood from a whole-idea phrase
  var WHY = {
    cheaper: "you're on a tight budget",
    pricier: "you can spend a bit more",
    closer: "you'd rather not walk far",
    dist: "you want to walk to class",
    farther: "distance isn't a big deal for you",
    env: "you want a quiet, clean place",
    kit: "you like to cook",
    wifi: "you need a solid connection",
    space: "you want more room",
    curfew: "you come home late",
    vis: "you'll have visitors",
    water: "water matters to you",
    elec: "power is a concern",
    female: "you're looking for a place for girls",
    male: "you're looking for a place for guys",
  };
  // words that mean something else in everyday talk; they only count when the sentence is about a room
  var WEAK = {
    man: 1,
    men: 1,
    boy: 1,
    girl: 1,
    woman: 1,
    women: 1,
    lady: 1,
    ladie: 1,
    guest: 1,
    power: 1,
    net: 1,
    signal: 1,
    space: 1,
    share: 1,
    person: 1,
    people: 1,
    supply: 1,
    online: 1,
    safe: 1,
    gate: 1,
  };
  var ROOMCTX =
    /\b(rooms?|dorm\w*|boarding|bh|apartment|apt|bedspace|place|house|for|only|want|need|looking|prefer|must|accept\w*|allow\w*|im|i'?m)\b/;
  var CUE = {
    must: "must need require required important essential definitely always",
    skip: "skip ignore whatever",
  };
  var SKIP_RX = /don'?t care|doesn'?t matter|not important|no need|either way|ignore|skip/;
  var NEG_RX = /\b(no|without|not|never|dont|don't)\b/;
  var STOP = /^(boarding|house|rooms?|student|dorm|residence|budget|bedspace)$/;

  var stem = function (w) {
    return w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w;
  };
  var tok = function (s) {
    return s
      .toLowerCase()
      .replace(/['’]s\b/g, "")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9₱.\/'\- ]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  };

  // ---- vocabulary: hash map for exact hits + length buckets for typo repair
  var CONCEPT = {},
    VOCAB = {},
    BUCKET = {};
  function addWord(w, concept) {
    w = stem(w);
    if (concept) CONCEPT[w] = concept;
    if (!VOCAB[w]) {
      VOCAB[w] = 1;
      (BUCKET[w.length] = BUCKET[w.length] || []).push(w);
    }
  }
  Object.keys(WORDS).forEach(function (k) {
    WORDS[k].split(" ").forEach(function (w) {
      addWord(w, k);
    });
  });
  Object.keys(CUE).forEach(function (k) {
    CUE[k].split(" ").forEach(function (w) {
      addWord(w);
    });
  });
  var MUST = {};
  CUE.must.split(" ").forEach(function (w) {
    MUST[stem(w)] = 1;
  }); // whole words only ("it" is not "definitely")
  // everyday words that must never be "typo-fixed" into a preference ("room" is not "roomy")
  "room home house place show find stay good food mood need more some soon want will wait walk spot late date hate rate look looking living staying sleeping sleeper sometimes hi hello thank thanks best better top pick west east"
    .split(" ")
    .forEach(function (w) {
      addWord(w);
    });

  function lev(a, b, max) {
    // bounded Levenshtein, exits early
    var prev = [],
      cur,
      i,
      j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      var low = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < low) low = cur[j];
      }
      if (low > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  var REPAIRED = {}; // memo: each unknown word is repaired once
  function repair(w) {
    if (VOCAB[w] || w.length < 4 || /\d/.test(w)) return w;
    return REPAIRED[w] || (REPAIRED[w] = repair_(w));
  }
  function repair_(w) {
    // fix a typo using only words of similar length
    var max = w.length < 7 ? 1 : 2,
      best = w,
      bd = max + 1;
    for (var L = w.length - 1; L <= w.length + 1; L++)
      (BUCKET[L] || []).forEach(function (c) {
        var d = lev(w, c, max);
        if (d < bd) {
          bd = d;
          best = c;
        }
      });
    return best;
  }

  // ---- numbers
  var NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  function num(s) {
    return NUM[s] || +s;
  }

  // ---- parse one message into preference changes
  function parse(text, prefsTopic) {
    var P = JSON.parse(JSON.stringify(S.P)),
      out = { P: P, hit: false, intent: null, seen: [], why: [] };
    var raw = text.toLowerCase();
    if (/\b(reset|start over|clear (all|everything))\b/.test(raw)) {
      out.intent = "reset";
      return out;
    }
    if (/^\s*(undo|revert|go back)/.test(raw)) {
      out.intent = "undo";
      return out;
    }
    if (/^\s*(help|what can you do)\b/.test(raw)) {
      out.intent = "help";
      return out;
    }
    if (/cheapest|lowest (rent|price)/.test(raw)) out.sort = "p";
    else if (/nearest|closest/.test(raw)) out.sort = "d";
    else if (/best rated|highest rated|top rated|highest rating/.test(raw)) out.sort = "r";
    // "where's a cheap one?" = show them sorted, don't change the budget
    if (!out.sort && /\b(where|which)\b/.test(raw)) {
      if (/\b(cheap\w*|affordable)\b/.test(raw)) out.sort = "p";
      else if (/\b(near\w*|close\w*)\b/.test(raw)) out.sort = "d";
    }

    var carry = null; // "need wifi, kitchen and water": the cue carries to the next list items
    raw.split(/([.;?!]| but | although |,| and | plus )/).forEach(function (clause, idx) {
      if (idx % 2) {
        if (/^[.;?!]$|but|although/.test(clause)) carry = null;
        return;
      }
      var c = clause,
        mode = null,
        hit;
      var apt = /apartment|apt/.test(c),
        must = false;
      var m;
      // numbers first (and remove them so they aren't read twice)
      if ((m = c.match(/(\d+(?:\.\d+)?)\s*(?:km|kilomet\w+)/))) {
        P.maxKm = +m[1];
        P.m.dist = Math.max(P.m.dist, 1);
        hit = out.hit = true;
        c = c.replace(m[0], " ");
      }
      if ((m = c.match(/(\d+)\s*(?:min|minute)s?/))) {
        P.maxKm = Math.round((m[1] / 12) * 10) / 10;
        P.m.dist = Math.max(P.m.dist, 1);
        hit = out.hit = true;
        c = c.replace(m[0], " ");
      }
      if (
        (m = c.match(
          /(\d+|one|two|three|four|five|six)\s*(?:persons?|people|pax|roommates?|sharing|to a room)/,
        ))
      ) {
        var n = num(m[1]);
        P.cap = n >= 4 ? "4" : n >= 2 ? "2-3" : "any";
        P.m.cap = Math.max(P.m.cap, 1);
        hit = out.hit = true;
        c = c.replace(m[0], " ");
      }
      if ((m = c.match(/(\d+(?:\.\d+)?)\s*(?:k|thousand)\b|₱\s*([\d,]+)|\b(\d{4,5})\b/))) {
        var v = m[1] ? +m[1] * 1000 : +(m[2] || m[3]).replace(/,/g, "");
        if (apt) P.aptMax = v;
        else P.bhMax = v;
        P.m.budget = Math.max(P.m.budget, 1);
        hit = out.hit = true;
        c = c.replace(m[0], " ");
      }
      // words -> concepts
      var words = tok(c).map(function (w) {
        return repair(stem(w));
      });
      var skip = SKIP_RX.test(c),
        neg = NEG_RX.test(c);
      words.forEach(function (w) {
        if (MUST[w]) must = true;
      });
      if (must || skip || neg) carry = { must: must, skip: skip, neg: neg };
      else if (carry) {
        must = carry.must;
        skip = carry.skip;
        neg = carry.neg;
      }
      // whole-idea phrases: these always mean "I want this", so negation words inside them don't flip them
      var acts = {},
        wanted = [];
      PHRASES.forEach(function (p) {
        if (p[0].test(c)) {
          if (WHY[p[1]] && out.why.indexOf(WHY[p[1]]) < 0) out.why.push(WHY[p[1]]);
          if (ACTIONS[p[1]]) acts[p[1]] = 1;
          else if (wanted.indexOf(p[1]) < 0) wanted.push(p[1]);
        }
      });
      if (/cheaper|less expensive|lower rent/.test(c)) acts.cheaper = 1;
      if (/closer|nearer/.test(c)) acts.closer = 1;
      if (/farther|further/.test(c)) acts.farther = 1;
      var roomTalk = ROOMCTX.test(c) || !!prefsTopic;
      var concepts = words
        .map(function (w) {
          return CONCEPT[w] && (roomTalk || !WEAK[w]) ? CONCEPT[w] : null;
        })
        .filter(function (k, i, a) {
          return k && a.indexOf(k) === i && wanted.indexOf(k) < 0;
        });
      concepts.concat(wanted).forEach(function (k) {
        if (out.seen.indexOf(k) < 0) out.seen.push(k);
      });
      // relative wording ("cheaper", "closer") only when no explicit number was given
      var noNum = !/\d/.test(clause);
      if (acts.cheaper && noNum) {
        P.bhMax = Math.max(1000, Math.round((P.bhMax * 0.8) / 100) * 100);
        P.aptMax = Math.max(3000, Math.round((P.aptMax * 0.8) / 100) * 100);
        P.m.budget = Math.max(P.m.budget, 1);
        hit = out.hit = true;
      }
      if (acts.pricier && noNum) {
        P.bhMax = Math.min(10000, Math.round((P.bhMax * 1.25) / 100) * 100);
        P.aptMax = Math.min(15000, Math.round((P.aptMax * 1.25) / 100) * 100);
        hit = out.hit = true;
      }
      if (acts.closer && noNum) {
        P.maxKm = Math.max(0.3, Math.round(P.maxKm * 0.6 * 10) / 10);
        P.m.dist = Math.max(P.m.dist, 1);
        hit = out.hit = true;
      }
      if (acts.farther) {
        P.maxKm = Math.min(5, Math.round(P.maxKm * 1.5 * 10) / 10);
        hit = out.hit = true;
      }
      if (acts.female || acts.male) {
        P.gender = acts.female ? "female" : "male";
        P.m.gender = must ? 2 : Math.max(P.m.gender, 1);
        hit = out.hit = true;
        concepts = concepts.filter(function (k) {
          return k !== "gender";
        });
      }
      wanted.forEach(function (k) {
        P.m[k] = skip ? 0 : Math.max(P.m[k], must ? 2 : 1);
        hit = out.hit = true;
      });
      concepts.forEach(function (k) {
        if (k === "gender") {
          var g = /\b(male|boys?|man|men|guys?)\b/.test(c)
            ? "male"
            : /\b(female|girls?|woman|women|lad(y|ies))\b/.test(c)
              ? "female"
              : /mixed|co-?ed/.test(c)
                ? "mixed"
                : null;
          if (g) {
            P.gender = g;
            P.m.gender = must ? 2 : 1;
            hit = out.hit = true;
          }
          return;
        }
        if (k === "dist" || k === "budget" || k === "cap") {
          if (must) P.m[k] = 2;
          if (skip) P.m[k] = 0;
          hit = hit || must || skip;
          out.hit = out.hit || hit;
          return;
        }
        mode = skip ? 0 : neg ? (k === "curfew" ? (must ? 2 : 1) : 0) : must ? 2 : 1;
        P.m[k] = mode;
        hit = out.hit = true;
      });
      SCHOOLS.forEach(function (s) {
        // school names / acronyms
        var key = s
          .toLowerCase()
          .replace(/[^a-z ]/g, " ")
          .replace(/\s+/g, " ")
          .trim(); // "MSU-IIT" -> "msu iit"
        if (
          new RegExp(
            "\\b(" +
              key.split(" ")[0] +
              "|" +
              key
                .split(/[ -]/)
                .map(function (x) {
                  return x[0];
                })
                .join("") +
              ")\\b",
          ).test(c) &&
          /\b(near|by|school|campus|at)\b|iit|xu|ustp/.test(c)
        ) {
          P.school = s;
          hit = out.hit = true;
        }
      });
    });
    // name a single listing -> a question about it
    var ws = tok(raw).map(function (w) {
      return repair(stem(w));
    });
    out.asks = ws
      .map(function (w) {
        return CONCEPT[w] && (!WEAK[w] || ROOMCTX.test(raw) || /\?/.test(raw)) ? CONCEPT[w] : null;
      })
      .filter(Boolean);
    out.question =
      /\?\s*$/.test(raw) || /^\s*(how|what|whats|where|which|is|are|do|does|any|can)\b/.test(raw);
    if (/how much|what.{0,6}(rent|price|cost)/.test(raw)) out.asks.push("budget");
    if (/how far|distance to/.test(raw)) out.asks.push("dist");
    // listings named in the message: full or short name, distinctive word, or a close typo (knowledge.js)
    out.houses = window.Know ? Know.find(raw) : [];
    out.house = out.houses[0] || null;
    // "does it have wifi?" right after looking at a listing = a question about that listing
    out.followUp =
      /\b(it|this|that|there|this one|that one|the place)\b/.test(raw) &&
      /\?|^\s*(does|is|do|has|have|how|can|any|what)\b/.test(raw);
    return out;
  }

  // ---- describe what changed
  var MODE = ["don't care", "nice to have", "must have"]; // same words as the questionnaire
  function diff(a, b) {
    var d = [];
    if (a.school !== b.school) d.push("School → " + b.school);
    if (a.maxKm !== b.maxKm) d.push("Max walk → " + b.maxKm + " km");
    if (a.bhMax !== b.bhMax) d.push("Boarding house budget → " + peso(b.bhMax));
    if (a.aptMax !== b.aptMax) d.push("Apartment budget → " + peso(b.aptMax));
    if (a.cap !== b.cap) d.push("Capacity → " + b.cap);
    if (a.gender !== b.gender) d.push("Gender → " + b.gender);
    Object.keys(b.m).forEach(function (k) {
      if (a.m[k] !== b.m[k]) d.push(LBL[k] + " → " + MODE[b.m[k]]);
    });
    return d;
  }

  // ---- facts about a listing, with "unverified" honesty
  function fact(h, k) {
    var f = facts(h);
    var t = {
      wifi: f.wifi ? "Wi-Fi is listed." : "Wi-Fi is not stated (unverified).",
      kit: f.kit ? "It has a kitchen/cooking area." : "Kitchen is not stated (unverified).",
      water:
        f.water === "incl"
          ? "Water is included in rent, but 24/7 supply is unverified."
          : "Water supply is unverified.",
      elec: "Electricity arrangement is not stated (unverified).",
      env: f.env ? "Tenant reviews describe it as clean/safe/quiet." : "Cleanliness is unverified.",
      space:
        f.space === true
          ? "Reviews say it's spacious."
          : f.space === false
            ? "Reviews say space is tight."
            : "Room space is unverified.",
      curfew: f.curfew ? "It has a curfew." : "Curfew is not stated (unverified).",
      vis: "Visitor policy is not stated (unverified).",
      cap: f.cap ? "Roughly " + f.cap + " per room." : "Capacity is unverified.",
      gender: f.gender ? "Accepts: " + f.gender.join(", ") + "." : "Gender policy is unverified.",
      dist: h.d + " km from " + h.s + " (~" + Math.round(h.d * 12) + " min walk).",
      budget: h.p == null ? "Rent isn't published for this place. Ask the owner." : peso(h.p) + " / month.",
    };
    return t[k];
  }

  // ---- UI ----------------------------------------------------------
  var box,
    log,
    input,
    undoStack = [];
  // conversation memory: the listing being discussed, what "yes" means, where "more" continues
  var ctx = { house: null, pending: null, sort: null, off: 0, topic: null, asked: {} };
  function say(who, html) {
    var m = document.createElement("div");
    m.className = "msg " + who;
    m.innerHTML = html;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    if (who === "bot" && !isOpen()) notify(m);
    return m;
  }

  /* ---------- notifications: Namo has something new while the chat is closed ----------
     A red count on the Ask Namo button, the count in the tab title ("(2) DormNamo | …"), and a short
     preview bubble above the button that opens the chat. The opening greeting only counts until the
     student has opened the chat once in this tab, so it doesn't nag on every page. */
  var unread = 0,
    peekTimer = 0,
    baseTitle = document.title,
    SEEN = "dormnamo:namoOpened";
  function isOpen() {
    var p = $("chatPanel");
    return !!(p && !p.hidden);
  }
  function seenThisTab() {
    try {
      return sessionStorage.getItem(SEEN) === "1";
    } catch (e) {
      return false;
    }
  }
  function badge() {
    var b = $("chatBadge"),
      fab = $("chatFab");
    if (!b || !fab) return;
    b.hidden = !unread;
    b.textContent = unread > 9 ? "9+" : unread;
    b.classList.remove("pop");
    void b.offsetWidth;
    if (unread) b.classList.add("pop");
    fab.classList.toggle("has-new", !!unread);
    fab.setAttribute(
      "aria-label",
      "Ask Namo, the room helper" +
        (unread ? ", " + unread + (unread === 1 ? " new message" : " new messages") : ""),
    );
    document.title = (unread ? "(" + unread + ") " : "") + baseTitle;
  }
  function peek(text) {
    var p = $("chatPeek");
    if (!p || !text) return;
    p.querySelector(".c-peek-t").textContent = text.length > 120 ? text.slice(0, 117).trim() + "…" : text;
    p.hidden = false;
    p.classList.remove("in");
    void p.offsetWidth;
    p.classList.add("in");
    clearTimeout(peekTimer);
    var phone = window.matchMedia && matchMedia("(max-width: 760px)").matches;
    peekTimer = setTimeout(hidePeek, phone ? 6000 : 9000);
    // the bubble covers part of the page: it gets out of the way as soon as the student scrolls
    peekY = window.scrollY;
    window.addEventListener("scroll", peekScroll, { passive: true });
  }
  var peekY = 0;
  function peekScroll() {
    if (Math.abs(window.scrollY - peekY) > 60) hidePeek();
  }
  function hidePeek() {
    var p = $("chatPeek");
    clearTimeout(peekTimer);
    window.removeEventListener("scroll", peekScroll);
    if (p) p.hidden = true;
  }
  var quiet = false; // true while init() says the greeting in a tab where the chat was already opened
  function notify(m) {
    if (quiet) return;
    unread++;
    badge();
    // the preview: the message's plain text, without the button rows
    var c = m.cloneNode(true);
    c.querySelectorAll(".c-qr, .minis, button").forEach(function (x) {
      x.remove();
    });
    peek(c.textContent.replace(/\s+/g, " ").trim());
  }
  /** Something Namo wants the student to know (shown in the chat; a notification if it is closed). */
  function alertUser(html) {
    init();
    say("bot", html);
  }
  var lastTop = null;
  /** After preferences change outside the chat (onboarding): tell the student if their best match changed. */
  function refresh() {
    if (!box || !window.S || typeof queue !== "function") return;
    var top = queue()[0];
    if (!top || top.h.id === lastTop) return;
    var before = lastTop;
    lastTop = top.h.id;
    if (before == null) return;
    alertUser(
      "📌 Your preferences changed, so your best match is now <b>" +
        esc(top.h.n) +
        "</b> (" +
        top.pct +
        "% match)." +
        '<div class="minis">' +
        miniHTML(top.h) +
        "</div>" +
        quick("Why is it best?", "Show my matches"),
    );
  }
  function first() {
    return esc(((USER && USER.name) || "there").split(" ")[0]);
  }
  function miniHTML(h, extra) {
    return (
      '<button class="mini" data-id="' +
      h.id +
      '"><b>' +
      esc(h.n) +
      "</b><span>" +
      peso(h.p) +
      " · " +
      h.d +
      " km" +
      (extra || "") +
      "</span></button>"
    );
  }
  function matchesHTML(sort, off) {
    var q = queue();
    ctx.sort = sort || null;
    ctx.off = off || 0;
    if (sort)
      q.sort(function (a, b) {
        return sort === "r"
          ? ratingScore(b.h) - ratingScore(a.h)
          : (a.h[sort] == null ? 1e9 : a.h[sort]) - (b.h[sort] == null ? 1e9 : b.h[sort]);
      });
    if (!q.length) return relaxHint() + webHint();
    var page = q.slice(ctx.off, ctx.off + 3);
    if (!page.length)
      return "That's every room that fits you right now. Say <b>cheaper</b>, <b>farther is fine</b> or relax a must-have to see more.";
    ctx.pending = q.length > ctx.off + 3 ? { act: "more" } : null;
    return (
      '<div class="minis">' +
      page
        .map(function (s) {
          return (
            '<button class="mini" data-id="' +
            s.h.id +
            '"><b>' +
            esc(s.h.n) +
            "</b><span>" +
            peso(s.h.p) +
            " · " +
            s.h.d +
            " km · <em>" +
            s.pct +
            "% match</em></span><small>" +
            esc(why(s)) +
            "</small></button>"
          );
        })
        .join("") +
      "</div>" +
      (ctx.off ? "" : webHint()) // no strong match: offer to search the web (once per visit)
    );
  }
  function relaxHint() {
    // which must-have is blocking everything?
    var best = null,
      keep = JSON.stringify(S.P);
    Object.keys(S.P.m)
      .filter(function (k) {
        return S.P.m[k] === 2;
      })
      .forEach(function (k) {
        S.P.m[k] = 1;
        var n = queue().length;
        S.P = JSON.parse(keep);
        if (n && (!best || n > best.n)) best = { k: k, n: n };
      });
    ctx.pending = best ? { relax: best.k } : null;
    return (
      "No listing fits every must-have." +
      (best
        ? " Relaxing <b>" +
          LBL[best.k] +
          "</b> to “nice to have” would unlock " +
          best.n +
          ". Want me to do that?"
        : "")
    );
  }
  function prefsHTML() {
    var P = S.P,
      by = [[], [], []];
    Object.keys(P.m).forEach(function (k) {
      by[P.m[k]].push(LBL[k]);
    });
    return (
      "Here's what I know you want:<ul><li>Near " +
      esc(P.school) +
      ", up to " +
      P.maxKm +
      " km</li><li>Boarding house up to " +
      peso(P.bhMax) +
      ", apartment up to " +
      peso(P.aptMax) +
      "</li>" +
      "<li>Room: " +
      (P.cap === "any" ? "any size" : P.cap + " people") +
      ", " +
      (P.gender === "any" ? "any gender" : P.gender) +
      "</li>" +
      (by[2].length ? "<li><b>Must have:</b> " + esc(by[2].join(", ")) + "</li>" : "") +
      (by[1].length ? "<li><b>Nice to have:</b> " + esc(by[1].join(", ")) + "</li>" : "") +
      (by[0].length ? "<li><b>Don't care:</b> " + esc(by[0].join(", ")) + "</li>" : "") +
      "</ul>Tell me anything you want to change."
    );
  }
  function likedHTML() {
    var ids = S.likes.concat(S.marks).filter(function (id, i, a) {
        return a.indexOf(id) === i;
      }),
      hs = ids.map(byId).filter(Boolean);
    if (!hs.length)
      return 'You haven\'t liked or bookmarked any rooms yet. Try swiping in <a href="discover.html">Discover</a>! 🔥';
    return (
      'Rooms you liked or bookmarked:<div class="minis">' +
      hs
        .slice(-6)
        .reverse()
        .map(function (h) {
          return miniHTML(h);
        })
        .join("") +
      "</div>"
    );
  }
  var HELP =
    "I can tune your matches from plain sentences, e.g. <i>“near campus, 10 min walk, under 3k, must have wifi, no curfew”</i> or <i>“I'm broke and I have online classes”</i>. You can also ask me about a listing by name, how matching works, or what to check when visiting. Ask “what's best for me?”, “why?” or “compare it with the next one”, and I'll explain my picks. Say <b>undo</b> to revert.";
  var FALLBACK = [
    "Hmm, I'm not sure I got that. 🤔 I'm best at rooms: try “cheaper”, “closer to campus”, “I have online classes” or “show my matches”.",
    "Sorry {name}, that one's beyond me for now. I can help with budget, distance, Wi-Fi, water, curfew and more. Say <b>help</b> for ideas.",
    "I didn't quite catch that. Could you say it another way? For example “I don't want to walk far” or “what are my preferences?”",
  ];
  var miss = 0;

  function pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function joinNice(a) {
    return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  }
  function quick(yes, no) {
    return (
      '<span class="c-qr"><button type="button" data-say="' +
      esc(yes) +
      '">' +
      esc(yes) +
      "</button>" +
      (no ? '<button type="button" data-say="' + esc(no) + '">' + esc(no) + "</button>" : "") +
      "</span>"
    );
  }

  /** One useful follow-up after a change: missing budget or walk first, then "is X a must?". */
  var FOLLOW = [
    [
      "budget",
      function () {
        return S.P.bhMax === DEF.bhMax;
      },
      "What's your monthly budget? For example “under 3k” or “₱2,500”.",
      null,
    ],
    [
      "dist",
      function () {
        return S.P.maxKm === DEF.maxKm;
      },
      "How far are you okay walking to campus? For example “10 min walk” or “1 km”.",
      null,
    ],
    [
      "wifi",
      function () {
        return S.P.m.wifi === 1;
      },
      "Is Wi-Fi a must-have for you, like for online classes?",
      "must have wifi",
    ],
    [
      "water",
      function () {
        return S.P.m.water === 1;
      },
      "Is a reliable 24/7 water supply a must-have?",
      "must have water",
    ],
    [
      "curfew",
      function () {
        return S.P.m.curfew === 1;
      },
      "Do you need a place with no curfew?",
      "no curfew is a must",
    ],
  ];
  function followUp() {
    for (var i = 0; i < FOLLOW.length; i++) {
      var f = FOLLOW[i];
      if (ctx.asked[f[0]] || !f[1]()) continue;
      ctx.asked[f[0]] = 1;
      ctx.topic = "prefs";
      if (f[3]) {
        ctx.pending = { text: f[3] };
        return '<p class="c-follow">' + f[2] + "</p>" + quick("Yes", "No");
      }
      ctx.pending = null;
      return '<p class="c-follow">' + f[2] + "</p>";
    }
    return "";
  }

  /** Questions about the area when no listing is named ("what's the rent around here?", "how many have wifi?"). */
  function marketHTML(k) {
    var all = HOUSES,
      n = all.length;
    if (k === "budget") {
      var ps = all
        .filter(function (h) {
          return h.p != null;
        })
        .map(function (h) {
          return h.p;
        })
        .sort(function (a, b) {
          return a - b;
        });
      ctx.pending = { text: "show cheapest" };
      if (!ps.length)
        return (
          "None of the " +
          n +
          " places publish their rent yet, so it's “rate on request” for all of them. Ask the owners directly."
        );
      return (
        "Of the " +
        n +
        " places, <b>" +
        ps.length +
        "</b>" +
        (ps.length === 1 ? " publishes its rent: " : " publish their rent: from ") +
        (ps.length === 1
          ? "<b>" + peso(ps[0]) + "</b> a month"
          : "<b>" +
            peso(ps[0]) +
            "</b> to <b>" +
            peso(ps[ps.length - 1]) +
            "</b> a month (typical " +
            peso(ps[Math.floor(ps.length / 2)]) +
            ")") +
        ". The other " +
        (n - ps.length) +
        " are “rate on request”, so ask the owner. Want to see the cheapest ones?" +
        quick("Yes", "No")
      );
    }
    if (k === "dist") {
      var near = all.filter(function (h) {
          return h.d <= 0.5;
        }).length,
        mid = all.filter(function (h) {
          return h.d <= 1;
        }).length,
        best = all.slice().sort(function (a, b) {
          return a.d - b.d;
        })[0];
      ctx.pending = { text: "show nearest" };
      return (
        "<b>" +
        near +
        "</b> of the " +
        n +
        " places are within 0.5 km (about a 6-minute walk) and <b>" +
        mid +
        "</b> are within 1 km. The closest is <b>" +
        esc(best.n) +
        "</b> at " +
        best.d +
        " km. Want to see the nearest ones?" +
        quick("Yes", "No")
      );
    }
    var yes = all.filter(function (h) {
      var f = facts(h);
      return k === "water"
        ? f.water === "incl" || f.water247 === true
        : k === "elec"
          ? f.elec === "incl"
          : k === "gender" || k === "cap"
            ? f[k] != null
            : f[k] === true;
    }).length;
    ctx.pending = { act: "show" };
    return (
      "<b>" +
      yes +
      "</b> of the " +
      n +
      " places confirm <b>" +
      esc(LBL[k].toLowerCase()) +
      "</b>; the rest don't say, so I treat it as unverified (never guessed). Want to see your best matches?" +
      quick("Yes", "No")
    );
  }

  /* ---------- learning from activity (insights.js), only with consent ---------- */
  var LEARN_OFF =
    /\b(stop (learning|tracking)|don'?t (track|learn|watch)|turn off learning|forget (my|what you) (activity|history|learned|know)|forget me)\b/;
  var LEARN_ON = /\b(start learning|learn from (me|my)|turn on learning|you can learn)\b/;
  var TASTE =
    /\b(what (do|did) i (usually )?(like|prefer)|my taste|analy[sz]e (me|my)|based on (my )?(activity|history|likes|browsing)|what (have you|did you) learn\w*|know what i like|my habits)\b/;
  function offerHTML(sugs) {
    if (!sugs.length) return "";
    ctx.pending = { apply: sugs };
    return (
      "Want me to update your preferences to match?<ul>" +
      sugs
        .map(function (s) {
          return "<li>" + esc(s.label) + "</li>";
        })
        .join("") +
      "</ul>" +
      quick("Yes, update them", "No")
    );
  }
  function tasteHTML() {
    if (!Insights.asked()) {
      ctx.afterConsent = true;
      return Insights.askHTML();
    }
    if (!Insights.on())
      return (
        "You asked me not to learn from your activity, so I only know the preferences you set. Say “learn from me” if you change your mind.<br><br>" +
        likedHTML()
      );
    return Insights.summaryHTML() + offerHTML(Insights.suggestions());
  }

  /* ---------- explanations written from the match data (explain.js) ---------- */
  var BEST_RX =
    /\b(what('?s| is)|which( one)?( is)?) (the )?(best|top|ideal|perfect|right)\b|\bbest (one|room|place|match|option|pick|fit)?\s*for me\b|\b(top|best) (pick|match|choice)\b|\b(what|which)( one)? should i (choose|pick|get|go with)\b|\bwhat do you (recommend|suggest)\b|\brecommend (one|a room|a place|something)\b/;
  var WHY_RX =
    /^\s*(why|how come)\b|\bexplain\b|\bwhat makes (it|this|that)\b|\bwhy (is|was|does|did|not|isn'?t|no)\b/;
  var CMP_RX =
    /\b(compare|comparison|vs\.?|versus|difference between|which (one )?is better|better than|or the other)\b/;
  function explained(x) {
    if (!x) return null;
    if (x.house) ctx.house = x.house;
    ctx.pending = x.pend || null;
    var more = x.pend && x.pend.compare ? quick("Compare them", "No") : "";
    var extra = (x.house ? '<div class="minis">' + miniHTML(x.house) + "</div>" : "") + more;
    if (window.NamoAI) aiJob = { mode: "explain", facts: NamoAI.plain(x.html), extra: extra };
    return x.html + extra;
  }
  /** "the second one", "#3", "number 2", "the next one" -> that room in the current ranking. */
  var ORD = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    "1st": 1,
    "2nd": 2,
    "3rd": 3,
    "4th": 4,
    "5th": 5,
    top: 1,
  };
  function ordinal(lower) {
    var m = lower.match(
      /\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|next|other|top) (one|place|room|pick|match|option)\b|#\s?(\d)\b|\bnumber (\d)\b/,
    );
    if (!m) return null;
    var q = queue(),
      n = m[3] || m[4] ? +(m[3] || m[4]) : ORD[m[1]];
    if (m[1] === "next" || m[1] === "other") {
      n = 2;
      for (var i = 0; ctx.house && i < q.length; i++) if (q[i].h.id === ctx.house.id) n = i + 2;
    }
    return q[n - 1] ? q[n - 1].h : null;
  }
  function explainFor(r, lower) {
    var hs = r.houses;
    if (CMP_RX.test(lower)) {
      var a = hs[0] || (/\b(it|this|that)\b/.test(lower) && ctx.house) || ordinal(lower) || ctx.house,
        b =
          hs[1] ||
          (a && ordinal(lower) && ordinal(lower).id !== a.id ? ordinal(lower) : null) ||
          (hs[0] && ctx.house && ctx.house.id !== hs[0].id ? ctx.house : null);
      if (!b) {
        var q = queue(),
          other = q.filter(function (s) {
            return !a || s.h.id !== a.id;
          })[0];
        a = a || (q[0] && q[0].h);
        b = other && other.h;
      }
      if (a && b && a.id !== b.id) return explained(Explain.compare(a, b));
    }
    if (WHY_RX.test(lower)) {
      var h = hs[0] || ordinal(lower) || ctx.house;
      if (!h) {
        var top = queue()[0];
        h = top && top.h;
      }
      if (h)
        return explained(
          /\bwhy (not|isn'?t|no)\b|\bnot (in|on|showing)\b|\bhidden\b/.test(lower)
            ? Explain.whyNot(h)
            : Explain.why(h),
        );
    }
    if (BEST_RX.test(lower)) {
      var best = explained(Explain.best()),
        hint = webHint();
      if (best && aiJob) aiJob.extra += hint; // kept when Gemini rewords the answer
      return best ? best + hint : relaxHint() + hint;
    }
    return null;
  }

  /* ---------- knowledge.js answers ---------- */
  var KNOW_ME =
    /\bwhat (do|did) you (know|remember|have) (about|on) me\b|\bwhat('?s| is) (in|inside|on) my cookies?\b|\bmy cookies?\b|\bwhat (data|info(rmation)?) do you (have|keep|store)\b|\bwhat have you (saved|stored)\b/;
  var FORGET_RX =
    /\b(forget|delete|clear|remove|erase) (all )?(my )?(saved )?(preferences|cookies?|data|settings)\b/;
  var REMEMBER_RX = /\b(remember|save|keep) (my )?(preferences|settings|choices)\b/;
  function minis(hs) {
    return (
      '<div class="minis">' +
      hs
        .map(function (h) {
          return miniHTML(h);
        })
        .join("") +
      "</div>"
    );
  }
  /** Asking about a place is interest: it nudges the ranking once per visit, and repeat interest earns a heart offer. */
  var noted = {},
    offered = {};
  function noteInterest(h) {
    if (!window.S || !h) return "";
    S.namo = S.namo || {};
    S.namo.asked = S.namo.asked || {};
    S.namo.asked[h.id] = (S.namo.asked[h.id] || 0) + 1;
    if (!noted[h.id]) {
      noted[h.id] = 1;
      S.views = S.views || {};
      S.views[h.id] = 1;
      S.log.push({ id: h.id, y: 1, w: 0.3 }); // same weak "interested" signal as opening it in Discover
      S.log = S.log.slice(-200);
      if (typeof train === "function") train();
    }
    save();
    if (S.namo.asked[h.id] >= 3 && window.Hearts && !Hearts.has(h.id) && !offered[h.id]) {
      offered[h.id] = 1;
      ctx.pending = { heart: h.id };
      return (
        '<p class="c-follow">You keep coming back to ' +
        esc(h.n) +
        ". Want me to save it to your hearts?</p>" +
        quick("Yes, save it", "No")
      );
    }
    return "";
  }
  /** "tell me about uy pad" -> the full profile; "does uy pad have aircon?" -> just those answers. */
  function listingHTML(h, text) {
    ctx.house = h;
    var keys = Know.attrs(text),
      body = keys.length
        ? "<b>" + esc(h.n) + "</b><br>" + Know.answer(h, keys).map(esc).join("<br>")
        : Know.card(h).html +
          "Ask me anything about it, like “does it have aircon?” or “why is it a good match?”";
    return body + minis([h]) + noteInterest(h);
  }
  /** A question across all listings: answered without touching preferences, then Namo offers to save it. */
  function queryHTML(kq) {
    var n = kq.hits.length,
      out = n
        ? "I found <b>" +
          n +
          "</b> " +
          (n === 1 ? "match" : "matches") +
          " for “" +
          esc(kq.desc) +
          "”" +
          (kq.q.op === "count" ? "." : ":")
        : "No place confirms all of “" + esc(kq.desc) + "” yet.";
    if (n) out += minis(kq.hits.slice(0, 4)) + (n > 4 ? "<small>…and " + (n - 4) + " more.</small>" : "");
    if (kq.maybe.length)
      out +=
        '<p class="c-note">' +
        kq.maybe.length +
        (kq.maybe.length === 1 ? " more place doesn't" : " more places don't") +
        " say either way (unverified), so ask the owner" +
        (n ? "." : ":") +
        "</p>" +
        (n ? "" : minis(kq.maybe.slice(0, 3)));
    if (kq.save.length) {
      ctx.pending = { text: kq.save.join(", ") };
      out +=
        '<p class="c-follow">Want me to remember this in your preferences too?</p>' +
        quick("Yes, remember it", "No");
    }
    return out;
  }
  /** First line when the chat opens: a returning student is welcomed with what they saved. */
  function welcomeHTML() {
    var back = window.S && S.namo && S.namo.seen,
      P = window.S && S.P,
      changed = P && JSON.stringify(P) !== JSON.stringify(DEF);
    if (window.S) {
      S.namo = S.namo || {};
      S.namo.seen = Date.now();
      save();
    }
    if (!back || !changed)
      return (
        "Hi " +
        first() +
        "! I'm Namo 👋 Tell me what you want in a room and I'll tune your matches, or ask me about any dorm by name. Try a chip below."
      );
    var musts = Object.keys(P.m)
        .filter(function (k) {
          return P.m[k] === 2;
        })
        .map(function (k) {
          return LBL[k].toLowerCase();
        }),
      top = typeof queue === "function" ? queue()[0] : null;
    return (
      "Welcome back, " +
      first() +
      "! 👋 You're looking near " +
      esc(P.school) +
      ", within " +
      P.maxKm +
      " km, up to " +
      peso(P.bhMax) +
      (musts.length ? ", with " + esc(joinNice(musts)) + " as a must" : "") +
      "." +
      (top ? " Right now <b>" + esc(top.h.n) + "</b> is your best match (" + top.pct + "%)." : "") +
      quick("Why is it best?", "Show my matches")
    );
  }

  function doAct(act) {
    if (act === "help") return HELP;
    if (act === "show") return "Here's what fits you best:" + matchesHTML(ctx.sort);
    if (act === "more") return "Here are more options:" + matchesHTML(ctx.sort, ctx.off + 3);
    if (act === "prefs") return prefsHTML();
    if (act === "liked") return likedHTML();
    return null;
  }
  function doPending(p) {
    ctx.pending = null;
    if (p.act) return doAct(p.act);
    if (p.text) return reply(p.text);
    if (p.compare) return explained(Explain.compare(byId(p.compare[0]), byId(p.compare[1])));
    if (p.consent != null && window.Consent) {
      Consent.set(p.consent);
      return p.consent
        ? "Done! I'll remember your preferences in this browser and in your preferences cookie, so they're ready next time."
        : "Done. I deleted your saved preferences and the preferences cookie. From now on they last only until you close this tab. You're still logged in.";
    }
    if (p.heart) {
      var hh = byId(p.heart);
      if (hh && window.Hearts && !Hearts.has(hh.id)) Hearts.toggle(hh.id);
      return hh
        ? "Saved <b>" + esc(hh.n) + "</b> to your hearts. ❤️ You'll find it in your liked rooms."
        : null;
    }
    if (p.apply) {
      undoStack.push(JSON.stringify(S.P));
      p.apply.forEach(function (s) {
        s.apply(S.P);
      });
      done();
      return (
        "Done! I tuned your preferences to what you actually look at:<ul>" +
        p.apply
          .map(function (s) {
            return "<li>" + esc(s.label) + "</li>";
          })
          .join("") +
        "</ul>" +
        matchesHTML() +
        '<button class="linkbtn" data-undo>Undo</button>'
      );
    }
    if (p.relax) {
      undoStack.push(JSON.stringify(S.P));
      S.P.m[p.relax] = 1;
      done();
      return (
        "Done, <b>" +
        esc(LBL[p.relax]) +
        "</b> is now nice to have instead of a must-have." +
        matchesHTML() +
        '<button class="linkbtn" data-undo>Undo</button>'
      );
    }
    if (p.intent) {
      var t = Talk.run(p.intent, first());
      return t.act ? doAct(t.act) || t.html : t.html;
    }
    return null;
  }

  function reply(text) {
    // a short yes / no right after Namo asked something answers that question ("Yes, update them", "sure", "no thanks")
    if (ctx.pending && text.trim().split(/\s+/).length <= 4) {
      if (/^\s*(yes|yeah|yep|yup|sure|ok(ay)?|go|please|do it)\b/i.test(text)) return doPending(ctx.pending);
      if (/^\s*(no|nope|nah|later|not now|skip)\b/i.test(text)) {
        ctx.pending = null;
        return "No problem! Just tell me whenever you want to change something.";
      }
    }
    // "about preferences" only lasts for the one reply right after Namo asked a preference question
    var prefsTopic = ctx.topic === "prefs";
    ctx.topic = null;
    var r = parse(text, prefsTopic),
      html,
      lower = text.toLowerCase(),
      greet = Talk.greeting(text) ? "Hi " + first() + "! " : "";
    var asks = r.asks.filter(function (k, i, a) {
      return a.indexOf(k) === i;
    });
    function about(h) {
      ctx.house = h;
      return (
        "<b>" +
        esc(h.n) +
        "</b><br>" +
        asks
          .map(function (k) {
            return esc(fact(h, k));
          })
          .join("<br>")
      );
    }
    if (window.NamoAI && NamoAI.available()) {
      if (
        /\b(stop|turn off|disable|don'?t) (using )?(the )?(ai|gemini)\b|\bno more (ai|gemini)\b/.test(lower)
      ) {
        NamoAI.setConsent(false);
        return "Okay, I'll stop using Gemini and word everything myself again.";
      }
      if (/\b(use|turn on|enable|start using) (the )?(ai|gemini)\b/.test(lower))
        return NamoAI.on() ? "I'm already using Gemini to word my answers." : NamoAI.askHTML();
    }
    if (window.Insights) {
      if (LEARN_OFF.test(lower)) {
        Insights.setConsent(false);
        return "Okay, I stopped learning from your activity and deleted what I'd collected (rooms opened, time spent, searches). Your hearts and swipes still shape your matches like before.";
      }
      if (LEARN_ON.test(lower))
        return Insights.on()
          ? "I'm already learning from your activity. Ask “what do I like?” any time."
          : Insights.askHTML();
      if (TASTE.test(lower)) return tasteHTML();
    }
    // "search the web / online for dorms in Tibanga": places DormNamo doesn't list yet (websearch.js)
    if (window.WebSearch && window.S && WEB_RX.test(lower)) return greet + webSearchHTML(text);
    if (window.Know && window.S) {
      if (KNOW_ME.test(lower)) return Know.meHTML();
      if (FORGET_RX.test(lower) && window.Consent) {
        ctx.pending = { consent: false };
        return (
          "Delete your saved preferences and the preferences cookie? You'll stay logged in, and I'll keep what you set only until you close this tab." +
          quick("Yes, delete them", "No")
        );
      }
      if (REMEMBER_RX.test(lower) && window.Consent) {
        if (Consent.prefs())
          return "I'm already remembering your preferences in this browser and your preferences cookie. Ask “what do you know about me?” to see them.";
        ctx.pending = { consent: true };
        return (
          "Want me to remember your preferences in this browser and a small preferences cookie (180 days), so they're ready next time?" +
          quick("Yes, remember them", "No")
        );
      }
    }
    if (r.intent === "help") return HELP;
    var ex = window.Explain ? explainFor(r, lower) : null;
    if (ex) return greet + ex;
    if (r.intent === "reset") {
      undoStack.push(JSON.stringify(S.P));
      S.P = JSON.parse(JSON.stringify(DEF));
      done();
      return "Preferences reset to defaults." + matchesHTML();
    }
    if (r.intent === "undo") {
      var prev = undoStack.pop();
      if (prev) {
        S.P = JSON.parse(prev);
        done();
        return "Undone." + matchesHTML();
      }
      return "Nothing to undo.";
    }
    if (r.house && window.Know) return greet + listingHTML(r.house, text);
    if (r.house && asks.length) return about(r.house);
    if (ctx.house && r.followUp && window.Know && Know.attrs(text).length)
      return listingHTML(ctx.house, text);
    if (ctx.house && r.followUp && asks.length) return about(ctx.house);
    if (r.followUp && asks.length)
      return "Which place do you mean? Tap a room card or type its name, and I'll check that for you.";

    // a question across all listings ("which dorms have wifi under 4k?"): answer it, don't change preferences
    var kq = !r.house && window.Know ? Know.query(text) : null;
    if (kq) return greet + queryHTML(kq);

    var d = diff(S.P, r.P);
    if (d.length) {
      miss = 0;
      undoStack.push(JSON.stringify(S.P));
      S.P = r.P;
      done();
      var intro = r.why.length
        ? "Got it, " + esc(joinNice(r.why)) + ". I updated:"
        : pickOne(["Got it! I updated:", "Done, here's what changed:", "Okay, I updated your preferences:"]);
      var list = matchesHTML(r.sort); // may set ctx.pending ("more"); a follow-up question below replaces it
      return (
        greet +
        intro +
        "<ul>" +
        d
          .map(function (x) {
            return "<li>" + esc(x) + "</li>";
          })
          .join("") +
        "</ul>" +
        list +
        '<button class="linkbtn" data-undo>Undo</button>' +
        followUp()
      );
    }
    if (r.sort) return greet + "Here you go:" + matchesHTML(r.sort);
    // a question about the area, not about one listing
    if (r.question && asks.length && !r.house) return greet + marketHTML(asks[0]);

    // not a preference change: understand it as conversation
    var t = Talk.understand(text, first());
    if (t && t.id) {
      miss = 0;
      if (t.act === "yes")
        return ctx.pending ? doPending(ctx.pending) : "👍 Great! What else would you like in a room?";
      if (t.act === "no") {
        ctx.pending = null;
        return "No problem! Just tell me whenever you want to change something.";
      }
      html = t.act ? doAct(t.act) : t.html;
      if (t.pend) ctx.pending = t.pend;
      return html;
    }
    if (r.hit || r.seen.length)
      return (
        (r.why.length ? "Got it, " + esc(joinNice(r.why)) + ". " : "Got it. ") +
        esc(
          r.seen
            .map(function (k) {
              return LBL[k];
            })
            .join(", ") || "That",
        ) +
        " already count" +
        (r.seen.length === 1 ? "s" : "") +
        " in your matches." +
        matchesHTML()
      );
    if (/show|recommend|find|suggest|which|options/.test(lower))
      return "Here's what fits you best:" + matchesHTML();
    if (t && t.guess) {
      ctx.pending = t.pend;
      return "I'm not 100% sure. Did you mean “" + esc(t.guess) + "”?";
    }
    // Gemini may answer: about rooms -> from Namo's knowledge (listings named or top matches + preferences); else small talk
    var roomish = window.Know && (r.houses.length || Know.attrs(text).length || ROOMCTX.test(lower));
    aiJob = roomish
      ? { mode: "explain", facts: Know.retrieve(text), extra: "" }
      : { mode: "chat", facts: "", extra: "" };
    return FALLBACK[miss++ % FALLBACK.length].replace("{name}", first());
  }
  function done() {
    S.done = 1;
    save();
    if (window.draw) draw();
  }

  var aiJob = null; // set by reply() when Gemini may reword the answer
  function ask(text) {
    if (!text.trim()) return;
    say("me", esc(text));
    var typing = say("bot typing", "<i></i><i></i><i></i>"),
      t0 = Date.now();
    aiJob = null;
    var html = reply(text),
      job = aiJob;
    aiJob = null;
    function show(h) {
      setTimeout(
        function () {
          typing.remove();
          say("bot", h);
        },
        Math.max(0, 380 - (Date.now() - t0)),
      );
    }
    if (job && window.NamoAI && NamoAI.available() && window.USER) {
      if (!NamoAI.asked()) return show(html + NamoAI.askHTML()); // asked once, before anything is sent
      if (NamoAI.on()) {
        job.q = text;
        NamoAI.phrase(job).then(function (ai) {
          show(ai ? ai + job.extra : html); // null = offline, quota, slow or failed the fact check
        });
        return;
      }
    }
    show(html);
  }

  function init() {
    if (box) return;
    box = document.createElement("div");
    box.id = "chat";
    box.innerHTML =
      '<button class="fab" id="chatFab" aria-label="Ask Namo, the room helper">' +
      ico("chat") +
      '<b>Ask Namo</b><span class="fab-badge" id="chatBadge" hidden aria-hidden="true"></span></button>' +
      '<div class="c-peek" id="chatPeek" hidden role="status"><button type="button" class="c-peek-b" aria-label="Open the chat with Namo"><span class="c-av">' +
      ico("chat") +
      '</span><span class="c-peek-m"><b>Namo</b><span class="c-peek-t"></span></span></button><button type="button" class="c-peek-x" aria-label="Dismiss">' +
      ico("x") +
      "</button></div>" +
      '<section class="cpanel" id="chatPanel" hidden aria-label="Chat with Namo"><header><span class="c-av">' +
      ico("chat") +
      '</span><div><b>Namo</b><small><i class="c-dot" aria-hidden="true"></i>Online · your room helper</small></div><button id="chatX" aria-label="Close chat">' +
      ico("x") +
      "</button></header>" +
      '<div class="clog" id="chatLog" aria-live="polite"></div><div class="cchips" id="chatChips"></div>' +
      '<form id="chatForm"><input id="chatIn" autocomplete="off" placeholder="Describe your ideal room…" aria-label="Message"><button class="btn sm c-send" type="submit" aria-label="Send">' +
      ico("send") +
      "</button></form></section>";
    document.body.appendChild(box);
    log = $("chatLog");
    input = $("chatIn");
    var tips = [
      "What's best for me?",
      "Cheaper, under 3k",
      "Near campus, 10 min walk",
      "I have online classes",
      "What are my preferences?",
      "Show cheapest",
      "Girls only",
      "What should I ask the landlord?",
      "What do I like?",
    ];
    $("chatChips").innerHTML = tips
      .map(function (t) {
        return '<button type="button">' + t + "</button>";
      })
      .join("");
    $("chatChips").onwheel = function (e) {
      // the chip row hides its scrollbar, so let a mouse wheel scroll it sideways
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && this.scrollWidth > this.clientWidth) {
        this.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    $("chatChips").onclick = function (e) {
      if (e.target.tagName === "BUTTON") ask(e.target.textContent);
    };
    $("chatFab").onclick = open;
    $("chatPeek").querySelector(".c-peek-b").onclick = open;
    $("chatPeek").querySelector(".c-peek-x").onclick = hidePeek;
    $("chatX").onclick = function () {
      $("chatPanel").hidden = true;
      $("chatFab").hidden = false;
    };
    $("chatForm").onsubmit = function (e) {
      e.preventDefault();
      ask(input.value);
      input.value = "";
    };
    log.onclick = function (e) {
      var mini = e.target.closest(".mini");
      if (mini) {
        ctx.house = byId(+mini.dataset.id);
        open_(+mini.dataset.id);
      }
      if (e.target.dataset.undo !== undefined) ask("undo");
      var q = e.target.closest("[data-say]");
      if (q && !q.disabled) {
        q.parentNode.querySelectorAll("button").forEach(function (b) {
          b.disabled = true;
        });
        ask(q.dataset.say);
      }
      var ai = e.target.closest("[data-ai]");
      if (ai && !ai.disabled && window.NamoAI) {
        var useAI = ai.dataset.ai === "1";
        ai.parentNode.querySelectorAll("button").forEach(function (b) {
          b.disabled = true;
        });
        NamoAI.setConsent(useAI);
        say("me", useAI ? "Yes, use Gemini" : "No, keep it local");
        say(
          "bot",
          useAI
            ? "Done! I'll ask Gemini to word my answers. I still choose every fact myself and check each reply before you see it. Say “stop using AI” any time."
            : "No problem, I'll keep everything on this device and use my own wording.",
        );
      }
      var c = e.target.closest("[data-consent]");
      if (c && !c.disabled && window.Insights) {
        var yes = c.dataset.consent === "1";
        c.parentNode.querySelectorAll("button").forEach(function (b) {
          b.disabled = true;
        });
        Insights.setConsent(yes);
        say("me", yes ? "Yes, learn from my activity" : "No thanks");
        var more = ctx.afterConsent && yes;
        ctx.afterConsent = false;
        say(
          "bot",
          yes
            ? "Thanks! 🙌 From now on I'll learn from the rooms you open, heart, skip and search for. Ask “what do I like?” any time, or say “stop learning”." +
                (more ? "<br><br>" + tasteHTML() : "")
            : "No problem! I won't look at your activity. Your hearts and swipes still shape your matches as usual, and you can say “learn from me” if you change your mind.",
        );
      }
    };
    quiet = seenThisTab();
    say("bot", welcomeHTML());
    if (window.Insights && window.USER && !Insights.asked()) say("bot", Insights.askHTML());
    quiet = false;
    if (window.S && typeof queue === "function" && queue()[0]) lastTop = queue()[0].h.id;
  }
  /* ---------- web search when DormNamo has no good match (websearch.js) ---------- */
  var WEB_RX =
      /\b(search|look|check|browse|find|hunt)\b[^.?!]{0,40}\b(the )?(web|online|internet|google|elsewhere|outside dormnamo)\b|\bweb ?search\b|\bsearch (the )?(web|internet)\b|\bmore places (online|on the web)\b/,
    GOOD_MATCH = 80, // below this, Namo offers to search the web
    webHinted = false,
    webSearched = false;
  /** One offer per visit, when nothing matches the must-haves or the best match is under GOOD_MATCH. */
  function webHint() {
    if (webHinted || webSearched || !window.WebSearch || !window.S) return "";
    var q = queue(),
      top = q[0];
    if (top && top.pct >= GOOD_MATCH) return "";
    webHinted = true;
    var reg = WebSearch.region(S.P);
    return (
      '<p class="c-follow">' +
      (top
        ? "Your best match here is " + top.pct + "%, not a strong fit yet."
        : "Nothing on DormNamo meets all your must-haves.") +
      " Want me to search the web for more places within " +
      reg.r +
      " km of " +
      esc(reg.school) +
      "? I'll list the links I find.</p>" +
      quick("Search the web for more places")
    );
  }
  /** "dorms in Tibanga" -> "Tibanga" (not the school, not "the web"). */
  function areaFrom(text) {
    // any of Iligan's barangays named anywhere in the message ("dorms around tibanga", "pala-o boarding house")
    var low =
        " " +
        String(text)
          .toLowerCase()
          .replace(/[^a-z0-9.'-]+/g, " ") +
        " ",
      brgy = (window.BARANGAYS || [])
        .slice()
        .sort(function (a, b) {
          return b.length - a.length; // "Upper Hinaplanon" before "Hinaplanon"
        })
        .filter(function (b) {
          return low.indexOf(" " + b.toLowerCase() + " ") >= 0;
        })[0];
    if (brgy) return brgy;
    var m = String(text).match(
      /\b(?:in|near|around|at|within)\s+([A-Za-z][A-Za-z .'-]{2,30}?)(?=[,.?!]|\s+(?:please|pls|for|with|under|below)\b|$)/i,
    );
    if (!m) return "";
    var a = m[1].trim();
    if (/^(the )?(web|internet|online|google|facebook|area|city|campus|school|my area)$/i.test(a)) return "";
    if (window.S && a.toLowerCase() === String(S.P.school).toLowerCase()) return "";
    if (/^\d|\bkm\b|\bminutes?\b/i.test(a)) return "";
    return a.replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }
  function typeFrom(text) {
    var t = String(text).toLowerCase();
    return /\bapartments?\b|\bcondo/.test(t)
      ? "Apartment"
      : /\bdorm(itor(y|ies))?s?\b|\bresidence hall/.test(t)
        ? "Dormitory"
        : /\bboarding|\bbedspace|\bpension/.test(t)
          ? "Boarding house"
          : "any";
  }
  function webResultsHTML(res) {
    var reg = res.region,
      n = res.places.length,
      where = esc(reg.area && !reg.missed ? reg.area : reg.school),
      out = "";
    if (reg.missed)
      out +=
        '<small class="c-note">I couldn\'t find “' +
        esc(reg.area) +
        "” on the map, so I searched around " +
        esc(reg.school) +
        ".</small>";
    if (!res.ok)
      out +=
        "I couldn't reach the map search right now (it may be busy, or you're offline). You can still search these yourself:";
    else if (n)
      out +=
        "🌐 I found <b>" +
        n +
        (n === 1 ? " place" : " places") +
        "</b> on OpenStreetMap within " +
        reg.r +
        " km of " +
        where +
        " that " +
        (n === 1 ? "isn't" : "aren't") +
        " on DormNamo yet:" +
        '<ol class="c-web">' +
        res.places
          .slice(0, 8)
          .map(function (p) {
            var main = p.site || p.osm || p.gmaps;
            return (
              '<li><a href="' +
              esc(main) +
              '" target="_blank" rel="noopener nofollow">' +
              esc(p.name) +
              "</a><small>" +
              esc(p.kind) +
              (p.where ? " · " + esc(p.where) : "") +
              " · " +
              p.km +
              " km, about " +
              p.walk +
              " min walk" +
              (p.phone ? " · " + esc(p.phone) : "") +
              '</small><span class="c-web-l">' +
              (p.site
                ? '<a href="' + esc(p.site) + '" target="_blank" rel="noopener nofollow">Website</a>'
                : "") +
              (p.osm ? '<a href="' + esc(p.osm) + '" target="_blank" rel="noopener nofollow">Map</a>' : "") +
              '<a href="' +
              esc(p.gmaps) +
              '" target="_blank" rel="noopener nofollow">Google Maps</a></span></li>'
            );
          })
          .join("") +
        "</ol>" +
        (n > 8 ? "<small>…and " + (n - 8) + " more on the map.</small>" : "") +
        '<p class="c-note">Rent, rules and free rooms aren\'t on the map (unverified), so message or call them before you visit.</p>' +
        "Search further:";
    else
      out +=
        "OpenStreetMap has no other places to stay mapped within " +
        reg.r +
        " km of " +
        where +
        " yet. These searches cover what isn't mapped:";
    // most boarding houses here advertise on social media, so those come first when the map has nothing
    function group(g, title) {
      var ls = res.links.filter(function (l) {
        return (l.group || "web") === g;
      });
      return ls.length
        ? '<b class="c-web-h">' +
            title +
            '</b><ul class="c-web c-web-more' +
            (g === "social" ? " c-web-social" : "") +
            '">' +
            ls
              .map(function (l) {
                return (
                  '<li><a href="' +
                  esc(l.url) +
                  '" target="_blank" rel="noopener nofollow">' +
                  esc(l.label) +
                  "</a><small>" +
                  esc(l.note) +
                  "</small></li>"
                );
              })
              .join("") +
            "</ul>"
        : "";
    }
    var social = group("social", "📱 Social media"),
      web = group("web", "🔎 Search engines and maps");
    out +=
      (n ? web + social : social + web) +
      "<small class=\"c-note\">These open each site's own search (some ask you to log in). I don't read those sites myself, so check the posts and message the owners there.</small>" +
      '<small class="c-note">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a></small>';
    return out;
  }
  /** Start the search; the results arrive as a new message a few seconds later. */
  function webSearchHTML(text) {
    webSearched = true;
    var area = areaFrom(text),
      type = typeFrom(text),
      reg = WebSearch.region(S.P, area),
      what = {
        any: "places to stay",
        Dormitory: "dormitories",
        "Boarding house": "boarding houses",
        Apartment: "apartments",
      }[type];
    WebSearch.run(S.P, { area: area, type: type }).then(function (res) {
      if (box) say("bot", webResultsHTML(res));
    });
    return (
      "🔎 Searching the web (OpenStreetMap) for " +
      esc(what) +
      " within " +
      reg.r +
      " km of " +
      esc(area || reg.school) +
      " that DormNamo doesn't list yet. This takes a few seconds…" +
      '<small class="c-note">Only the area and room type are sent, nothing about your account.</small>'
    );
  }

  var tipped = false;
  /** Once per visit: if Namo has learned something useful, offer it when the chat opens. */
  function tip() {
    if (tipped || !window.Insights || !Insights.on()) return;
    var sugs = Insights.suggestions();
    if (!sugs.length) return;
    tipped = true;
    say(
      "bot",
      "👀 I noticed something from what you've been looking at. " + Insights.summaryHTML() + offerHTML(sugs),
    );
  }
  function open_(id) {
    if (window.open && typeof window.open === "function") window.open(id);
  }
  function open() {
    init();
    $("chatPanel").hidden = false;
    $("chatFab").hidden = true;
    unread = 0;
    badge();
    hidePeek();
    try {
      sessionStorage.setItem(SEEN, "1");
    } catch (e) {}
    tip();
    input.focus();
  }
  return {
    init: init,
    open: open,
    refresh: refresh,
    notify: alertUser,
    ask: ask,
    parse: parse,
    reply: reply,
  };
})();
