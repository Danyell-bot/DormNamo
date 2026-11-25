/* ==========================================================
   fx.js - small animations: scroll reveal, emoji bursts, toast
   ========================================================== */
var FX = (function () {
  function reveal() {
    var els = document.querySelectorAll(".sh, .problem > div, .who > div, .plan, .owner");
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(
      function (items) {
        items.forEach(function (it) {
          if (it.isIntersecting) {
            it.target.classList.add("in");
            io.unobserve(it.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    els.forEach(function (el, i) {
      el.classList.add("rv");
      el.style.transitionDelay = (i % 4) * 60 + "ms";
      io.observe(el);
    });
  }

  /** Little emoji fireworks from a point (or from an element). */
  function burst(from, emoji) {
    var r = from.getBoundingClientRect
      ? from.getBoundingClientRect()
      : { left: from.x, top: from.y, width: 0, height: 0 };
    var x = r.left + r.width / 2,
      y = r.top + r.height / 2;
    for (var i = 0; i < 10; i++) {
      var p = document.createElement("span"),
        a = (i / 10) * Math.PI * 2,
        d = 50 + Math.random() * 50;
      p.textContent = emoji || "✨";
      p.className = "burst";
      p.style.left = x + "px";
      p.style.top = y + "px";
      document.body.appendChild(p);
      p.animate(
        [
          { transform: "translate(-50%,-50%) scale(.6)", opacity: 1 },
          {
            transform: "translate(" + Math.cos(a) * d + "px," + Math.sin(a) * d + "px) scale(1.2)",
            opacity: 0,
          },
        ],
        { duration: 700, easing: "ease-out" },
      ).onfinish = function () {
        this.effect.target.remove();
      };
    }
  }

  function toast(message) {
    var el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(function () {
      el.classList.remove("show");
    }, 1800);
  }
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  } // easeInOutCubic

  /** Smoothly scroll so `el` sits just under the sticky header, then call done(). Wheel/touch cancels it. */
  var gliding = 0; // >0 while a glide is running (hero-fx.js waits for it before showing results)
  function glideTo(el, done) {
    gliding++;
    var head = document.getElementById("siteHeader"),
      off = (head ? head.offsetHeight : 0) + 12;
    var from = window.scrollY,
      to = Math.max(0, el.getBoundingClientRect().top + from - off),
      dist = to - from;
    var dur = reduced ? 250 : Math.min(1100, Math.max(550, Math.abs(dist) * 0.6)),
      start = 0,
      stop = false;
    function cancel() {
      stop = true;
    }
    window.addEventListener("wheel", cancel, { passive: true, once: true });
    window.addEventListener("touchstart", cancel, { passive: true, once: true });
    requestAnimationFrame(function step(t) {
      if (stop) return finish();
      if (!start) start = t;
      var p = Math.min(1, (t - start) / dur);
      window.scrollTo(0, from + dist * ease(p));
      if (p < 1) requestAnimationFrame(step);
      else finish();
    });
    function finish() {
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      gliding = Math.max(0, gliding - 1);
      if (done) done();
    }
  }

  /** Where to land after Search: the results on phones (filters fill the first screen there), else the section. */
  function resultsTarget(finder) {
    return window.innerWidth < 760 ? document.querySelector("#finder .bar") || finder : finder;
  }

  /** After a search: results rise in one by one and the result count gets a short underline.
      Plays once per set of results: Search, "Browse all rooms" and scrolling into view all call this,
      and replaying it for a list the user has already seen looks like a needless reload. */
  function showResults(root) {
    var key = Array.prototype.map
      .call(root.querySelectorAll(".grid [data-o]"), function (b) {
        return b.dataset.o;
      })
      .join(",");
    if (root._shown === key) return;
    root._shown = key;
    root.classList.remove("searched");
    void root.offsetWidth; // restart the animation
    root.querySelectorAll(".grid > .card").forEach(function (c, i) {
      c.style.setProperty("--i", Math.min(i, 9));
      c.style.animation = ""; // let the rise-in play (an earlier run may have frozen this card)
    });
    root.classList.add("searched");
    clearTimeout(showResults.t);
    showResults.t = setTimeout(function () {
      // Cards also have a default entrance (cardIn, home.css). Dropping "searched" would switch back to it and
      // the browser would play it again, so the cards that just rose in are frozen first. Cards drawn later
      // (a filter change) are new elements and still get their normal entrance.
      root.querySelectorAll(".grid > .card").forEach(function (c) {
        c.style.animation = "none";
      });
      root.classList.remove("searched");
    }, 1800);
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href*="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    var url = new URL(a.getAttribute("href"), location.href);
    if (!samePath(url.pathname, location.pathname) || !url.hash || url.hash === "#") return;
    var target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!target) return;
    e.preventDefault();
    glideTo(target);
  });

  /** Coming from another page with a section to show (nav.js stores it): glide there once the page is up. */
  function glideAfterLoad(delay) {
    var id = null;
    try {
      id = sessionStorage.getItem("dn:goto");
      sessionStorage.removeItem("dn:goto");
    } catch (e) {}
    var target = id && document.getElementById(id);
    if (target)
      setTimeout(
        function () {
          glideTo(target);
        },
        reduced ? 0 : delay,
      );
  }

  return {
    reveal: reveal,
    burst: burst,
    toast: toast,
    glideTo: glideTo,
    showResults: showResults,
    resultsTarget: resultsTarget,
    isGliding: function () {
      return gliding > 0;
    },
    glideAfterLoad: glideAfterLoad,
  };
})();
function toast(m) {
  FX.toast(m);
}

/* ---------- phones: typing never hides behind the keyboard ----------
   Android (interactive-widget=resizes-content in every page's viewport meta) shrinks the page when the
   keyboard opens. iPhones don't: the keyboard slides over the page. From the visible area (visualViewport)
   this keeps, on <html>:
     --kb     px the keyboard covers at the bottom of the screen (0 when closed)
     --vvh    the visible height        --vvtop  how far the visible area is panned down (iPhone)
     .typing  while a text field has focus (both platforms): floating bars step aside
     .kb-open while a keyboard covers more than 120 px (iPhone): panels shrink to the visible area
   and mobile.css uses them. On top of that, the field being typed in is scrolled into view (centered) when
   the keyboard or a bar covers it: search, filters, sign-up, the questionnaire, My listings, comments… */
(function () {
  var vv = window.visualViewport,
    root = document.documentElement;
  if (!vv) return;
  /** A keyboard can only be up while someone types in a text field; a shorter visible area alone isn't
      enough (the address bar, zoom and phone previews change it too). */
  function field(a) {
    if (!a) return false;
    if (a.isContentEditable || a.tagName === "TEXTAREA") return true;
    return (
      a.tagName === "INPUT" &&
      !/^(checkbox|radio|button|submit|reset|range|file|color|image|hidden)$/i.test(a.type || "")
    );
  }
  function phone() {
    return window.innerWidth <= 760;
  }
  function update() {
    var t = field(document.activeElement),
      kb = t ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    root.style.setProperty("--kb", kb + "px");
    root.style.setProperty("--vvh", Math.round(vv.height) + "px");
    root.style.setProperty("--vvtop", Math.round(vv.offsetTop) + "px");
    root.classList.toggle("typing", t && phone());
    root.classList.toggle("kb-open", kb > 120);
  }
  /** Bring the field being typed in to the middle of what's visible, if the keyboard, the sticky header or a
      bar covers it. Chat boxes pinned above the keyboard (Namo, Messages) are already in place. */
  function reveal() {
    var a = document.activeElement;
    if (!phone() || !field(a) || a.closest("#chat, .mx-chat")) return;
    var r = a.getBoundingClientRect(),
      top = vv.offsetTop + 72, // below the sticky site header
      bottom = vv.offsetTop + vv.height - 16;
    if (r.bottom > bottom || r.top < top)
      a.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }
  var later;
  function soon(ms) {
    clearTimeout(later);
    later = setTimeout(function () {
      update();
      reveal();
    }, ms);
  }
  vv.addEventListener("resize", function () {
    update();
    soon(120); // keyboard finished sliding (or rotated): check the field again
  });
  vv.addEventListener("scroll", update);
  document.addEventListener("focusin", function () {
    update();
    soon(350); // the keyboard takes ~300 ms to slide up
  });
  document.addEventListener("focusout", function () {
    setTimeout(update, 60); // after focus has moved on (or left every field)
  });
  update();
})();
