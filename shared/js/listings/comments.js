/* ==========================================================
   comments.js - student comments on each listing (Rooms + Discover dialog)
   Stored in localStorage ("dormnamo:comments" = {dormId: [comment]}), like
   accounts, so comments only show in the browser that wrote them. To move to a
   real backend, replace load/store/add/remove and keep the API.
   details.js: Comments.section(h) in the dialog HTML, Comments.mount(D, h) after showModal().
   browse.js: Comments.counts() for the badge on each card.
   Tenant star ratings: a comment can carry stars (1-5) from someone who stayed
   there. stats(id) counts each person once (their latest rating); utils.js
   rating(h) blends it with the Google rating. Owners can't rate their own place.
   Hearts (hearts.js) are a separate thing: saving, not rating.
   ========================================================== */
var Comments = (function () {
  var KEY = "dormnamo:comments",
    MAX = 500,
    KEEP = 200; // max characters, max comments kept per dorm

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
      return true;
    } catch (e) {
      return false;
    }
  }
  function list(id) {
    return (load()[id] || []).slice().sort(function (a, b) {
      return b.at - a.at;
    });
  }
  /** {dormId: number of comments}, read once per render. */
  function counts() {
    var m = load(),
      out = {};
    for (var k in m) out[k] = m[k].length;
    return out;
  }

  /** Tenant ratings for one listing: {n, sum}, each person counted once (latest rating wins). */
  function stats(id) {
    var by = {},
      n = 0,
      sum = 0;
    (load()[id] || [])
      .slice()
      .sort(function (a, b) {
        return a.at - b.at;
      })
      .forEach(function (c) {
        if (c.stars >= 1 && c.stars <= 5) by[c.uid] = c.stars;
      });
    for (var k in by) {
      n++;
      sum += by[k];
    }
    return { n: n, sum: sum };
  }
  /** Owners can't rate their own listing. */
  function canRate(h) {
    var r = window.Listings && h.own ? Listings.get(h.id) : null;
    return !(r && window.USER && r.uid === USER.id);
  }

  function add(id, text, stars) {
    text = String(text || "")
      .replace(/\s+$/, "")
      .replace(/^\s+/, "")
      .slice(0, MAX);
    stars = stars >= 1 && stars <= 5 ? Math.round(stars) : 0;
    if ((!text && !stars) || !window.USER) return null;
    var m = load(),
      c = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        uid: USER.id,
        name: USER.name || "Student",
        text: text,
        at: Date.now(),
      };
    if (stars) c.stars = stars;
    m[id] = (m[id] || []).concat(c).slice(-KEEP);
    return store(m) ? c : null;
  }
  function remove(id, cid) {
    var m = load();
    m[id] = (m[id] || []).filter(function (c) {
      return !(c.id === cid && window.USER && c.uid === USER.id);
    });
    if (!m[id].length) delete m[id];
    store(m);
  }

  function ago(t) {
    var s = (Date.now() - t) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago";
    if (s < 7 * 86400) {
      var d = Math.floor(s / 86400);
      return d + (d === 1 ? " day ago" : " days ago");
    }
    return new Date(t).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  }
  function hue(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) % 360;
    return n;
  }

  function itemHTML(c) {
    var mine = window.USER && c.uid === USER.id,
      name = c.name || "Student";
    return (
      '<li class="cm-it" data-cid="' +
      esc(c.id) +
      '">' +
      '<span class="cm-av" style="--h:' +
      hue(c.uid + name) +
      '" aria-hidden="true">' +
      esc(name.charAt(0).toUpperCase()) +
      "</span>" +
      '<div class="cm-main"><div class="cm-top"><b>' +
      esc(name) +
      "</b>" +
      (mine ? '<span class="cm-you">You</span>' : "") +
      '<time datetime="' +
      new Date(c.at).toISOString() +
      '" title="' +
      esc(new Date(c.at).toLocaleString("en-PH")) +
      '">' +
      ago(c.at) +
      "</time>" +
      (mine ? '<button class="cm-del" type="button" data-del="' + esc(c.id) + '">Delete</button>' : "") +
      "</div>" +
      (c.stars
        ? '<span class="cm-stars" role="img" aria-label="Rated ' +
          c.stars +
          ' out of 5">' +
          new Array(c.stars + 1).join("★") +
          "<i>" +
          new Array(6 - c.stars).join("★") +
          "</i></span>"
        : "") +
      (c.text ? '<p class="cm-text">' + esc(c.text) + "</p>" : "") +
      "</div></li>"
    );
  }

  /** Empty shell for the dialog HTML; mount() fills it. A <div>, because base.css pads every <section>. */
  function section(h) {
    return (
      '<div class="cm" id="cmBox" role="region" aria-labelledby="cmH">' +
      '<div class="cm-head"><h3 id="cmH">' +
      ico("chat") +
      'Comments and tenant ratings <span class="cm-n" id="cmN"></span></h3>' +
      '<span class="meta">Share what living here is like: water, noise, the landlord, the walk to class. Stayed here? Rate it too.</span></div>' +
      '<form class="cm-form" id="cmForm" novalidate></form>' +
      '<ul class="cm-list" id="cmList" aria-live="polite"></ul>' +
      '<p class="cm-note meta">Demo: comments are saved in this browser only, like your account. Be kind and stick to what you saw yourself.</p>' +
      "</div>"
    );
  }

  function mount(D, h) {
    var box = D.querySelector("#cmBox");
    if (!box) return;
    var form = box.querySelector("#cmForm"),
      ul = box.querySelector("#cmList"),
      n = box.querySelector("#cmN");

    function render() {
      var cs = list(h.id);
      n.textContent = cs.length ? cs.length : "";
      ul.innerHTML = cs.length
        ? cs.map(itemHTML).join("")
        : '<li class="cm-empty">' +
          ico("chat") +
          "<span><b>No comments yet.</b> Lived here or visited? Be the first to help other students.</span></li>";
      badge(h.id, cs.length);
      if (window.refreshStars) refreshStars(h); // card + dialog stars include tenant ratings
    }

    if (!window.USER) {
      form.innerHTML = '<p class="meta">Log in to leave a comment.</p>';
    } else {
      var me = USER.name || "Student";
      form.innerHTML =
        '<span class="cm-av" style="--h:' +
        hue(USER.id + me) +
        '" aria-hidden="true">' +
        esc(me.charAt(0).toUpperCase()) +
        "</span>" +
        '<div class="cm-field">' +
        (canRate(h)
          ? '<div class="cm-rate"><span class="cm-rate-l" id="cmRateL">Rate your stay <small>(only if you lived or stayed here)</small></span>' +
            '<div class="cm-pick" role="radiogroup" aria-labelledby="cmRateL">' +
            [1, 2, 3, 4, 5]
              .map(function (k) {
                return (
                  '<button type="button" role="radio" aria-checked="false" data-star="' +
                  k +
                  '" aria-label="' +
                  k +
                  (k === 1 ? " star" : " stars") +
                  '">★</button>'
                );
              })
              .join("") +
            '</div><span class="cm-rate-v meta" id="cmRateV"></span></div>'
          : '<div class="cm-rate"><span class="cm-rate-l">You can’t rate your own listing, but you can reply to comments.</span></div>') +
        '<label class="sr" for="cmIn">Write a comment about ' +
        esc(h.n) +
        "</label>" +
        '<textarea id="cmIn" rows="2" maxlength="' +
        MAX +
        '" placeholder="Write a comment as ' +
        esc(me) +
        '…"></textarea>' +
        '<div class="cm-bar"><span class="cm-left meta" id="cmLeft">Ctrl + Enter to post</span><button class="btn sm" type="submit" id="cmPost" disabled>Post</button></div></div>';
      var ta = form.querySelector("#cmIn"),
        post = form.querySelector("#cmPost"),
        left = form.querySelector("#cmLeft"),
        pick = form.querySelector(".cm-pick"),
        rate = 0,
        WORD = ["", "Poor", "Fair", "Okay", "Good", "Great"];
      function paintStars(k) {
        if (!pick) return;
        pick.querySelectorAll("[data-star]").forEach(function (b) {
          var v = +b.dataset.star;
          b.classList.toggle("on", v <= k);
          b.setAttribute("aria-checked", v === rate);
        });
        form.querySelector("#cmRateV").textContent = k ? WORD[k] : "";
      }
      if (pick) {
        pick.onclick = function (e) {
          var b = e.target.closest("[data-star]");
          if (!b) return;
          rate = rate === +b.dataset.star ? 0 : +b.dataset.star; // click the same star again to clear
          paintStars(rate);
          ta.oninput();
        };
        pick.onmouseover = function (e) {
          var b = e.target.closest("[data-star]");
          if (b) paintStars(+b.dataset.star);
        };
        pick.onmouseleave = function () {
          paintStars(rate);
        };
        pick.onkeydown = function (e) {
          var d =
            e.key === "ArrowRight" || e.key === "ArrowUp"
              ? 1
              : e.key === "ArrowLeft" || e.key === "ArrowDown"
                ? -1
                : 0;
          if (!d) return;
          e.preventDefault();
          rate = Math.max(1, Math.min(5, (rate || 0) + d));
          paintStars(rate);
          pick.querySelector('[data-star="' + rate + '"]').focus();
          ta.oninput();
        };
      }
      ta.oninput = function () {
        var r = MAX - ta.value.length;
        post.disabled = !ta.value.trim() && !rate;
        left.textContent = r <= 80 ? r + " characters left" : "Ctrl + Enter to post";
        left.classList.toggle("warn", r <= 80);
        ta.style.height = "auto";
        ta.style.height = Math.min(ta.scrollHeight, 220) + "px"; // grow with the text
      };
      ta.onkeydown = function (e) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          form.requestSubmit ? form.requestSubmit() : form.onsubmit(e);
        }
      };
      form.onsubmit = function (e) {
        e.preventDefault();
        if (!ta.value.trim() && !rate) return;
        var rated = rate;
        if (!add(h.id, ta.value, rate)) {
          if (window.toast) toast("Couldn't save the comment in this browser.");
          return;
        }
        ta.value = "";
        rate = 0;
        paintStars(0);
        ta.oninput();
        render();
        var first = ul.querySelector(".cm-it");
        if (first) first.classList.add("cm-new");
        if (window.toast)
          toast(
            rated ? "Thanks! Your " + rated + "-star rating now counts toward the score" : "Comment posted",
          );
      };
    }

    // two-step delete: first click asks, second click deletes (resets after 3 s)
    ul.onclick = function (e) {
      var b = e.target.closest("[data-del]");
      if (!b) return;
      if (!b.classList.contains("sure")) {
        b.classList.add("sure");
        b.textContent = "Delete? Click again";
        setTimeout(function () {
          if (b.isConnected) {
            b.classList.remove("sure");
            b.textContent = "Delete";
          }
        }, 3000);
        return;
      }
      remove(h.id, b.dataset.del);
      render();
      if (window.toast) toast("Comment deleted");
    };
    render();
  }

  /** Keep the count on the Rooms card in step without re-rendering the grid. */
  function badge(id, k) {
    var el = document.querySelector('[data-cm="' + id + '"]');
    if (!el) return;
    el.hidden = !k;
    el.querySelector("b").textContent = k;
    el.setAttribute("aria-label", k + (k === 1 ? " comment" : " comments"));
  }

  return {
    section: section,
    mount: mount,
    counts: counts,
    stats: stats,
    list: list,
    add: add,
    remove: remove,
  };
})();
