/* ==========================================================
   discover.js - swipe deck: cards, drag gestures, buttons, keyboard, liked list
   ========================================================== */

/* ---- interactions ---- */
function rec(type, id, y, w) {
  S.log.push({ id: id, y: y, w: w });
  S.log = S.log.slice(-200);
}
function act(type, id) {
  if (type === "like") {
    S.likes.push(id);
    rec(type, id, 1, 1);
  } else if (type === "pass") {
    S.passes.push(id);
    rec(type, id, 0, 1);
  } else if (type === "mark") {
    S.marks.push(id);
    rec(type, id, 1, 1.5);
  }
  S.hist.push({ t: type, id: id });
  train();
  save();
  if (type === "like" && window.Hearts) Hearts.sync(id);
  draw();
}
function undo() {
  var l = S.hist.pop();
  if (!l) return;
  var k = { like: "likes", pass: "passes", mark: "marks" }[l.t],
    i = S[k].lastIndexOf(l.id);
  if (i >= 0) S[k].splice(i, 1);
  if (l.t === "like" && window.Hearts) Hearts.sync(l.id);
  want = l.id;
  for (var j = S.log.length - 1; j >= 0; j--)
    if (S.log[j].id === l.id && S.log[j].w !== 0.3 && S.log[j].w !== 2) {
      S.log.splice(j, 1);
      break;
    }
  save();
  draw();
}
function inquire(id) {
  if (S.inq.indexOf(id) < 0) {
    S.inq.push(id);
    rec("inq", id, 1, 2);
    train();
    save();
  }
  var b = document.getElementById("inqB");
  if (b) {
    b.textContent = "Inquiry noted (demo: contact the owner using the number below)";
    b.disabled = true;
  }
}
var _open = open;
open = function (id) {
  if (!S.views[id]) {
    S.views[id] = 1;
    rec("view", id, 1, 0.3);
    train();
    save();
  }
  _open(id);
  var s = score(byId(id));
  D.querySelector(".db").insertAdjacentHTML(
    "afterbegin",
    '<div class="mbox"><b>' +
      esc(why(s)) +
      "</b>" +
      (s.unk.length ? '<span class="unv">Unverified: ' + esc(s.unk.join("; ")) + "</span>" : "") +
      '<span class="meta">Availability not confirmed. Ask the owner before visiting.</span><button class="btn sm" id="inqB" type="button" onclick="inquire(' +
      id +
      ')">Ask landlord about this room</button></div>',
  );
};
/* ---- deck UI ---- */
var deck = $("deck"),
  Q = [];
