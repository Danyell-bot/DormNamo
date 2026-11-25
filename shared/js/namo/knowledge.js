/* ==========================================================
   knowledge.js - everything Namo knows about the site and the student
   One place that reads every variable DormNamo has, so Namo can answer
   anything about it:
     listings      HOUSES (incl. owners' listings), facts(), amenities,
                   rating() (Google + tenants), hearts, comments, photos,
                   contact, verified / featured, the student's match %
     the student   preferences S.P, the dn_prefs cookie and consent status,
                   likes / bookmarks / passes, learning and Gemini settings
   API:
     find(text)          listings named in a message (full name, short form,
                         distinctive word, or a close typo); exact words win
     card(h)             a listing's full profile {html, plain}
     attrs(text)         which details a question asks about ("aircon", "rent"…)
     answer(h, keys)     answers about one listing, never guessed
     query(text)         questions across all listings ("dorms with wifi under 4k?")
     meHTML()            what Namo knows about the student, incl. the cookie
     retrieve(text)      plain facts for Gemini (listings named + preferences)
   ========================================================== */
var Know = (function () {
  // words that describe the kind of place, not which one ("Residences", "Boarding House"…)
  var GENERIC =
    /^(boarding|house|houses|dormitory|dormitories|dorm|dorms|residence|residences|hall|apartment|apartments|room|rooms|bedspace|inn|lodge|ladies|boys|girls|the|of|and|st|west|east|north|south)$/;

  /** "Flora's Residence-Hall, T&D" -> ["flora", "residence", "hall", "td"] */
  function norm(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/(\w)&(\w)/g, "$1$2") // T&D -> td
      .replace(/['’]s\b/g, "")
      .replace(/['’.]/g, "")
      .replace(/[^a-z0-9₱]+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean);
  }
  function lev(a, b, max) {
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

  /* ---------- the name index (rebuilt when owners add listings) ---------- */
  var index = null,
    indexed = -1;
  function build() {
    var aliases = [],
      single = {};
    HOUSES.forEach(function (h) {
      var full = norm(h.n),
        core = full.filter(function (w, i) {
          return !GENERIC.test(w) && !(w.length === 1 && i === full.length - 1); // "… House D" -> drop the D
        }),
        // "T&D", "JR", "MB": a short all-caps first word is a real name, so 2-3 letters are enough
        acro = /^[A-Z][A-Z&.]{1,4}$/.test(h.n.split(/\s+/)[0]) ? norm(h.n.split(/\s+/)[0])[0] : null;
      add(full.join(" "), h, 3);
      if (core.length >= 2 || (core.length === 1 && (core[0].length >= 3 || core[0] === acro)))
        add(core.join(" "), h, 2);
      core.forEach(function (w) {
        if (w.length >= 4 || w === acro) (single[w] = single[w] || []).push(h);
      });
    });
    Object.keys(single).forEach(function (w) {
      if (single[w].length === 1) add(w, single[w][0], 1); // only words that point at one place
    });
    function add(phrase, h, weight) {
      if (!phrase) return;
      for (var i = 0; i < aliases.length; i++) if (aliases[i].p === phrase && aliases[i].h === h) return;
      aliases.push({ p: phrase, n: phrase.split(" ").length, h: h, w: weight });
    }
    aliases.sort(function (a, b) {
      return b.p.length - a.p.length;
    });
    indexed = HOUSES.length;
    return (index = aliases);
  }
  /** Listings named in a message, in the order they appear. Exact words first, then close typos. */
  function find(text) {
    // a pasted reference number (DN-B6648126 or the full UUID) names exactly one listing
    var ref = String(text || "").match(
      /\b(?:dn-)?([0-9a-f]{8})(?:-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?\b/i,
    );
    if (ref && /\d/.test(ref[1])) {
      var byRef = HOUSES.filter(function (h) {
        return h.ref && h.ref.slice(0, 8).toLowerCase() === ref[1].toLowerCase();
      });
      if (byRef.length === 1) return byRef;
    }
    if (!index || indexed !== HOUSES.length) build();
    var ws = norm(text),
      msg = " " + ws.join(" ") + " ",
      hits = [];
    index.forEach(function (a) {
      var at = msg.indexOf(" " + a.p + " ");
      if (at >= 0) hits.push({ h: a.h, at: at, exact: 1 });
    });
    if (!hits.length)
      index.forEach(function (a) {
        // typos only on the distinctive part of a name: full names contain generic words ("a residence" is not
        // "M Residences"), and short names must match exactly ("best" must never become "west")
        if (a.w === 3 || a.p.replace(/ /g, "").length < 5) return;
        var max = a.p.length >= 9 ? 2 : 1;
        for (var i = 0; i + a.n <= ws.length; i++) {
          var win = ws.slice(i, i + a.n).join(" ");
          if (Math.abs(win.length - a.p.length) <= max && lev(win, a.p, max) <= max)
            hits.push({ h: a.h, at: i * 10, exact: 0 });
        }
      });
    hits.sort(function (x, y) {
      return x.at - y.at;
    });
    var out = [];
    hits.forEach(function (x) {
      if (out.indexOf(x.h) < 0) out.push(x.h);
    });
    return out;
  }

  /* ---------- one listing, everything about it ---------- */
  function mins(km) {
    return Math.max(1, Math.round(km * 12));
  }
  function rankOf(h) {
    if (!window.S || typeof queue !== "function") return null;
    var q = queue();
    for (var i = 0; i < q.length; i++) if (q[i].h.id === h.id) return { i: i, n: q.length, pct: q[i].pct };
    return null;
  }
  /** Confirmed facts and amenities, and what the listing doesn't say. */
  function known(h) {
    var f = facts(h),
      yes = [],
      no = [],
      unknown = [];
    function said(v, ok, bad, k) {
      if (v === true) yes.push(ok);
      else if (v === false) no.push(bad);
      else unknown.push(k);
    }
    said(f.wifi, "Wi-Fi", "no Wi-Fi", "Wi-Fi");
    said(f.kit, "a kitchen", "no kitchen", "a kitchen");
    if (f.water === "incl") yes.push("water included in rent");
    else if (f.water === "extra") no.push("water paid separately");
    said(f.water247, "24/7 water", "water that isn't 24/7", "the water supply");
    if (f.elec === "incl") yes.push("electricity included");
    else if (f.elec === "extra") no.push("electricity paid separately");
    else unknown.push("electricity");
    said(f.curfew === true ? false : f.curfew === false ? true : null, "no curfew", "a curfew", "a curfew");
    said(f.vis, "visitors allowed", "no visitors", "visitors");
    if (f.cap) yes.push(f.cap + (f.cap === 1 ? " person" : " people") + " per room");
    else unknown.push("how many share a room");
    if (f.gender) yes.push(f.gender.length > 1 ? "male and female tenants" : f.gender[0] + " tenants only");
    else unknown.push("who can stay");
    if (f.env === true) yes.push("described as clean and peaceful");
    if (f.space === true) yes.push("spacious rooms");
    else if (f.space === false) no.push("small rooms");
    (h.am || []).forEach(function (a) {
      if (!/wi-?fi/i.test(a) || f.wifi !== true) yes.push(a);
    });
    return { yes: yes, no: no, unknown: unknown };
  }
  function card(h) {
    var k = known(h),
      r = rating(h),
      hearts = window.Hearts ? Hearts.count(h.id) : 0,
      cm = window.Comments ? Comments.list(h.id).length : 0,
      sp = window.Photos ? Photos.split(h) : { cover: null, rooms: [] },
      own = sp.rooms.length,
      rk = rankOf(h),
      tags = [h.v ? "Verified" : "", h.f ? "Featured" : "", h.own ? "Listed by the owner" : ""].filter(
        Boolean,
      ),
      lines = [
        h.t + " in " + h.a + (tags.length ? " · " + tags.join(" · ") : ""),
        "Walk: " + h.d + " km from " + h.s + " (about " + mins(h.d) + " minutes)",
        "Rent: " + (h.p == null ? "not published (rate on request, ask the owner)" : peso(h.p) + " a month"),
        "Rating: " +
          (r
            ? "★ " + r.avg.toFixed(1) + " from " + r.n + (r.n === 1 ? " rating" : " ratings")
            : "no ratings yet"),
        "Confirmed: " +
          (k.yes.length ? k.yes.join(", ") : "nothing beyond the basics yet") +
          (k.no.length ? "; not offered: " + k.no.join(", ") : ""),
        "Not stated (unverified): " + (k.unknown.length ? k.unknown.join(", ") : "nothing"),
        "Saved by " +
          hearts +
          (hearts === 1 ? " student" : " students") +
          " · " +
          cm +
          (cm === 1 ? " comment" : " comments") +
          " · " +
          (sp.cover ? "a cover photo" : "no cover photo") +
          ", " +
          (own ? own + (own === 1 ? " room photo" : " room photos") : "no room photos yet"),
        "Contact: " + (/\d/.test(h.c || "") ? "phone number listed" : "no phone listed"),
      ];
    if (h.ref) lines.push("Reference no.: " + refShort(h));
    if (rk) lines.push("For you: " + rk.pct + "% match, #" + (rk.i + 1) + " of " + rk.n);
    else if (window.S && typeof score === "function" && score(h).fail)
      lines.push("For you: hidden from your matches by a must-have");
    return {
      plain: h.n + "\n" + lines.join("\n"),
      html:
        "<b>" +
        esc(h.n) +
        '</b><ul class="kn">' +
        lines
          .map(function (l) {
            return "<li>" + esc(l) + "</li>";
          })
          .join("") +
        "</ul>",
    };
  }

  /* ---------- questions about details ---------- */
  var ATTR = [
    ["wifi", /\bwi-?fi\b|\binternet\b|\bwifi\b/],
    ["kit", /\bkitchens?\b|\bcook(ing)?\b/],
    ["water", /\bwater\b/],
    ["elec", /\belectric(ity)?\b|\bpower\b|\bbrownouts?\b/],
    ["curfew", /\bcurfews?\b/],
    ["vis", /\bvisitors?\b|\bguests?\b/],
    [
      "cap",
      /\broommates?\b|\bcapacity\b|\bper room\b|\bhow many (people|persons|students)\b|\bshare\b|\bsolo\b/,
    ],
    ["gender", /\bgender\b|\bboys?\b|\bgirls?\b|\bmale\b|\bfemale\b|\bladies\b|\bmen\b|\bwomen\b|\bmixed\b/],
    ["aircon", /\baircon\b|\bair ?con(ditioned|ditioning)?\b|\ba\/?c\b/],
    ["cr", /\bcr\b|\bcomfort rooms?\b|\bbathrooms?\b|\btoilets?\b|\brestrooms?\b/],
    ["parking", /\bparking\b|\bmotorcycles?\b|\bmotor\b|\bcars?\b/],
    ["laundry", /\blaundry\b|\bwashing\b|\bwasher\b/],
    ["rent", /\brent\b|\bprice\b|\bcost\b|\bhow much\b|\bfees?\b|\bmonthly\b/],
    ["dist", /\bhow far\b|\bdistance\b|\bwalk(ing)?\b|\bclose to\b|\bnear (campus|school)\b/],
    ["rating", /\bratings?\b|\brated\b|\bstars?\b|\breviews?\b/],
    ["contact", /\bcontact\b|\bphone\b|\bnumber\b|\bcall\b|\btext\b|\bowner\b|\blandlord\b/],
    ["address", /\baddress\b|\blocated\b|\blocation\b|\bwhere is\b|\bwhere'?s\b/],
    ["photos", /\bphotos?\b|\bpictures?\b|\bpics?\b|\bimages?\b/],
    ["verified", /\bverified\b|\blegit\b/],
    ["hearts", /\bhearts?\b|\bsaved\b|\bpopular\b/],
    ["comments", /\bcomments?\b/],
    ["match", /\bmatch\b|\bgood for me\b|\bfit(s)? me\b|\bright for me\b/],
  ];
  function attrs(text) {
    var t = String(text || "").toLowerCase(),
      out = [];
    ATTR.forEach(function (a) {
      if (a[1].test(t)) out.push(a[0]);
    });
    return out;
  }
  function amen(h, rx) {
    return (h.am || []).filter(function (a) {
      return rx.test(a);
    })[0];
  }
  function answer(h, keys) {
    var f = facts(h),
      out = [];
    keys.forEach(function (k) {
      var a;
      switch (k) {
        case "aircon":
          a = amen(h, /air ?con/i);
          out.push(a ? "Yes, " + a + " is listed." : "Aircon isn't listed (unverified), so ask the owner.");
          break;
        case "cr":
          a = amen(h, /\bcr\b|comfort room|bathroom/i);
          out.push(a ? "Yes: " + a + "." : "It doesn't say whether rooms have their own CR (unverified).");
          break;
        case "parking":
          a = amen(h, /parking/i);
          out.push(a ? "Yes: " + a + "." : "Parking isn't listed (unverified).");
          break;
        case "laundry":
          a = amen(h, /wash|laundry/i);
          out.push(a ? "Yes: " + a + "." : "Laundry isn't listed (unverified).");
          break;
        case "rent":
          out.push(
            h.p == null
              ? "The rent isn't published (rate on request), so ask the owner."
              : "Rent is " + peso(h.p) + " a month.",
          );
          break;
        case "dist":
          out.push(
            "It's " + h.d + " km from " + h.s + ", about a " + mins(h.d) + "-minute walk (straight line).",
          );
          break;
        case "rating":
          var r = rating(h);
          out.push(
            r
              ? "It's rated ★ " +
                  r.avg.toFixed(1) +
                  " from " +
                  r.n +
                  (r.n === 1 ? " rating" : " ratings") +
                  " by people who stayed there."
              : "No ratings yet.",
          );
          break;
        case "contact":
          out.push(
            /\d/.test(h.c || "")
              ? "The owner's number is " + h.c + ". Open the listing to call or text."
              : "No phone number is listed for this place.",
          );
          break;
        case "address":
          out.push("It's at " + (h.addr || h.a) + ", " + h.d + " km from " + h.s + ".");
          break;
        case "photos":
          var ph = window.Photos ? Photos.split(h) : { cover: null, rooms: [] },
            n = ph.rooms.length;
          out.push(
            (ph.cover ? "It has a cover photo" : "It has no cover photo yet") +
              (n
                ? " and " + n + (n === 1 ? " room photo" : " room photos") + ". Open the listing to see them."
                : ph.cover
                  ? ", but no room photos yet. Ask the owner for pictures of the room."
                  : " and no room photos, only area photos."),
          );
          break;
        case "verified":
          out.push(
            h.v
              ? "Yes, its details were confirmed with the owner."
              : "Not verified yet: details come from public listings, so confirm with the owner before paying anything.",
          );
          break;
        case "hearts":
          var hc = window.Hearts ? Hearts.count(h.id) : 0;
          out.push(
            hc
              ? hc + (hc === 1 ? " student has" : " students have") + " saved it."
              : "No one has saved it yet.",
          );
          break;
        case "comments":
          var cs = window.Comments ? Comments.list(h.id).length : 0;
          out.push(
            cs
              ? "It has " + cs + (cs === 1 ? " comment" : " comments") + ". Open the listing to read them."
              : "No comments yet.",
          );
          break;
        case "match":
          var rk = rankOf(h);
          out.push(
            rk
              ? "It's " +
                  (/^(8|11|18)/.test(String(rk.pct)) ? "an " : "a ") +
                  rk.pct +
                  "% match for you, #" +
                  (rk.i + 1) +
                  " of " +
                  rk.n +
                  "."
              : "It's not in your matches right now (a must-have rules it out). Ask me “why not " +
                  h.n +
                  "?”",
          );
          break;
        case "gender":
          out.push(
            f.gender
              ? f.gender.length > 1
                ? "It takes male and female tenants."
                : "It's for " + f.gender[0] + " tenants only."
              : "It doesn't say who can stay (unverified).",
          );
          break;
        case "cap":
          out.push(
            f.cap
              ? "About " + f.cap + (f.cap === 1 ? " person" : " people") + " per room."
              : "It doesn't say how many share a room (unverified).",
          );
          break;
        default:
          // wifi, kit, water, elec, curfew, vis
          var label = {
            wifi: "Wi-Fi",
            kit: "a kitchen",
            water: "the water",
            elec: "electricity",
            curfew: "a curfew",
            vis: "visitors",
          }[k];
          var v = k === "water" ? (f.water === "incl" ? "incl" : f.water247) : k === "elec" ? f.elec : f[k];
          if (k === "water")
            out.push(
              v === "incl"
                ? "Water is included in the rent (24/7 supply unverified)."
                : v === true
                  ? "The owner confirms 24/7 water."
                  : v === false
                    ? "Water isn't 24/7."
                    : "It doesn't say anything about the water (unverified).",
            );
          else if (k === "elec")
            out.push(
              v === "incl"
                ? "Electricity is included in the rent."
                : v === "extra"
                  ? "Electricity is paid separately."
                  : "It doesn't say how electricity is paid (unverified).",
            );
          else if (k === "curfew")
            out.push(
              v === true
                ? "Yes, it has a curfew."
                : v === false
                  ? "No curfew."
                  : "It doesn't say whether there's a curfew (unverified).",
            );
          else
            out.push(
              v === true
                ? "Yes, it has " + label + "."
                : v === false
                  ? "No, it doesn't have " + label + "."
                  : "It doesn't say whether it has " + label + " (unverified).",
            );
      }
    });
    return out;
  }

  /* ---------- questions across all listings ---------- */
  // a real question or a search ("which…", "show me…", "…?"); a bare "dorm for men" is a preference, not a search
  var QUESTION =
    /^\s*(which|what|any|how many|show( me)?|list|find( me)?|are there|is there|give me|do you have)\b|\?\s*$/;
  var FILTER = {
    wifi: function (f) {
      return f.wifi === true ? 1 : f.wifi === false ? 0 : null;
    },
    kit: function (f) {
      return f.kit === true ? 1 : f.kit === false ? 0 : null;
    },
    water: function (f) {
      return f.water === "incl" || f.water247 === true ? 1 : f.water247 === false ? 0 : null;
    },
    curfew: function (f) {
      return f.curfew === false ? 1 : f.curfew === true ? 0 : null;
    }, // "no curfew"
    vis: function (f) {
      return f.vis === true ? 1 : f.vis === false ? 0 : null;
    },
    aircon: function (f, h) {
      return amen(h, /air ?con/i) ? 1 : null;
    },
    cr: function (f, h) {
      return amen(h, /\bcr\b|comfort room|bathroom/i) ? 1 : null;
    },
    parking: function (f, h) {
      return amen(h, /parking/i) ? 1 : null;
    },
    laundry: function (f, h) {
      return amen(h, /wash|laundry/i) ? 1 : null;
    },
  };
  var LABEL = {
    wifi: "Wi-Fi",
    kit: "a kitchen",
    water: "water included or 24/7",
    curfew: "no curfew",
    vis: "visitors allowed",
    aircon: "aircon",
    cr: "a CR inside",
    parking: "parking",
    laundry: "laundry",
  };
  var SAVE = {
    wifi: "must have wifi",
    kit: "must have kitchen",
    water: "must have water",
    curfew: "no curfew is a must",
    vis: "visitors must be allowed",
  };

  function areas() {
    var out = [];
    HOUSES.forEach(function (h) {
      var a = norm(h.a)
        .filter(function (w) {
          return !/^(st|rd|ln|street|road|lane|ave)$/.test(w);
        })
        .join(" ");
      if (a.length >= 4 && out.indexOf(a) < 0) out.push(a);
    });
    return out;
  }
  function parseQuery(text) {
    var t = String(text || "").toLowerCase(),
      q = {
        feats: [],
        type: null,
        max: null,
        km: null,
        area: null,
        gender: null,
        minStars: null,
        op: "match",
      };
    if (/\bdorm(itor(y|ies))?s?\b/.test(t)) q.type = "Dormitory";
    else if (/\bboarding ?houses?\b|\bbh\b/.test(t)) q.type = "Boarding house";
    else if (/\bapartments?\b|\bapts?\b/.test(t)) q.type = "Apartment";
    attrs(t).forEach(function (k) {
      if (FILTER[k] && (k !== "curfew" || /\bno curfew|without (a )?curfew\b/.test(t))) q.feats.push(k);
    });
    if (/\b(girls?|ladies|female|women)\b/.test(t)) q.gender = "female";
    else if (/\b(boys?|male|men|guys)\b/.test(t)) q.gender = "male";
    var m = t.match(
      /\b(under|below|less than|cheaper than|max(imum)?|up to|at most|within)\s*(?:₱|php|p)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand)?\b(?!\s*(km|min))/,
    );
    if (m) q.max = parseFloat(m[3].replace(/,/g, "")) * (m[4] ? 1000 : 1);
    if ((m = t.match(/\b(within|under|less than)\s*(\d+(?:\.\d+)?)\s*km\b/))) q.km = +m[2];
    else if ((m = t.match(/\b(\d+)\s*min(ute)?s?\b/))) q.km = Math.round((m[1] / 12) * 10) / 10;
    areas().forEach(function (a) {
      if (!q.area && (" " + norm(t).join(" ") + " ").indexOf(" " + a + " ") >= 0) q.area = a;
    });
    if (/\b(top|highly|best) rated\b|\bgood reviews\b/.test(t)) q.minStars = 4;
    if ((m = t.match(/\b([1-5](?:\.\d)?)\+?\s*stars?\b/))) q.minStars = +m[1];
    if (/\bhow many\b/.test(t)) q.op = "count";
    else if (/\bcheapest\b|\blowest\b|\bmost affordable\b/.test(t)) q.op = "cheap";
    else if (/\bnearest\b|\bclosest\b/.test(t)) q.op = "near";
    var any = q.feats.length || q.type || q.max || q.km || q.area || q.gender || q.minStars;
    return any ? q : null;
  }
  function describe(q) {
    var bits = [];
    bits.push(
      q.type
        ? { Dormitory: "dormitories", "Boarding house": "boarding houses", Apartment: "apartments" }[q.type]
        : "places",
    );
    if (q.gender) bits.push("for " + (q.gender === "female" ? "girls" : "guys"));
    if (q.area)
      bits.push(
        "in " +
          q.area.replace(/\b\w/g, function (c) {
            return c.toUpperCase();
          }),
      );
    if (q.feats.length)
      bits.push(
        "with " +
          q.feats
            .map(function (k) {
              return LABEL[k];
            })
            .join(" and "),
      );
    if (q.max) bits.push("under " + peso(q.max));
    if (q.km) bits.push("within " + q.km + " km");
    if (q.minStars) bits.push("rated " + q.minStars + "★ or more");
    return bits.join(" ");
  }
  /** Run a question across every listing. Returns {q, hits, maybe, desc, save} or null when it isn't one. */
  function query(text) {
    if (!QUESTION.test(String(text || "").toLowerCase())) return null;
    var q = parseQuery(text);
    if (!q) return null;
    var hits = [],
      maybe = [];
    HOUSES.forEach(function (h) {
      var f = facts(h),
        unsure = false,
        ok = true;
      if (q.type && h.t !== q.type) ok = false;
      if (q.area && norm(h.a).join(" ").indexOf(q.area) < 0) ok = false;
      if (q.max != null) {
        if (h.p == null) unsure = true;
        else if (h.p > q.max) ok = false;
      }
      if (q.km != null && h.d > q.km) ok = false;
      if (q.gender) {
        if (!f.gender) unsure = true;
        else if (f.gender.indexOf(q.gender) < 0) ok = false;
      }
      if (q.minStars) {
        var r = rating(h);
        if (!r || r.avg < q.minStars) ok = false;
      }
      q.feats.forEach(function (k) {
        var v = FILTER[k](f, h);
        if (v === 0) ok = false;
        else if (v == null) unsure = true;
      });
      if (!ok) return;
      (unsure ? maybe : hits).push(h);
    });
    var sc = {};
    if (window.S && typeof score === "function")
      HOUSES.forEach(function (h) {
        sc[h.id] = score(h).fin;
      });
    var sorter =
      q.op === "cheap"
        ? function (a, b) {
            return (a.p == null ? 1e9 : a.p) - (b.p == null ? 1e9 : b.p);
          }
        : q.op === "near"
          ? function (a, b) {
              return a.d - b.d;
            }
          : function (a, b) {
              return (sc[b.id] || 0) - (sc[a.id] || 0);
            };
    hits.sort(sorter);
    maybe.sort(sorter);
    var save = q.feats
      .map(function (k) {
        return SAVE[k];
      })
      .filter(Boolean)
      .concat(
        q.max ? ["under " + q.max] : [],
        q.km ? [q.km + " km"] : [],
        q.gender ? [q.gender === "female" ? "girls only" : "boys only"] : [],
      );
    return { q: q, hits: hits, maybe: maybe, desc: describe(q), save: save };
  }

  /* ---------- the student ---------- */
  var MODE = ["don't care", "nice to have", "must have"];
  function meHTML() {
    var P = S.P,
      c = window.Consent,
      cookie = c && c.readPrefs ? c.readPrefs() : null,
      musts = Object.keys(P.m)
        .filter(function (k) {
          return P.m[k] === 2;
        })
        .map(function (k) {
          return LBL[k];
        }),
      liked = S.likes
        .concat(S.marks)
        .filter(function (v, i, a) {
          return a.indexOf(v) === i;
        })
        .map(byId)
        .filter(Boolean),
      li = [];
    li.push(
      "<b>Saving:</b> " +
        (!c
          ? "in this browser."
          : !c.asked()
            ? "not decided yet."
            : c.prefs()
              ? "your preferences are remembered in this browser and in a preferences cookie."
              : "essential only, so your preferences last until you close this tab."),
    );
    if (cookie)
      li.push(
        "<b>Your preferences cookie holds:</b> near " +
          esc(cookie.school) +
          ", up to " +
          cookie.maxKm +
          " km, boarding house up to " +
          peso(cookie.bhMax) +
          (cookie.aptMax ? ", apartment up to " + peso(cookie.aptMax) : "") +
          ", must-haves: " +
          esc(
            Object.keys(cookie.m)
              .filter(function (k) {
                return cookie.m[k] === 2;
              })
              .map(function (k) {
                return LBL[k];
              })
              .join(", ") || "none",
          ) +
          ".",
      );
    li.push(
      "<b>What you want now:</b> near " +
        esc(P.school) +
        ", up to " +
        P.maxKm +
        " km, boarding house up to " +
        peso(P.bhMax) +
        ", apartment up to " +
        peso(P.aptMax) +
        (musts.length ? "; must-haves: " + esc(musts.join(", ")) : "") +
        ".",
    );
    li.push(
      "<b>Rooms you liked or saved:</b> " +
        (liked.length
          ? esc(
              liked
                .slice(-5)
                .map(function (h) {
                  return h.n;
                })
                .join(", "),
            )
          : "none yet") +
        "." +
        (S.passes.length ? " You passed on " + S.passes.length + "." : ""),
    );
    li.push(
      "<b>Learning from your activity:</b> " +
        (window.Insights && Insights.on() ? "on" : "off") +
        ". <b>Gemini wording:</b> " +
        (window.NamoAI && NamoAI.on() ? "on" : "off") +
        ".",
    );
    return (
      "Here's everything I know about you:<ul>" +
      li
        .map(function (x) {
          return "<li>" + x + "</li>";
        })
        .join("") +
      "</ul>Say “forget my preferences” to delete them, or tell me anything you want to change."
    );
  }
  function prefsPlain() {
    var P = S.P,
      musts = Object.keys(P.m)
        .filter(function (k) {
          return P.m[k] === 2;
        })
        .map(function (k) {
          return LBL[k];
        });
    return (
      "The student's preferences: near " +
      P.school +
      ", walk up to " +
      P.maxKm +
      " km, boarding house budget up to " +
      peso(P.bhMax) +
      ", apartment up to " +
      peso(P.aptMax) +
      (musts.length ? ", must-haves: " + musts.join(", ") : "") +
      "."
    );
  }
  /** Plain facts for Gemini: the listings a message names (or the top matches) + the student's preferences. */
  function retrieve(text) {
    var hs = find(text);
    if (!hs.length && typeof queue === "function")
      hs = queue()
        .slice(0, 2)
        .map(function (s) {
          return s.h;
        });
    return hs
      .slice(0, 3)
      .map(function (h) {
        return card(h).plain;
      })
      .concat(window.S ? [prefsPlain()] : [])
      .join("\n\n");
  }

  return {
    find: find,
    card: card,
    attrs: attrs,
    answer: answer,
    query: query,
    meHTML: meHTML,
    retrieve: retrieve,
    norm: norm,
    MODE: MODE,
  };
})();
