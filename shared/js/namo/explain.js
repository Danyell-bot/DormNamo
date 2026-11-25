/* ==========================================================
   explain.js - Namo writes its own explanations (data-to-text NLG)
   No canned answers: every sentence is built from the live match
   data for THIS student (matching.js score/ev/queue, their
   preferences, ratings, hearts, Discover taste), in three steps:
     1. content selection  what to say: confirmed strengths ranked by
                           the student's priorities (W), must-haves met,
                           the edge over the runner-up, gaps, unknowns,
                           social proof, learned taste
     2. sentence planning  group facts into sentences with connectives
                           ("mainly because…", "It edges out…", "The catch:")
     3. realization        varied wording, real numbers (minutes, pesos,
                           km), the student's own limits
   API: best(), why(h), whyNot(h), compare(a, b). Each returns
   { html, house?, pend? } and chat.js adds cards / follow-ups.
   ========================================================== */
var Explain = (function () {
  var turn = 0;
  function pick(arr) {
    return arr[turn++ % arr.length]; // rotate wording so repeated questions don't sound canned
  }
  function list(a) {
    a = a.filter(Boolean);
    return a.length < 3 ? a.join(" and ") : a.slice(0, -1).join(", ") + ", and " + a[a.length - 1];
  }
  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function mins(km) {
    return Math.max(1, Math.round(km * 12));
  }
  /** "an 82%", "a 78%" */
  function aPct(n) {
    return (/^(8|11|18)/.test(String(n)) ? "an " : "a ") + n + "%";
  }
  /** Name used after the first mention: "Gonzales-Deanon", "Flora's", "Brylle's" (drops "Boarding House", "Dormitory"…). */
  function short(h) {
    var w = h.n
      .replace(
        /\b(boarding|house|dormitory|dorm|residence|residences|hall|apartments?|rooms?|bedspace|inn|lodge)\b/gi,
        " ",
      )
      .replace(/\s+\w\b/g, " ") // stray single letters ("House D")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(" ");
    return esc(w || h.n);
  }
  function name(h) {
    return "<b>" + esc(h.n) + "</b>";
  }
  function limit(h) {
    return h.t === "Apartment" ? S.P.aptMax : S.P.bhMax;
  }
  var NOUN = {
    dist: "the distance",
    budget: "the rent",
    cap: "how many share a room",
    gender: "who can stay",
    water: "the water supply",
    elec: "electricity",
    env: "how clean and quiet it is",
    kit: "a kitchen",
    wifi: "Wi-Fi",
    space: "room size",
    curfew: "a curfew",
    vis: "visitors",
  };

  /* ---------- realization of single facts ---------- */
  function strength(x, h) {
    var P = S.P,
      must = P.m[x.k] === 2,
      f = facts(h);
    switch (x.k) {
      case "dist":
        return pick([
          "it's only about a " + mins(h.d) + "-minute walk to " + esc(h.s),
          "you'd be " + h.d + " km (about " + mins(h.d) + " minutes on foot) from " + esc(h.s),
          "it's a short " + mins(h.d) + "-minute walk to class",
        ]);
      case "budget":
        var room = limit(h) - h.p;
        return room >= 500
          ? "at " + peso(h.p) + " a month it leaves you about " + peso(room) + " under your budget"
          : "the rent (" + peso(h.p) + ") fits your budget";
      case "wifi":
        return "it lists Wi-Fi" + (must ? ", which you said is a must" : "");
      case "kit":
        return "there's a kitchen, so you can cook your own meals";
      case "water":
        return "the owner confirms 24/7 water";
      case "elec":
        return "electricity is included in the rent";
      case "env":
        return pick(["reviewers describe it as clean and peaceful", "tenants say it's clean and safe"]);
      case "space":
        return "reviewers say the rooms are spacious";
      case "curfew":
        return "there's no curfew" + (must ? ", which you needed" : "");
      case "vis":
        return "visitors are allowed";
      case "cap":
        return "rooms are for " + f.cap + (f.cap === 1 ? " person" : " people") + ", as you wanted";
      case "gender":
        return "it takes " + P.gender + " tenants";
    }
    return x.y;
  }
  function gap(x, h) {
    var P = S.P;
    switch (x.k) {
      case "dist":
        return "it's " + h.d + " km away, past your " + P.maxKm + " km limit";
      case "budget":
        return "the rent (" + peso(h.p) + ") is above your " + peso(limit(h)) + " budget";
      case "curfew":
        return "it has a curfew";
      case "vis":
        return "it doesn't allow visitors";
      case "elec":
        return "electricity is paid separately";
      case "water":
        return "the water supply isn't 24/7";
      case "space":
        return "reviewers say the rooms are small";
      case "gender":
        return "it doesn't take " + P.gender + " tenants";
      case "cap":
        return "the room size doesn't match what you asked for";
    }
    return LBL[x.k].toLowerCase() + " isn't available";
  }
  function unknowns(xs) {
    var rent = xs.some(function (x) {
        return x.k === "budget";
      }),
      rest = xs
        .filter(function (x) {
          return x.k !== "budget";
        })
        .map(function (x) {
          return NOUN[x.k];
        }),
      parts = [];
    if (rent) parts.push("the rent isn't published");
    if (rest.length)
      parts.push(
        "it doesn't mention " +
          (rest.length < 3
            ? rest.join(" or ")
            : rest.slice(0, -1).join(", ") + ", or " + rest[rest.length - 1]),
      );
    return list(parts);
  }
  function unknown(x) {
    return x.k === "budget"
      ? "the rent isn't published, so you'd have to ask the owner"
      : "it doesn't say anything about " + NOUN[x.k];
  }
  /** Why a beats b on one preference, phrased as a comparison. */
  function edge(x, a, b) {
    switch (x.k) {
      case "dist":
        return a.d < b.d
          ? "it's closer (" + mins(a.d) + " vs " + mins(b.d) + " minutes on foot)"
          : "it's within your walking limit";
      case "budget":
        return b.p == null
          ? "its rent is published (" + peso(a.p) + ")"
          : "it's cheaper (" + peso(a.p) + " vs " + peso(b.p) + ")";
      case "env":
        return "reviewers call it clean and peaceful";
    }
    return "it confirms " + NOUN[x.k];
  }

  /* ---------- content selection helpers ---------- */
  function rankOf(h, q) {
    for (var i = 0; i < q.length; i++) if (q[i].h.id === h.id) return i;
    return -1;
  }
  function split(s) {
    return {
      good: s.o.filter(function (x) {
        return x.s === true;
      }),
      bad: s.o.filter(function (x) {
        return x.s === false;
      }),
      unk: s.o.filter(function (x) {
        return x.s == null;
      }),
    };
  }
  function edges(sa, sb) {
    var other = {};
    sb.o.forEach(function (x) {
      other[x.k] = x.s;
    });
    var out = sa.o
      .filter(function (x) {
        return x.s === true && other[x.k] !== true;
      })
      .map(function (x) {
        return edge(x, sa.h, sb.h);
      });
    if (!out.length && sa.h.d < sb.h.d - 0.05) out.push("it's a bit closer");
    var ra = rating(sa.h),
      rb = rating(sb.h);
    if (out.length < 2 && ra && (!rb || ra.avg > rb.avg + 0.2))
      out.push("it's rated higher (★ " + ra.avg.toFixed(1) + ")");
    return out.slice(0, 2);
  }
  function social(h) {
    var r = rating(h),
      n = window.Hearts ? Hearts.count(h.id) : 0,
      bits = [];
    if (r)
      bits.push(
        "people who stayed there rate it ★ " +
          r.avg.toFixed(1) +
          " (" +
          r.n +
          (r.n === 1 ? " rating" : " ratings") +
          ")",
      );
    if (n) bits.push(n + (n === 1 ? " student has" : " students have") + " saved it");
    return bits.length ? cap(list(bits)) + "." : "";
  }
  function taste(h) {
    if (!alpha() || typeof cosv !== "function") return "";
    var c = cosv(uvec(), dvec(h));
    return c > 0.25
      ? "It's also a lot like the rooms you've liked in Discover."
      : c < -0.25
        ? "It's less like the rooms you usually like, though."
        : "";
  }

  /* ---------- explanations ---------- */
  /** Why this listing scores the way it does for this student. */
  function why(h) {
    var q = queue(),
      i = rankOf(h, q),
      s = i >= 0 ? q[i] : score(h);
    if (s.fail) return whyNot(h);
    var g = split(s),
      P = S.P,
      out = [];

    // 1. where it stands
    if (i === 0)
      out.push(
        pick([
          name(h) + " is your best match right now (" + s.pct + "%).",
          "Right now " + name(h) + " comes out on top for you, at " + aPct(s.pct) + " match.",
          name(h) + " tops your list with " + aPct(s.pct) + " match.",
        ]),
      );
    else if (i > 0)
      out.push(name(h) + " is #" + (i + 1) + " of " + q.length + " for you (" + s.pct + "% match).");
    else
      out.push(
        name(h) +
          " is " +
          aPct(s.pct) +
          " match for you" +
          (S.likes.indexOf(h.id) >= 0 ? ", and you already liked it." : "."),
      );

    // 2. the main reasons, in the student's priority order
    if (g.good.length)
      out.push(
        pick(["That's mainly because ", "It's there because ", "Mostly because "]) +
          list(
            g.good.slice(0, 3).map(function (x) {
              return strength(x, h);
            }),
          ) +
          ".",
      );
    else
      out.push(
        "Honestly, none of your preferences are confirmed for it yet. It ranks here because nothing rules it out.",
      );
    var musts = Object.keys(P.m).filter(function (k) {
      return P.m[k] === 2;
    });
    var metMust = g.good.filter(function (x) {
      return musts.indexOf(x.k) >= 0;
    });
    if (musts.length && metMust.length === musts.length && metMust.length > 0)
      out.push(
        "It also meets every must-have you set (" +
          esc(
            list(
              musts.map(function (k) {
                return LBL[k].toLowerCase();
              }),
            ),
          ) +
          ").",
      );

    // 3. against the competition
    if (i === 0 && q[1]) {
      var e = edges(s, q[1]);
      out.push(
        "It edges out " +
          short(q[1].h) +
          " (" +
          q[1].pct +
          "%)" +
          (e.length ? " because " + list(e) + "." : " by a small margin, so either is worth a look."),
      );
    } else if (i > 0) {
      var e2 = edges(q[0], s);
      out.push(
        short(q[0].h) + " ranks higher" + (e2.length ? " because " + list(e2) + "." : ", but only just."),
      );
    }

    // 4. the catch
    if (g.bad.length) out.push("The catch: " + gap(g.bad[0], h) + ".");
    else if (g.unk.length)
      out.push(
        pick(["One thing to check: ", "Worth asking the owner: "]) + unknowns(g.unk.slice(0, 3)) + ".",
      );

    // 5. what other students and its similarity to their likes say
    var so = social(h),
      ta = taste(h);
    if (so) out.push(so);
    if (ta) out.push(ta);

    return { html: out.join(" "), house: h, pend: i === 0 && q[1] ? { compare: [h.id, q[1].h.id] } : null };
  }

  /** Why a listing isn't in their matches (or isn't higher). */
  function whyNot(h) {
    var s = score(h),
      P = S.P;
    if (S.passes.indexOf(h.id) >= 0)
      return {
        html:
          "You passed on " +
          name(h) +
          " in Discover, so I keep it out of your matches. Say <b>undo</b> there if that was a mistake.",
        house: h,
      };
    if (s.fail) {
      var blocker = s.o.filter(function (x) {
        return x.s === false && P.m[x.k] === 2;
      })[0];
      return {
        html:
          name(h) +
          " is hidden from your matches because " +
          gap(blocker, h) +
          ", and you marked <b>" +
          esc(LBL[blocker.k].toLowerCase()) +
          "</b> as a must-have. Want me to make that nice-to-have instead?",
        house: h,
        pend: { relax: blocker.k },
      };
    }
    return why(h);
  }

  /** The single best room, with the reasons. */
  function best() {
    var q = queue();
    if (!q.length) return null;
    return why(q[0].h);
  }

  /** Side-by-side, then a verdict for THIS student. */
  function compare(a, b) {
    var sa = score(a),
      sb = score(b),
      win = sa.fin >= sb.fin ? sa : sb,
      lose = win === sa ? sb : sa,
      out = [name(a) + " (" + sa.pct + "%) vs " + name(b) + " (" + sb.pct + "%):"],
      bits = [];

    if (Math.abs(a.d - b.d) >= 0.05) {
      var near = a.d < b.d ? a : b,
        far = near === a ? b : a;
      bits.push(short(near) + " is closer (" + mins(near.d) + " vs " + mins(far.d) + " minutes on foot)");
    } else bits.push("they're about the same walk (" + mins(a.d) + " minutes)");
    if (a.p != null && b.p != null && a.p !== b.p) {
      var cheap = a.p < b.p ? a : b,
        dear = cheap === a ? b : a;
      bits.push(short(cheap) + " is cheaper (" + peso(cheap.p) + " vs " + peso(dear.p) + ")");
    } else if (a.p == null && b.p == null) bits.push("neither publishes its rent");
    else if (a.p == null || b.p == null)
      bits.push(
        "only " + short(a.p != null ? a : b) + " publishes its rent (" + peso((a.p != null ? a : b).p) + ")",
      );
    out.push(cap(list(bits)) + ".");

    // features only one of them confirms
    var fa = split(sa).good.map(function (x) {
        return x.k;
      }),
      fb = split(sb).good.map(function (x) {
        return x.k;
      });
    function only(x, y) {
      return x
        .filter(function (k) {
          return y.indexOf(k) < 0 && k !== "dist" && k !== "budget";
        })
        .map(function (k) {
          return NOUN[k];
        });
    }
    var oa = only(fa, fb),
      ob = only(fb, fa);
    if (oa.length) out.push("Only " + short(a) + " confirms " + list(oa) + ".");
    if (ob.length) out.push("Only " + short(b) + " confirms " + list(ob) + ".");
    var ra = rating(a),
      rb = rating(b);
    if (ra && rb && Math.abs(ra.avg - rb.avg) >= 0.2)
      out.push(
        short(ra.avg > rb.avg ? a : b) +
          " is rated higher (★ " +
          Math.max(ra.avg, rb.avg).toFixed(1) +
          " vs " +
          Math.min(ra.avg, rb.avg).toFixed(1) +
          ").",
      );

    var e = edges(win, lose);
    out.push(
      Math.abs(sa.pct - sb.pct) <= 2
        ? "It's a close call for you. I'd lean " +
            short(win.h) +
            (e.length ? ", mainly because " + list(e) : "") +
            "."
        : "For you, I'd pick " + short(win.h) + (e.length ? ", mainly because " + list(e) : "") + ".",
    );
    return { html: out.join(" "), house: win.h };
  }

  return { why: why, whyNot: whyNot, best: best, compare: compare };
})();