function walk(h) {
  return Math.max(1, Math.round(h.d * 12));
}
function cap1(t) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function cardHTML(s, o) {
  var top = o === 0,
    h = s.h,
    f = facts(h);
  // key facts; null = not stated anywhere, shown as "Unverified" (never guessed)
  var spec = [
    ["Capacity", f.cap ? f.cap + (f.cap === 1 ? " person" : " per room") : null],
    ["Water", f.water === "incl" ? "Included in rent" : null],
    ["Electricity", f.elec === "incl" ? "Included" : f.elec === "extra" ? "Paid separately" : null],
    ["Curfew", f.curfew ? "Has curfew" : null],
    ["Visitors", f.vis == null ? null : f.vis ? "Allowed" : "Not allowed"],
    ["Availability", null],
  ];
  var fits = s.o
    .filter(function (x) {
      return x.s === true;
    })
    .map(function (x) {
      return x.y;
    })
    .slice(0, 4);
  return (
    '<div class="sw' +
    (top ? "" : " side") +
    '" data-o="' +
    o +
    '" data-id="' +
    h.id +
    '"' +
    (top ? "" : ' aria-hidden="true"') +
    ">" +
    (top
      ? '<span class="sw-flag l" aria-hidden="true">Like</span><span class="sw-flag p" aria-hidden="true">Pass</span>'
      : "") +
    '<div class="ph">' +
    Photos.thumb(h) +
    (h.f ? '<span class="tag">Featured</span>' : "") +
    (h.v ? '<span class="ver">Verified</span>' : "") +
    '<span class="pct">' +
    s.pct +
    "% match</span></div>" +
    '<div class="cb">' +
    '<div class="sw-head"><h3>' +
    esc(h.n) +
    '</h3><div class="sw-sub">' +
    esc(h.t) +
    " · " +
    esc(h.a) +
    "</div></div>" +
    '<div class="sw-row"><span class="price">' +
    rent(h) +
    '</span><span class="sw-dist">' +
    ico("pin") +
    h.d +
    " km · ~" +
    walk(h) +
    " min walk</span></div>" +
    (fits.length
      ? '<ul class="sw-fits" aria-label="Why it fits">' +
        fits
          .map(function (y) {
            return "<li>" + ico("check") + "<span>" + esc(cap1(y)) + "</span></li>";
          })
          .join("") +
        "</ul>"
      : '<p class="sw-none">None of your preferences are confirmed for this place yet.</p>') +
    (s.unk.length
      ? '<p class="sw-unv">' +
        ico("alert") +
        "<span>" +
        s.unk.length +
        (s.unk.length === 1 ? " detail is" : " details are") +
        " not confirmed yet. Ask the owner.</span></p>"
      : "") +
    '<dl class="sw-spec">' +
    spec
      .map(function (r) {
        return (
          "<div><dt>" +
          r[0] +
          "</dt><dd" +
          (r[1] ? "" : ' class="unk"') +
          ">" +
          esc(r[1] || "Unverified") +
          "</dd></div>"
        );
      })
      .join("") +
    "</dl>" +
    (h.am.length
      ? '<div class="chips">' +
        h.am
          .map(function (a) {
            return '<span class="chip">' + esc(a) + "</span>";
          })
          .join("") +
        "</div>"
      : "") +
    '</div><div class="sw-hint">Tap for details</div></div>'
  );
}
function draw() {
  Q = queue();
  if (want != null) {
    // keep the room that just slid into focus (or came back with undo) in the middle after re-ranking
    for (var w = 0; w < Q.length; w++) if (Q[w].h.id === want) pos = w;
    want = null;
  }
  pos = Math.max(0, Math.min(pos, Q.length - 1));
  if (window.dpage) feedback(null, 0, 0);
  var done = S.done;
  if (!done) {
    deck.innerHTML =
      '<div class="empty" style="height:100%;display:grid;place-content:center;gap:12px"><b>Tell us what you need first</b><span>Answer a short questionnaire so we recommend rooms that fit you.</span><button class="btn" type="button" id="dStart">Set my preferences</button></div>';
    $("dStart").onclick = prefs;
  } else if (!Q.length) {
    deck.innerHTML =
      '<div class="empty" style="height:100%;display:grid;place-content:center;gap:12px"><b>No more matches right now</b><span>Loosen a must-have or review passed listings.</span><button class="btn alt" type="button" id="dRe">Review passed listings</button></div>';
    $("dRe").onclick = function () {
      S.passes = [];
      S.hist = S.hist.filter(function (x) {
        return x.t !== "pass";
      });
      save();
      draw();
    };
  } else {
    var html = "";
    for (var o = -SPAN; o <= SPAN; o++) if (Q[pos + o]) html += cardHTML(Q[pos + o], o);
    deck.innerHTML = html;
    lay(0, 0, 0);
    dposShow();
    nudge();
  }
  if (!(done && Q.length) && $("dPos")) $("dPos").hidden = true;
  ["dUndo"].forEach(function (i) {
    $(i).disabled = !S.hist.length;
  });
  ["dPass", "dMark", "dLike", "dInfo"].forEach(function (i) {
    $(i).disabled = !(done && Q.length);
  });
  $("dStat").innerHTML = done
    ? "<span><b>" +
      Q.length +
      "</b> left</span><span><b>" +
      S.likes.length +
      "</b> liked</span><span><b>" +
      S.marks.length +
      "</b> bookmarked</span>" +
      (alpha()
        ? '<span title="Your swipes now shape ' +
          Math.round(alpha() * 100) +
          '% of the ranking">Learning from your swipes</span>'
        : "")
    : "";
  var all = S.likes.concat(S.marks).filter(function (v, i, a) {
    return a.indexOf(v) === i;
  });
  $("dSavedN").textContent = all.length;
  $("dSavedTab").textContent = all.length;
  $("dSavedTab").hidden = !all.length;
  $("dSaved").innerHTML = all.length
    ? all
        .map(function (id) {
          var h = byId(id);
          return h
            ? '<div class="it"><span class="it-n">' +
                (S.likes.indexOf(id) >= 0 ? '<i class="sv-tag">Liked</i>' : "") +
                (S.marks.indexOf(id) >= 0 ? '<i class="sv-tag bm">Saved</i>' : "") +
                "<b>" +
                esc(h.n) +
                "</b><small>" +
                peso(h.p) +
                '</small></span><button class="btn alt sm" type="button" data-open="' +
                id +
                '">Details</button></div>'
            : "";
        })
        .join("")
    : '<p class="meta">Nothing yet. Like or bookmark a room and it shows up here.</p>';
}
/* ---- cover flow ----
   One room is in focus in the middle; the rooms ranked around it sit behind it on both sides, smaller,
   dimmer and blurred. Sideways drags (or the arrow keys, or a sideways trackpad scroll) browse the strip.
   Up likes the focused room, down passes it; the card leaves that way and its neighbour glides into focus.
   --lk / --ps (0..1) on .dpage light the card's Like / Pass label and the guides beside the deck. */
