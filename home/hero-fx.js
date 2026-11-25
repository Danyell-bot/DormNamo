/* ==========================================================
   hero-fx.js - motion for the Rooms page hero (index.html only)
   - scramble: the stats flicker through random digits, then settle
     left to right on the real value
   - intro: header + hero content rise in once the site is shown
     (HeroFX.play() is called from main.js startSite())
   Respects prefers-reduced-motion.
   ========================================================== */
var HeroFX = (function () {
  var root = document.documentElement;
  var hero = document.querySelector(".hero");
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var played = false;

  /* ---------- number scramble ---------- */
  // Changing digits moves nothing on screen, so this also runs with reduced motion on.
  function scramble(el, delay) {
    setTimeout(function () {
      if (el.dataset.busy) return; // already running (e.g. hovered again)
      var final = el.textContent; // read now, after browse.js filled it in
      if (!/\d/.test(final)) return;
      var chars = final.split(""),
        digits = [];
      chars.forEach(function (c, i) {
        if (/\d/.test(c)) digits.push(i);
      });
      var dur = 1300 + digits.length * 160,
        start = 0,
        last = 0;
      el.dataset.busy = "1";
      el.classList.remove("settled");
      el.classList.add("scrambling");
      el.setAttribute("aria-label", final); // screen readers get the real value
      requestAnimationFrame(function tick(t) {
        if (!start) start = t;
        var p = Math.min(1, (t - start) / dur);
        if (t - last > 55 || p === 1) {
          // ~18 changes per second
          last = t;
          var out = chars.slice();
          digits.forEach(function (i, k) {
            var settleAt = 0.35 + (0.65 * (k + 1)) / digits.length; // settle left to right
            if (p < settleAt) out[i] = String(Math.floor(Math.random() * 10));
          });
          el.textContent = out.join("");
        }
        if (p < 1) requestAnimationFrame(tick);
        else {
          el.textContent = final;
          el.classList.remove("scrambling");
          el.classList.add("settled");
          el.removeAttribute("aria-label");
          delete el.dataset.busy;
        }
      });
    }, delay || 0);
  }

  /** Scramble the stats once they are actually on screen; hovering a stat replays it. */
  function stats(firstDelay) {
    var strip = document.querySelector(".hero .stats");
    if (!strip) return;
    var bs = ["sCount", "sVer", "sMin"]
      .map(function (id) {
        return document.getElementById(id);
      })
      .filter(Boolean);
    function run(d) {
      bs.forEach(function (b, i) {
        scramble(b, d + i * 180);
      });
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (items) {
          if (
            items.some(function (it) {
              return it.isIntersecting;
            })
          ) {
            io.disconnect();
            run(firstDelay);
          }
        },
        { threshold: 0.6 },
      );
      io.observe(strip);
    } else run(firstDelay);
    bs.forEach(function (b) {
      b.parentNode.addEventListener("mouseenter", function () {
        scramble(b, 0);
      });
    });
  }

  /* ---------- intro ---------- */
  function play() {
    if (played) return;
    played = true;
    root.classList.remove("intro");
    root.classList.add("intro-run"); // css swaps it for a plain fade when reduced motion is on
    setTimeout(function () {
      root.classList.remove("intro-run");
    }, 2200);
    stats(reduced ? 200 : 900); // start as the stats strip finishes fading in
  }

  /* ---------- handoff to "Find your room" ---------- */
  function handoff() {
    if (!hero) return;
    var finder = document.getElementById("finder"),
      raf = 0;
    // scroll-linked depth: content lifts and fades a little, the grid drifts slower (css uses --hp, 0..1)
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var p = Math.min(1, Math.max(0, window.scrollY / Math.max(1, hero.offsetHeight)));
        hero.style.setProperty("--hp", p.toFixed(3));
      });
    }
    if (!reduced) {
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
    // "Browse all rooms" glides down like the Search button
    var next = hero.querySelector(".hero-next");
    if (next && finder)
      next.addEventListener("click", function (e) {
        e.preventDefault();
        FX.glideTo(FX.resultsTarget(finder), function () {
          FX.showResults(finder);
        });
      });
    // first time the rooms come into view, they rise in
    if (finder && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (items) {
          if (items[0].isIntersecting) {
            io.disconnect();
            // during a Search / "Browse all rooms" glide, its own callback shows the results once it lands
            if (!FX.isGliding()) FX.showResults(finder);
          }
        },
        { rootMargin: "0px 0px -25% 0px" },
      );
      io.observe(document.getElementById("grid") || finder);
    }
  }

  handoff();
  return { play: play, scramble: scramble };
})();
