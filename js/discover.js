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
function cardHTML(s, top) {
  var h = s.h,
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
    (top ? "" : " back") +
    '" data-id="' +
    h.id +
    '">' +
    (top
      ? '<span class="glow gl fb-like" aria-hidden="true"></span><span class="glow gp fb-pass" aria-hidden="true"></span><span class="stamp l fb-like">' +
        ico("heart") +
        'LIKE</span><span class="stamp p fb-pass">' +
        ico("x") +
        "PASS</span>"
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
    '</div><div class="sw-hint">Tap for details · Swipe right to like, left to pass</div></div>'
  );
}
function draw() {
  Q = queue();
  if (window.dpage) {
    feedback(null, 0, 0);
    deck.classList.remove("drag");
  }
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
    deck.innerHTML = (Q[1] ? cardHTML(Q[1], 0) : "") + cardHTML(Q[0], 1);
    bind(deck.querySelector(".sw:not(.back)"));
  }
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
                '</small></span><button class="btn alt sm" type="button" onclick="open(' +
                id +
                ')">Details</button></div>'
            : "";
        })
        .join("")
    : '<p class="meta">Nothing yet. Like or bookmark a room and it shows up here.</p>';
}
/* Swipe feedback. --lk / --ps (drag progress toward like / pass, 0..1) and --pull go on the page, so the
   card stamps, the full-page tint (.dtint), the rail heart and the card underneath all follow the same numbers. */
var dpage = deck.closest(".dpage") || document.body;
dpage.insertAdjacentHTML(
  "afterbegin",
  '<div class="dtint" aria-hidden="true"><i class="t-like"></i><i class="t-pass"></i></div>',
);
function feedback(c, like, pass) {
  dpage.style.setProperty("--lk", like);
  dpage.style.setProperty("--ps", pass);
  dpage.style.setProperty("--pull", Math.max(like, pass));
  if (c) c.classList.toggle("armed", like >= 1 || pass >= 1); // past the threshold: the stamp thunks in
}
function calm() {
  return matchMedia("(prefers-reduced-motion:reduce)").matches;
}
/** A fan of hearts (like) or crosses (pass) flying off the card. */
function burst(type) {
  if (calm()) return;
  var wrap = deck.parentNode,
    b = document.createElement("div"),
    n = 9,
    html = "",
    like = type === "like";
  for (var i = 0; i < n; i++) {
    var ang = (((like ? -115 : -65) + ((like ? 1 : -1) * i * 105) / (n - 1)) * Math.PI) / 180,
      dist = 110 + ((i * 37) % 80);
    html +=
      '<i style="--x:' +
      Math.round(Math.cos(ang) * dist) +
      "px;--y:" +
      Math.round(Math.sin(ang) * dist) +
      "px;--r:" +
      (i % 2 ? 1 : -1) * (14 + i * 5) +
      "deg;--s:" +
      (0.7 + ((i * 13) % 6) / 10) +
      ";animation-delay:" +
      i * 22 +
      'ms">' +
      ico(like ? "heart" : "x") +
      "</i>";
  }
  b.className = "burst " + type;
  b.setAttribute("aria-hidden", "true");
  b.innerHTML = html;
  b.style.left = deck.offsetLeft + deck.offsetWidth / 2 + "px";
  b.style.top = deck.offsetTop + deck.offsetHeight * 0.38 + "px";
  wrap.appendChild(b);
  setTimeout(function () {
    b.remove();
  }, 1200);
}
function fly(c, dx, dy, type) {
  feedback(c, type === "like" ? 1 : 0, type === "pass" ? 1 : 0);
  c.classList.add("armed");
  deck.classList.add("drag");
  burst(type);
  var id = +c.dataset.id;
  c.style.transition = "transform .34s cubic-bezier(.3,.6,.4,1), opacity .34s ease";
  c.style.transform = "translate(" + dx + "px," + (dy - 40) + "px) rotate(" + dx / 14 + "deg)";
  c.style.opacity = 0;
  setTimeout(
    function () {
      act(type, id);
    },
    calm() ? 0 : 290,
  );
}
function bind(c) {
  var x0,
    y0,
    dx = 0,
    dy = 0,
    on = 0;
  function settle() {
    on = 0;
    dpage.classList.remove("dragging");
  }
  function back() {
    // springy snap back to the middle
    c.style.transition = "transform .45s cubic-bezier(.3,1.5,.5,1)";
    c.style.transform = "";
    feedback(c, 0, 0);
    setTimeout(function () {
      deck.classList.remove("drag");
    }, 450);
  }
  c.onpointerdown = function (e) {
    on = 1;
    x0 = e.clientX;
    y0 = e.clientY;
    dx = dy = 0;
    c.style.transition = "none";
    c.setPointerCapture(e.pointerId);
    dpage.classList.add("dragging");
    deck.classList.add("drag");
  };
  c.onpointermove = function (e) {
    if (!on) return;
    dx = e.clientX - x0;
    dy = e.clientY - y0;
    c.style.transform = "translate(" + dx + "px," + Math.min(dy, 0) + "px) rotate(" + dx / 18 + "deg)";
    feedback(c, cl(dx / 100), cl(-dx / 100));
  };
  c.onpointerup = function () {
    if (!on) return;
    settle();
    var id = +c.dataset.id;
    if (dx > 100) fly(c, 520, dy, "like");
    else if (dx < -100) fly(c, -520, dy, "pass");
    else {
      back();
      if (dy < -110 || (Math.abs(dx) < 6 && Math.abs(dy) < 6)) open(id);
    }
  };
  c.onpointercancel = function () {
    if (on) {
      settle();
      back();
    }
  };
}
function current() {
  return Q[0];
}
$("dLike").onclick = function () {
  var c = deck.querySelector(".sw:not(.back)");
  c && fly(c, 520, 0, "like");
};
$("dPass").onclick = function () {
  var c = deck.querySelector(".sw:not(.back)");
  c && fly(c, -520, 0, "pass");
};
$("dMark").onclick = function () {
  current() && act("mark", current().h.id);
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
deck.onkeydown = function (e) {
  var k = e.key;
  if (k === "ArrowRight") $("dLike").click();
  else if (k === "ArrowLeft") $("dPass").click();
  else if (k === "ArrowUp") {
    e.preventDefault();
    $("dInfo").click();
  } else if (k === "z" || k === "Z") undo();
};

// ---- page hooks ------------------------------------------------------
var _act = act,
  SAY = { like: "Liked", pass: "Passed", mark: "Bookmarked" };
act = function (type, id) {
  if (type === "like") {
    var b = $("dLike");
    b.classList.remove("pop");
    void b.offsetWidth;
    b.classList.add("pop");
  } // quick heart pulse
  _act(type, id);
  toast(SAY[type]);
};
function pageInit() {
  draw();
}