var dpage = deck.closest(".dpage") || document.body,
  pos = 0, // index in Q of the focused room
  want = null, // room id to focus after the next draw()
  busy = 0, // an exit or browse animation is running
  EASE = "cubic-bezier(.22,.61,.36,1)",
  dSmall = matchMedia("(max-width: 560px)").matches,
  SPAN = dSmall ? 2 : 3, // neighbours drawn on each side
  BLUR = dSmall ? 1.4 : 2.2; // px of blur per step away from the focus
deck.insertAdjacentHTML(
  "beforebegin",
  '<div class="dguide up" aria-hidden="true">' +
    ico("up") +
    "<b>Like</b></div>" +
    '<div class="dguide down" aria-hidden="true"><b>Pass</b>' +
    ico("down") +
    "</div>",
);
deck.insertAdjacentHTML("afterend", '<div class="dpos" id="dPos" aria-live="polite"></div>');
function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}
function dposShow(at) {
  var el = $("dPos");
  if (!el) return;
  var i = at == null ? pos : at,
    n = Q.length;
  el.hidden = !n;
  el.innerHTML =
    '<span class="dph up">' +
    ico("up") +
    "Like</span><b>" +
    pad2(i + 1) +
    "</b><i></i><span>" +
    pad2(n) +
    '</span><span class="dph down">Pass' +
    ico("down") +
    "</span>";
  el.style.setProperty("--dp", n ? ((i + 1) / n) * 100 + "%" : "0%");
}
function nudge() {
  var c = focusCard(),
    k = "dormnamo:nudged";
  try {
    if (!c || !c.animate || calm() || sessionStorage.getItem(k) || !matchMedia("(max-width: 1179px)").matches)
      return;
    sessionStorage.setItem(k, "1");
  } catch (e) {
    return;
  }
  var a = c.animate(
    [
      { translate: "0 0", offset: 0 },
      { translate: "0 -22px", offset: 0.3 },
      { translate: "0 0", offset: 0.55 },
      { translate: "0 14px", offset: 0.78 },
      { translate: "0 0", offset: 1 },
    ],
    { duration: 1700, delay: 700, easing: "ease-in-out" },
  );
  // the hints light up with the card's movement
  var t0 = performance.now() + 700;
  (function glow(t) {
    var p = (t - t0) / 1700;
    if (p > 1) return feedback(null, 0, 0);
    if (p > 0)
      feedback(
        null,
        p < 0.55 ? Math.sin((p / 0.55) * Math.PI) : 0,
        p >= 0.55 ? Math.sin(((p - 0.55) / 0.45) * Math.PI) : 0,
      );
    requestAnimationFrame(glow);
  })(performance.now());
  c.addEventListener(
    "pointerdown",
    function () {
      a.cancel();
    },
    { once: true },
  );
}
function feedback(c, like, pass) {
  dpage.style.setProperty("--lk", like);
  dpage.style.setProperty("--ps", pass);
}
function calm() {
  return matchMedia("(prefers-reduced-motion:reduce)").matches;
}
function focusCard() {
  return deck.querySelector('.sw[data-o="0"]');
}
/** Spacing so each side card peeks out a fixed amount past the one in front of it. */
function metrics() {
  var c = deck.querySelector(".sw"),
    cw = c ? c.offsetWidth : 360,
    room = Math.max(0, (deck.clientWidth - cw) / 2),
    p1 = Math.max(18, Math.min(room * 0.5, cw * 0.3)),
    p2 = p1 * 0.6;
  return { s1: 0.045 * cw + p1, s2: 0.045 * cw + p2, h: deck.clientHeight };
}
/** Place one card at offset o (fractional while dragging) and vertical lift dy. */
function put(el, o, dy, m, ms) {
  var a = Math.abs(o),
    k = Math.min(a, 2),
    x = (o < 0 ? -1 : 1) * (m.s1 * Math.min(a, 1) + m.s2 * Math.max(0, a - 1)),
    sc = 1 - 0.09 * Math.min(a, 3) - Math.min(Math.abs(dy) / 3000, 0.04);
  el.style.transition = ms
    ? "transform " + ms + "ms " + EASE + ",filter " + ms + "ms " + EASE + ",opacity " + ms + "ms " + EASE
    : "none";
  el.style.transform =
    "translate3d(calc(-50% + " +
    x.toFixed(1) +
    "px)," +
    dy.toFixed(1) +
    "px," +
    (-90 * Math.min(a, 2)).toFixed(1) +
    "px) rotateY(" +
    ((o < 0 ? 1 : -1) * 16 * Math.min(a, 1)).toFixed(2) +
    "deg) scale(" +
    sc.toFixed(3) +
    ")";
  el.style.filter =
    a < 0.02
      ? "none"
      : "blur(" +
        (k * BLUR).toFixed(2) +
        "px) saturate(" +
        (1 - 0.35 * k).toFixed(2) +
        ") contrast(" +
        (1 - 0.12 * k).toFixed(2) +
        ") brightness(" +
        (1 + 0.04 * k).toFixed(2) +
        ")";
  el.style.opacity = (a > 2 ? Math.max(0, 3 - a) : 1 - 0.14 * k).toFixed(2);
  el.style.zIndex = 20 - Math.round(a * 4);
  el.classList.toggle("is-focus", a < 0.5);
}
/** Lay out the strip shifted by `shift` cards (positive = toward the next room), the focus card moved by dy. */
function lay(shift, dy, ms) {
  var m = metrics();
  deck.querySelectorAll(".sw").forEach(function (el) {
    var o = +el.dataset.o;
    put(el, o - shift, o === 0 ? dy : 0, m, ms);
  });
}
/** Browse to another room in the strip. */
function go(to) {
  if (busy || !Q.length) return;
  to = Math.max(0, Math.min(to, Q.length - 1));
  var ms = calm() ? 0 : 340;
  feedback(null, 0, 0);
  lay(to - pos, 0, ms);
  if (to === pos) return;
  dposShow(to);
  busy = 1;
  setTimeout(function () {
    busy = 0;
    pos = to;
    want = Q[to].h.id;
    draw();
  }, ms);
}
/** Like (the card leaves upward) or pass (downward); the next room glides into focus. */
function decide(type) {
  var c = focusCard();
  if (busy || !c) return;
  busy = 1;
  var id = +c.dataset.id,
    up = type === "like",
    ms = calm() ? 0 : 360,
    m = metrics(),
    fill = Q[pos + 1] ? 1 : -1, // which side closes the gap
    next = Q[pos + fill];
  feedback(c, up ? 1 : 0, up ? 0 : 1);
  c.style.transition = "transform " + ms + "ms " + EASE + ",opacity " + ms + "ms ease";
  c.style.transform = "translate3d(-50%," + (up ? -1 : 1) * Math.round(m.h * 0.9) + "px,0) scale(.94)";
  c.style.opacity = 0;
  deck.querySelectorAll(".sw.side").forEach(function (el) {
    var o = +el.dataset.o;
    if ((fill > 0 && o > 0) || (fill < 0 && o < 0)) put(el, o - fill, 0, m, ms);
  });
  setTimeout(function () {
    busy = 0;
    want = next ? next.h.id : null;
    act(type, id);
  }, ms);
}
// One set of pointer handlers on the deck: decide the axis after a few pixels, then follow the finger on it.
// One swipe = one room: sideways the finger moves a whole card per `per` px (about 60% of a card's width, not the
// small visual gap between cards, which is only ~30 px on phones), the strip stops at the next room and resists
// past it, and flicks use the speed of the last ~100 ms rather than the average over the whole gesture.
(function () {
  var x0, y0, c, o0, lock, on, dx, dy, m, per, trail;
  /** Finger speed (px/ms) over the last ~100 ms: what a flick feels like when the finger lifts. */
  function speed() {
    var a = trail[0],
      b = trail[trail.length - 1],
      t = Math.max(16, b[0] - a[0]);
    return { x: (b[1] - a[1]) / t, y: (b[2] - a[2]) / t };
  }
  deck.addEventListener("pointerdown", function (e) {
    if (e.button > 0 || busy) return;
    c = e.target.closest(".sw");
    if (!c) return;
    on = 1;
    lock = 0;
    dx = dy = 0;
    x0 = e.clientX;
    y0 = e.clientY;
    o0 = +c.dataset.o;
    m = metrics();
    per = Math.max(120, (focusCard() || c).offsetWidth * 0.6);
    trail = [[Date.now(), x0, y0]];
  });
  deck.addEventListener("pointermove", function (e) {
    if (!on) return;
    dx = e.clientX - x0;
    dy = e.clientY - y0;
    var now = Date.now();
    trail.push([now, e.clientX, e.clientY]);
    while (trail.length > 2 && now - trail[0][0] > 100) trail.shift();
    if (!lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // sideways only when clearly sideways; otherwise up/down (like/pass) on the focused card
      lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : o0 === 0 ? "y" : "none";
      if (lock !== "none") {
        deck.setPointerCapture(e.pointerId);
        dpage.classList.add("dragging");
      }
    }
    if (lock === "x") {
      var shift = -dx / per,
        a = Math.abs(shift);
      if (a > 1) shift = (shift < 0 ? -1 : 1) * (1 + (a - 1) * 0.2); // one room per swipe: resist past the next
      var to = pos + shift,
        last = Q.length - 1;
      if (to < 0)
        shift = -pos + to * 0.25; // rubber band at the ends
      else if (to > last) shift = last - pos + (to - last) * 0.25;
      lay(shift, 0, 0);
    } else if (lock === "y") {
      lay(0, dy, 0);
      feedback(c, cl(-dy / 110), cl(dy / 110));
    }
  });
  function end(cancel) {
    if (!on) return;
    on = 0;
    dpage.classList.remove("dragging");
    var v = speed();
    if (cancel || lock === "none") {
      if (lock === "x" || lock === "y") lay(0, 0, 260);
      feedback(null, 0, 0);
    } else if (!lock) {
      // a tap: open the focused room, or bring a side room into focus
      if (o0 === 0) open(+c.dataset.id);
      else go(pos + o0);
    } else if (lock === "x") {
      // past ~30% of the way, or a quick flick the same way, moves exactly one room
      var dir = dx < 0 ? 1 : -1,
        flick = Math.abs(v.x) > 0.35 && (v.x < 0 ? 1 : -1) === dir && Math.abs(dx) > 16;
      go(Math.abs(dx) > per * 0.3 || flick ? pos + dir : pos);
    } else if (dy < -90 || (dy < -28 && v.y < -0.45)) decide("like");
    else if (dy > 90 || (dy > 28 && v.y > 0.45)) decide("pass");
    else {
      lay(0, 0, calm() ? 0 : 260);
      feedback(null, 0, 0);
    }
  }
  deck.addEventListener("pointerup", function () {
    end(false);
  });
  deck.addEventListener("pointercancel", function () {
    end(true);
  });
  // a sideways trackpad / shift+wheel scroll browses; a plain vertical wheel still scrolls the card's text.
  // One gesture = one room: after a move, the rest of that gesture (and its momentum) is ignored until the
  // wheel has been quiet for a moment.
  var acc = 0,
    spent = false,
    quiet;
  deck.addEventListener(
    "wheel",
    function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      clearTimeout(quiet);
      quiet = setTimeout(function () {
        acc = 0;
        spent = false;
      }, 220);
      if (spent) return;
      acc += e.deltaX;
      if (Math.abs(acc) > 60 && !busy) {
        go(pos + (acc > 0 ? 1 : -1));
        acc = 0;
        spent = true;
      }
    },
    { passive: false },
  );
})();
function current() {
  return Q[pos];
}
$("dLike").onclick = function () {
  decide("like");
};
$("dPass").onclick = function () {
  decide("pass");
};
$("dMark").onclick = function () {
  if (!current()) return;
  want = current().h.id;
  act("mark", want);
};
$("dInfo").onclick = function () {
  current() && open(current().h.id);
};
$("dUndo").onclick = function () {
  undo();
  toast("Undone");
};
// close the "more" menu after picking an action
document.querySelectorAll(".more .pop button").forEach(function (b) {
  b.addEventListener("click", function () {
    var d = b.closest("details");
    if (d) d.open = false;
  });
});
// Saved list "Details". Not an inline onclick="open(id)": inline handlers look names up on `document`
// first, so `open` there is document.open(), which wipes the page blank.
$("dSaved").addEventListener("click", function (e) {
  var b = e.target.closest("[data-open]");
  if (b) open(+b.dataset.open);
});
function tab(saved) {
  dpage.classList.toggle("on-saved", saved);
  $("tSaved").setAttribute("aria-selected", saved);
  $("tFor").setAttribute("aria-selected", !saved);
  $("dSavedBox").open = true;
  if (!saved) lay(0, 0, 0);
}
$("tSaved").onclick = function () {
  tab(true);
};
$("tFor").onclick = function () {
  tab(false);
};
deck.onkeydown = function (e) {
  var k = e.key;
  if (k === "ArrowUp") decide("like");
  else if (k === "ArrowDown") decide("pass");
  else if (k === "ArrowRight") go(pos + 1);
  else if (k === "ArrowLeft") go(pos - 1);
  else if (k === "Enter") $("dInfo").click();
  else if (k === "z" || k === "Z") undo();
  else return;
  e.preventDefault();
};

