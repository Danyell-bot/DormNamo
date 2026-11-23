/* ==========================================================
   chat.js - "Namo", the preference chatbot
   Reads natural sentences (English, Tagalog, Cebuano, typos ok)
   and turns them into changes to the user's preferences.

   How it works (all local, no API):
   1. normalize + stem each word, fix typos with a bounded
      Levenshtein search limited to words of similar length
   2. look every word up in a hash map (word -> concept), O(1)
   3. split into clauses; per clause detect strength ("must",
      "kailangan"), skip/negation ("don't care", "walay"), and
      numbers (km, minutes, pesos, "3k", persons)
   4. PHRASES catch whole ideas said in other words
      ("I'm broke" = cheaper, "online classes" = Wi-Fi)
   5. apply changes to S.P, save, then re-rank with matching.js
   6. anything that isn't a preference goes to talk.js
      (greetings, thanks, questions, feelings, yes/no)
   ========================================================== */
var Chat = (function () {
  // concept -> synonyms (stems; trailing "s" is stripped from input)
  var WORDS = {
    dist: "near nearby close closer closest walk walking walkable distance malapit duol lakaw layo campus gate commute",
    budget:
      "budget cheap cheaper affordable barato mura tipid rent price pricey expensive mahal gasto money pera kwarta cost",
    cap: "roommate sharing share person people pax capacity solo alone ka-tawo",
    gender: "male female boy girl man woman men women lalaki babae mixed coed co-ed gender lady ladie",
    water: "water tubig supply shower",
    elec: "electricity electric kuryente power brownout outage",
    env: "clean cleanliness limpyo malinis peaceful quiet tahimik safe safety luwas ligtas secure security noise noisy cctv guard",
    kit: "kitchen cook cooking kusina luto stove",
    wifi: "wifi wi-fi internet net online connection signal",
    space: "spacious space roomy maluwag cramped",
    curfew: "curfew",
    vis: "visitor guest bisita",
  };
  // whole ideas -> a concept (wanted) or an action. Checked per clause, before single words.
  var PHRASES = [
    [
      /\b(broke|tight budget|low budget|limited budget|student budget|no money|walay kwarta|walang pera|wala.{0,6}(pera|kwarta)|save money|can'?t afford|cannot afford|too expensive|too pricey|less expensive|inexpensive|budget[- ]friendly|lower (the )?(price|rent)|kuripot|sakto ra)\b/,
      "cheaper",
    ],
    [
      /\b(more budget|bigger budget|higher budget|can (spend|pay) more|money (is )?not (an )?(issue|problem)|don'?t mind paying|premium|luxur\w*)\b/,
      "pricier",
    ],
    [
      /\b(don'?t (want|like) to walk|hate walking|short walk|lazy to walk|tamad (mag)?lakad|right next to|beside (the )?(campus|school)|tapad sa)\b/,
      "closer",
    ],
    [/\b(walk to (school|class|campus)|near (the )?(school|campus|university))\b/, "dist"],
    [
      /\b(don'?t mind (the |a )?(walk|distance|commute)|far is (fine|ok(ay)?)|can commute|ride (a )?jeep|okay lang layo|ok lang layo)\b/,
      "farther",
    ],
    [
      /\b(can'?t sleep|light sleeper|study in peace|focus on (my )?stud\w*|need (to )?focus|safe (area|neighborhood|place)|no (noise|cockroach\w*|ipis|bugs)|dirty|ipis|cockroach\w*|bed ?bugs?)\b/,
      "env",
    ],
    [
      /\b(cook (my )?own|prepare (my )?(own )?food|meal prep|i like to cook|rice cooker|own food|mag ?luto)\b/,
      "kit",
    ],
    [
      /\b(online class\w*|zoom|google meet|stream\w*|gaming|netflix|work from home|wfh|remote work|research|upload|download|data connection|strong signal)\b/,
      "wifi",
    ],
    [
      /\b(big(ger)? room|large room|lots of (stuff|things)|more space|room to move|not cramped|gamay kaayo)\b/,
      "space",
    ],
    [
      /\b(come home late|go home late|get home late|uwi.{0,4}late|late uwi|night shift|late (at )?night|out late|gabii.{0,4}uli|uli.{0,4}gabii|party|parties)\b/,
      "curfew",
    ],
    [
      /\b(friends? (can )?(come|visit|over)|(bf|gf|boyfriend|girlfriend|jowa|partner|family|parents|mama|papa|friends?|groupmates?)\b.{0,14}\b(visit\w*|come over|sleep ?over)|group study|study group)\b/,
      "vis",
    ],
    [
      /\b(water (problem|shortage|interruption)|always (have )?water|no water|walay tubig|walang tubig|enough water|water pressure)\b/,
      "water",
    ],
    [/\b(brownouts?|power outage|electric bill|submeter\w*|bayad kuryente|own meter)\b/, "elec"],
    [
      /\b(i'?m (a )?(girl|woman|lady|female|babae)|for (girls|ladies|women)|girls only|ladies only)\b/,
      "female",
    ],
    [/\b(i'?m (a )?(guy|boy|man|male|lalaki)|for (boys|guys|men)|boys only|guys only)\b/, "male"],
  ];
  var ACTIONS = { cheaper: 1, pricier: 1, closer: 1, farther: 1, female: 1, male: 1 };
  var CUE = {
    must: "must need require required kailangan dapat importante essential definitely always",
    skip: "skip ignore whatever bahala",
  };
  var SKIP_RX =
    /don'?t care|doesn'?t matter|not important|no need|okay lang|ok lang|pwede na|di importante|dili importante|ayaw|ignore|skip/;
  var NEG_RX = /\b(no|without|not|walay|wala|di|dili|hindi|never)\b/;
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
  "room home house place show find stay good food mood need more some soon want will wait walk spot late date hate rate look looking living staying sleeping sleeper sometimes hi hello thank thanks"
    .split(" ")
    .forEach(function (w) {
      addWord(w);
    });

  // listing index: distinctive name/area words -> listing id
  var NAME = {};
  (function () {
    var seen = {};
    HOUSES.forEach(function (h) {
      tok(h.n + " " + h.a).forEach(function (w) {
        if (w.length > 3 && !STOP.test(w) && (seen[w] = seen[w] || []).indexOf(h.id) < 0) seen[w].push(h.id);
      });
    });
    Object.keys(seen).forEach(function (w) {
      if (seen[w].length === 1) {
        NAME[w] = seen[w][0];
        addWord(w);
      }
    });
  })();

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
  function repair(w) {
    // fix a typo using only words of similar length
    if (VOCAB[w] || w.length < 4 || /\d/.test(w)) return w;
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
  var NUM = { one: 1, two: 2, three: 3, four: 4, dalawa: 2, duha: 2, tulo: 3, upat: 4, apat: 4 };
  function num(s) {
    return NUM[s] || +s;
  }

  // ---- parse one message into preference changes
  function parse(text) {
    var P = JSON.parse(JSON.stringify(S.P)),
      out = { P: P, hit: false, intent: null, seen: [] };
    var raw = text.toLowerCase();
    if (/\b(reset|start over|clear (all|everything))\b/.test(raw)) {
      out.intent = "reset";
      return out;
    }
    if (/^\s*(undo|revert|ibalik)/.test(raw)) {
      out.intent = "undo";
      return out;
    }
    if (/^\s*(help|what can you do)\b/.test(raw)) {
      out.intent = "help";
      return out;
    }
    if (/cheapest|pinakamura|labing mura/.test(raw)) out.sort = "p";
    else if (/nearest|closest|pinakamalapit|pinakaduol/.test(raw)) out.sort = "d";
    else if (/best rated|highest rated|top rated|highest rating/.test(raw)) out.sort = "r";

    var carry = null; // "need wifi, kitchen and water": the cue carries to the next list items
    raw.split(/([.;?!]| but | pero |,| and | ug | at )/).forEach(function (clause, idx) {
      if (idx % 2) {
        if (/^[.;?!]$|but|pero/.test(clause)) carry = null;
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
          /(\d+|one|two|three|four|dalawa|duha|tulo|upat|apat)\s*(?:persons?|people|pax|roommates?|ka\s?tawo|sharing|to a room)/,
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
          if (ACTIONS[p[1]]) acts[p[1]] = 1;
          else if (wanted.indexOf(p[1]) < 0) wanted.push(p[1]);
        }
      });
      if (/cheaper|mas barato|mura pa|mas mura|tipid/.test(c)) acts.cheaper = 1;
      if (/closer|nearer|mas duol|mas malapit/.test(c)) acts.closer = 1;
      if (/farther|further|mas layo/.test(c)) acts.farther = 1;
      var concepts = words
        .map(function (w) {
          return CONCEPT[w];
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
          var g = /\b(male|boy|man|men|lalaki)\b/.test(c)
            ? "male"
            : /\b(female|girl|woman|women|babae)\b/.test(c)
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
          /\b(near|by|sa|duol|malapit|school|campus|at)\b|iit|xu|ustp/.test(c)
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
        return CONCEPT[w];
      })
      .filter(Boolean);
    if (/how much|magkano|tagpila|pila ang|pila ka/.test(raw)) out.asks.push("budget");
    if (/how far|gaano kalayo|unsa ka layo/.test(raw)) out.asks.push("dist");
    for (var i = 0; i < ws.length; i++)
      if (NAME[ws[i]]) {
        out.house = byId(NAME[ws[i]]);
        break;
      }
    // "does it have wifi?" right after looking at a listing = a question about that listing
    out.followUp =
      /\b(it|this|that|there|this one|that one|ito|iyan|yan|niini|ana|diha|dinhi)\b/.test(raw) &&
      /\?|^\s*(does|is|do|has|have|how|can|any|may|meron|naa|unsa|ano|pila|magkano)\b/.test(raw);
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
  var ctx = { house: null, pending: null, sort: null, off: 0 };
  function say(who, html) {
    var m = document.createElement("div");
    m.className = "msg " + who;
    m.innerHTML = html;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
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
    if (!q.length) return relaxHint();
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
      "</div>"
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
    "I can tune your matches from plain sentences, e.g. <i>“near campus, 10 min walk, under 3k, must have wifi, no curfew”</i> or <i>“I'm broke and I have online classes”</i>. You can also ask me about a listing by name, how matching works, or what to check when visiting. I understand English, Tagalog and Cebuano. Say <b>undo</b> to revert.";
  var FALLBACK = [
    "Hmm, I'm not sure I got that. 🤔 I'm best at rooms: try “cheaper”, “closer to campus”, “I have online classes” or “show my matches”.",
    "Sorry {name}, that one's beyond me for now. I can help with budget, distance, Wi-Fi, water, curfew and more. Say <b>help</b> for ideas.",
    "I didn't quite catch that. Could you say it another way? For example “I don't want to walk far” or “what are my preferences?”",
  ];
  var miss = 0;

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
    var r = parse(text),
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
    if (r.intent === "help") return HELP;
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
    if (r.house && asks.length) return about(r.house);
    if (r.house) {
      ctx.house = r.house;
      return (
        "Here it is. Ask me about its price, distance, Wi-Fi, water or rules." +
        '<div class="minis">' +
        miniHTML(r.house) +
        "</div>"
      );
    }
    if (ctx.house && r.followUp && asks.length) return about(ctx.house);
    if (r.followUp && asks.length)
      return "Which place do you mean? Tap a room card or type its name, and I'll check that for you.";

    var d = diff(S.P, r.P);
    if (d.length) {
      miss = 0;
      undoStack.push(JSON.stringify(S.P));
      S.P = r.P;
      done();
      return (
        greet +
        "Updated your preferences:<ul>" +
        d
          .map(function (x) {
            return "<li>" + esc(x) + "</li>";
          })
          .join("") +
        "</ul>" +
        matchesHTML(r.sort) +
        '<button class="linkbtn" data-undo>Undo</button>'
      );
    }
    if (r.sort) return greet + "Here you go:" + matchesHTML(r.sort);

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
        "Got it. " +
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
    if (/show|recommend|find|suggest|best|which|asa|pakita/.test(lower))
      return "Here's what fits you best:" + matchesHTML();
    if (t && t.guess) {
      ctx.pending = t.pend;
      return "I'm not 100% sure. Did you mean “" + esc(t.guess) + "”?";
    }
    return FALLBACK[miss++ % FALLBACK.length].replace("{name}", first());
  }
  function done() {
    S.done = 1;
    save();
    if (window.draw) draw();
  }

  function ask(text) {
    if (!text.trim()) return;
    say("me", esc(text));
    var typing = say("bot typing", "<i></i><i></i><i></i>");
    setTimeout(function () {
      typing.remove();
      say("bot", reply(text));
    }, 380);
  }

  function init() {
    if (box) return;
    box = document.createElement("div");
    box.id = "chat";
    box.innerHTML =
      '<button class="fab" id="chatFab" aria-label="Ask Namo, the room helper">' +
      ico("chat") +
      "<b>Ask Namo</b></button>" +
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
      "Cheaper, under 3k",
      "Near campus, 10 min walk",
      "I have online classes",
      "What are my preferences?",
      "Show cheapest",
      "Girls only",
      "What should I ask the landlord?",
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
    };
    say(
      "bot",
      "Hi " +
        first() +
        "! I'm Namo 👋 Tell me what you want in a room and I'll tune your matches, or just chat. Ask me anything, or try a chip below.",
    );
  }
  function open_(id) {
    if (window.open && typeof window.open === "function") window.open(id);
  }
  function open() {
    init();
    $("chatPanel").hidden = false;
    $("chatFab").hidden = true;
    input.focus();
  }
  return { init: init, open: open, refresh: function () {}, ask: ask, parse: parse, reply: reply };
})();
