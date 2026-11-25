/* ==========================================================
   hearts.js - hearts = "save this room" (engagement / curation)
   Stars rate QUALITY and only come from people who stayed there
   (Google reviews + tenant ratings in comments.js). Hearts never
   touch the star score: they save a room to your list and show
   how many students saved it.
   A heart is the same thing as a Discover "like": it lives in
   S.likes, feeds the recommender (S.log, train()) and shows in
   "Liked & bookmarked". The count per room is kept in
   localStorage ("dormnamo:hearts" = {dormId: [userId]}), so it
   counts the accounts on this browser.
   ========================================================== */
var Hearts = (function () {
  var KEY = "dormnamo:hearts";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function store(m) {
    try {
      localStorage.setItem(KEY, JSON.stringify(m));
    } catch (e) {}
  }

  function count(id) {
    return (load()[id] || []).length;
  }
  function has(id) {
    return !!(window.S && S.likes && S.likes.indexOf(id) >= 0);
  }

  /** Make the shared count agree with the current user's S.likes for one room. */
  function sync(id) {
    if (!window.USER) return;
    var m = load(),
      a = m[id] || [],
      i = a.indexOf(USER.id),
      on = has(id);
    if (on && i < 0) a.push(USER.id);
    if (!on && i >= 0) a.splice(i, 1);
    if (a.length) m[id] = a;
    else delete m[id];
    store(m);
    refresh(id);
  }
  /** After login: bring the counts in line with this user's likes and update every heart on the page. */
  function syncAll() {
    if (!window.USER || !window.S) return;
    var m = load(),
      k;
    for (k in m) {
      var i = m[k].indexOf(USER.id);
      if (i >= 0 && S.likes.indexOf(+k) < 0) m[k].splice(i, 1);
      if (!m[k].length) delete m[k];
    }
    S.likes.forEach(function (id) {
      var a = m[id] || (m[id] = []);
      if (a.indexOf(USER.id) < 0) a.push(USER.id);
    });
    store(m);
    document.querySelectorAll("[data-heart]").forEach(function (b) {
      paint(b, +b.dataset.heart);
    });
  }

  /** Heart or un-heart a room for the current user. Returns true when it is now hearted. */
  function toggle(id) {
    if (!window.USER || !window.S) return false;
    var i = S.likes.indexOf(id),
      on = i < 0;
    if (on) {
      S.likes.push(id);
      S.log.push({ id: id, y: 1, w: 1 }); // same signal as a Discover like
      S.log = S.log.slice(-200);
    } else {
      S.likes.splice(i, 1);
      for (var j = S.log.length - 1; j >= 0; j--)
        if (S.log[j].id === id && S.log[j].y === 1 && S.log[j].w === 1) {
          S.log.splice(j, 1);
          break;
        }
    }
    if (window.train) train();
    save();
    sync(id);
    if (window.toast) toast(on ? "Saved to your hearts" : "Removed from your hearts");
    if (document.body.dataset.page === "discover" && window.draw) draw(); // keeps the liked list in step
    return on;
  }

  function label(on, name) {
    return (on ? "Remove " : "Save ") + name + (on ? " from your hearts" : " to your hearts");
  }
  var TIP = "Save this room. Hearts show how many students saved it; they don’t change the star rating.";

  /** Heart button (cards: cls "hrt-card", dialog: "hrt-dlg"). */
  function button(h, cls) {
    var on = has(h.id),
      n = count(h.id);
    return (
      '<button type="button" class="hrt' +
      (cls ? " " + cls : "") +
      '" data-heart="' +
      h.id +
      '" data-name="' +
      esc(h.n) +
      '" aria-pressed="' +
      on +
      '" aria-label="' +
      esc(label(on, h.n)) +
      '" title="' +
      esc(TIP) +
      '">' +
      ico("heart") +
      '<span class="hrt-n">' +
      (n || "") +
      "</span></button>"
    );
  }
  /** One line for the dialog: how many saved it, and what hearts mean. */
  function savedLine(h) {
    return '<span class="hrt-line" data-heart-line="' + h.id + '">' + lineText(h.id) + "</span>";
  }
  function lineText(id) {
    var n = count(id);
    return n
      ? n + (n === 1 ? " student saved this" : " students saved this") + " · shows popularity, not quality"
      : "No one has saved this yet · hearts show popularity, not quality";
  }

  function paint(b, id) {
    var on = has(id),
      n = count(id);
    b.setAttribute("aria-pressed", on);
    b.setAttribute("aria-label", label(on, b.dataset.name || "this room"));
    var c = b.querySelector(".hrt-n"),
      old = +c.textContent || 0;
    c.textContent = n || "";
    if (n !== old) {
      // the number rolls up when it grows, down when it shrinks
      c.classList.remove("up", "down");
      void c.offsetWidth;
      c.classList.add(n > old ? "up" : "down");
    }
  }
  function refresh(id) {
    document.querySelectorAll('[data-heart="' + id + '"]').forEach(function (b) {
      paint(b, id);
    });
    document.querySelectorAll('[data-heart-line="' + id + '"]').forEach(function (l) {
      l.textContent = lineText(id);
    });
  }

  /* ---------- click animation: a short, quiet scale (no flying particles) ---------- */
  function play(b, cls) {
    b.classList.remove("pop", "unpop");
    void b.offsetWidth; // restart the animation on quick repeat clicks
    b.classList.add(cls);
  }

  // one listener for every heart on every page
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-heart]");
    if (!b || !window.USER) return;
    e.preventDefault();
    var on = toggle(+b.dataset.heart);
    // every copy of this heart (card + dialog) answers the click
    document.querySelectorAll('[data-heart="' + b.dataset.heart + '"]').forEach(function (x) {
      play(x, on ? "pop" : "unpop");
    });
  });

  return {
    has: has,
    count: count,
    toggle: toggle,
    sync: sync,
    syncAll: syncAll,
    button: button,
    savedLine: savedLine,
  };
})();