// ---- page hooks ------------------------------------------------------
var _act = act,
  SAY = { like: "Liked", pass: "Passed", mark: "Bookmarked" };
act = function (type, id) {
  _act(type, id);
  toast(SAY[type]);
};
/* Phones: size the strip so the room, the position line and the Like / Pass buttons all fit on one screen
   (the Ask Namo button keeps its corner below them). A fixed height pushed the buttons below the fold, and the
   strip itself can't scroll the page, so reaching them felt hard. Bigger screens keep the CSS height. */
function fitDeck() {
  if (!matchMedia("(max-width: 560px)").matches) {
    deck.style.height = "";
    return;
  }
  var vh = window.visualViewport ? visualViewport.height : window.innerHeight,
    top = deck.getBoundingClientRect().top + window.scrollY,
    p = $("dPos"),
    rail = dpage.querySelector(".rail"),
    below = (p && !p.hidden ? p.offsetHeight + 12 : 0) + (rail ? rail.offsetHeight + 12 : 0),
    fab = 76; // the Ask Namo button's corner
  deck.style.height = Math.max(320, Math.min(600, Math.round(vh - top - below - fab))) + "px";
}
window.addEventListener("resize", function () {
  if (!busy) {
    fitDeck();
    lay(0, 0, 0);
  }
});

function pageInit() {
  fitDeck();
  draw();
  if (location.hash === "#saved") tab(true); // footer "Saved rooms"
}
