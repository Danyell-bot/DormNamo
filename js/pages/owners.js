/* ==========================================================
   owners.js - "List your place" pricing (index.html)
   Prices in PHP. Edit BOOST / PRO to change them; keep the
   <select id="aPlan"> options in index.html in sync (the semester
   option's text is set here, because it depends on the season).

   How the page sells (each hook is real, nothing is made up):
   - pennies a day: every price is also shown per day;
   - now vs later: Basic is live at once, boosts start on publish,
     and the bigger bills can be paid in parts (a partial deposit);
   - something new each week: the weekly views / hearts / inquiries report;
   - what you'd lose: an empty bed costs more than Pro; unused Pro boosts
     carry over only while you stay;
   - belonging and FOMO: the early-bird countdown before the enrollment
     rush, and the real count of Featured spots left in a barangay.
   ========================================================== */
var Owners = (function () {
  var BOOST = {
    b7: { price: 149, days: 7, per: "for 7 days", name: "7 days" },
    b30: { price: 399, days: 30, per: "for 30 days", name: "30 days" },
    bsem: {
      price: 1499,
      early: 1299,
      days: 150,
      per: "for a semester (about 5 months)",
      name: "Semester",
      parts: 2,
    },
  };
  // Owner Pro. Yearly = ₱449 a month (a charm price), billed ₱5,388 a year: ₱1,200 less than 12 monthly bills,
  // which is "2 months free" (₱1,200 > 2 × ₱549). It can be paid in 4 equal parts of ₱1,347.
  var PRO = { month: 549, yearMonth: 449, parts: 4, boostsPerMonth: 2 };
  PRO.year = PRO.yearMonth * 12;
  var SPOTS = 3; // Featured spots per barangay

  function php(n) {
    return "₱" + Math.round(n).toLocaleString("en-PH");
  }
  function $(id) {
    return document.getElementById(id);
  }
  function day(d) {
    return d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
  }
  function addDays(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function addMonths(d, n) {
    var x = new Date(d);
    x.setMonth(x.getMonth() + n);
    return x;
  }

  /* ---------- seasons (MSU-IIT: 1st semester from August, 2nd from January) ----------
     peak  = Jun–Aug and Dec–Jan: enrollment, students look for rooms now
     early = Apr–May and Oct–Nov: the early-bird semester boost before the rush
     quiet = Feb, Mar, Sep: mid-semester */
  function season(now) {
    var m = now.getMonth();
    if ([5, 6, 7, 11, 0].indexOf(m) >= 0) return { k: "peak" };
    if ([3, 4, 9, 10].indexOf(m) >= 0) {
      var rush = new Date(now.getFullYear(), m < 6 ? 5 : 11, 1); // 1 June or 1 December
      return { k: "early", rush: rush, left: Math.ceil((rush - now) / 864e5) };
    }
    return { k: "quiet" };
  }
  var NOW = new Date(),
    SEASON = season(NOW);
  function semPrice() {
    return SEASON.k === "early" ? BOOST.bsem.early : BOOST.bsem.price;
  }
  function boostPrice(k) {
    return k === "bsem" ? semPrice() : BOOST[k].price;
  }

  var form = $("addForm");
  if (!form) return {};

  /* ---------- season banner over the plans ---------- */
  (function () {
    var el = $("season");
    if (!el) return;
    var s = SEASON;
    el.dataset.season = s.k;
    el.innerHTML =
      s.k === "peak"
        ? "<b>Enrollment season</b><span>Students are enrolling and looking for rooms now. This is when a boost works hardest.</span>"
        : s.k === "early"
          ? "<b>Early-bird · " +
            s.left +
            (s.left === 1 ? " day" : " days") +
            " left</b><span>Semester boost " +
            php(BOOST.bsem.early) +
            " instead of " +
            php(BOOST.bsem.price) +
            " until " +
            day(addDays(s.rush, -1)) +
            ". Be featured before the enrollment rush starts.</span>"
          : "<b>Mid-semester</b><span>Some students still move between terms. A 7-day boost keeps you on top for " +
            php(BOOST.b7.price) +
            ".</span>";
    el.hidden = false;
  })();
  // the semester option in the form shows the price for this season
  (function () {
    var o = $("aPlan") && $("aPlan").querySelector('option[value="bsem"]');
    if (o)
      o.textContent =
        "Featured boost · Semester · " + php(semPrice()) + (SEASON.k === "early" ? " (early-bird)" : "");
  })();

  /* ---------- boost length picker ---------- */
  function boostNote(k) {
    var p = boostPrice(k),
      perDay = php(p / BOOST[k].days);
    if (k === "b7") return "About " + perDay + " a day. Featured the moment you publish.";
    if (k === "b30") return "About " + perDay + " a day, the price of one jeepney ride.";
    return (
      (SEASON.k === "early" ? "Early-bird price. " : "") +
      "About " +
      perDay +
      " a day, all semester. Pay in 2 parts of " +
      php(Math.ceil(p / 2)) +
      " if you like."
    );
  }
  function showBoost(k) {
    var o = BOOST[k];
    document.querySelectorAll("[data-boost]").forEach(function (x) {
      x.setAttribute("aria-checked", x.dataset.boost === k);
    });
    $("bPrice").textContent = php(boostPrice(k));
    $("bWas").hidden = !(k === "bsem" && SEASON.k === "early");
    $("bWas").textContent = php(BOOST.bsem.price);
    $("bPer").textContent = o.per;
    $("bNote").textContent = boostNote(k);
    $("bCta").dataset.plan = k;
  }
  document.querySelectorAll("[data-boost]").forEach(function (b) {
    b.onclick = function () {
      showBoost(b.dataset.boost);
      bump($("bPrice"));
    };
  });
  showBoost("b30");

  /* ---------- monthly / yearly for Owner Pro ---------- */
  function showPro(yearly) {
    document.querySelectorAll("[data-bill]").forEach(function (x) {
      x.setAttribute("aria-pressed", (x.dataset.bill === "y") === yearly);
    });
    var full = PRO.month * 12,
      saved = full - PRO.year,
      boosts = PRO.boostsPerMonth * 12;
    $("proPrice").textContent = php(yearly ? PRO.yearMonth : PRO.month);
    $("proWas").hidden = !yearly;
    $("proWas").textContent = php(PRO.month);
    $("proPer").textContent = yearly ? "per month, billed yearly" : "per month";
    $("proNote").innerHTML = yearly
      ? php(PRO.year) +
        " a year, about " +
        php(PRO.year / 365) +
        " a day. <b>2 months free</b> (you save " +
        php(saved) +
        "), plus " +
        boosts +
        " free 7-day boosts (" +
        php(BOOST.b7.price * boosts) +
        " value). Pay in full or in " +
        PRO.parts +
        " parts of " +
        php(PRO.year / PRO.parts) +
        "."
      : "About " +
        php(PRO.month / 30) +
        " a day. Includes " +
        PRO.boostsPerMonth +
        " free 7-day boosts a month (" +
        php(BOOST.b7.price * PRO.boostsPerMonth) +
        " value). Go yearly for 2 months free.";
    $("proCta").dataset.plan = yearly ? "pro-y" : "pro-m";
  }
  document.querySelectorAll("[data-bill]").forEach(function (b) {
    b.onclick = function () {
      showPro(b.dataset.bill === "y");
      bump($("proPrice"));
    };
  });
  showPro(false);

  /* ---------- plan buttons: pick the plan in the form and glide down to it ---------- */
  document.querySelectorAll(".plan-cta").forEach(function (a) {
    a.onclick = function (e) {
      e.preventDefault();
      $("aPlan").value = a.dataset.plan;
      if (window.Dropdown) Dropdown.sync($("aPlan"));
      bill();
      FX.glideTo(form, function () {
        $("aN").focus({ preventScroll: true });
        form.classList.remove("picked");
        void form.offsetWidth;
        form.classList.add("picked");
      });
    };
  });

  /* ---------- what will be charged: shown under the plan in the form ---------- */
  function parts() {
    var c = $("aParts");
    return !!(c && c.checked);
  }
  function splitable(plan) {
    return plan === "bsem" || plan === "pro-y";
  }
  /** Featured spots still open in the chosen barangay (3 per barangay; counted from the listings on the site). */
  function spotsLeft(brgy) {
    if (!brgy || typeof HOUSES === "undefined") return null;
    var used = HOUSES.filter(function (h) {
      return h.f && (h.brgy || (typeof barangayOf === "function" ? barangayOf(h.a) : h.a)) === brgy;
    }).length;
    return Math.max(0, SPOTS - used);
  }
  function bill() {
    var el = $("aBill");
    if (!el) return;
    var plan = $("aPlan").value,
      lines = [],
      head = "",
      split = splitable(plan) && parts(),
      q = window.Listings && Listings.quota ? Listings.quota(plan) : null;
    if (plan === "basic") {
      head = "Free";
      lines.push("Live in about a minute. No card needed.");
      if (q)
        lines.push(
          q.used >= q.max
            ? "You’ve used your " +
                q.max +
                " free listings. <b>Owner Pro</b> lets you list up to " +
                Listings.LIMIT.pro +
                "."
            : "Basic covers " + q.max + " places; this is number " + (q.used + 1) + ".",
        );
    } else if (BOOST[plan]) {
      var b = BOOST[plan],
        p = boostPrice(plan),
        until = day(addDays(NOW, b.days));
      if (split) {
        var first = Math.ceil(p / 2);
        head = php(first);
        lines.push(
          "Then " +
            php(p - first) +
            " on " +
            day(addDays(NOW, 60)) +
            ". Same total (" +
            php(p) +
            "), no interest.",
        );
      } else {
        head = php(p);
        lines.push("One-time charge. It does not renew.");
      }
      lines.push("Featured from the moment you publish until " + until + ".");
      var left = spotsLeft($("aB").value);
      if (left != null)
        lines.push(
          left
            ? "<b>" + left + " of " + SPOTS + "</b> Featured spots left in " + esc($("aB").value) + "."
            : "All " +
                SPOTS +
                " Featured spots in " +
                esc($("aB").value) +
                " are taken; your boost starts when one opens.",
        );
    } else if (plan === "pro-m") {
      head = php(PRO.month);
      lines.push(
        "Then " +
          php(PRO.month) +
          " on day " +
          NOW.getDate() +
          " of each month. Cancel anytime; Pro stays on until the paid month ends.",
      );
      lines.push("Unused free boosts carry over while you stay on Pro.");
    } else if (plan === "pro-y") {
      if (split) {
        var part = PRO.year / PRO.parts,
          dates = [];
        for (var i = 1; i < PRO.parts; i++) dates.push(day(addMonths(NOW, i * 3)));
        head = php(part);
        lines.push(
          "Then " +
            php(part) +
            " on " +
            dates.join(", ") +
            ". Same " +
            php(PRO.year) +
            " total, no interest.",
        );
      } else {
        head = php(PRO.year);
        lines.push(
          "Covers 12 months (" + php(PRO.yearMonth) + " a month). 2 months free compared with monthly.",
        );
      }
      lines.push("Renews on " + day(addMonths(NOW, 12)) + "; we remind you 7 days before.");
    }
    el.innerHTML =
      '<div class="bill-h"><span>Due today</span><b>' +
      head +
      "</b></div>" +
      (splitable(plan)
        ? '<label class="bill-parts"><input type="checkbox" id="aParts"' +
          (split ? " checked" : "") +
          "> Pay in parts (" +
          (plan === "bsem" ? "2 payments" : PRO.parts + " payments, every 3 months") +
          ")</label>"
        : "") +
      "<ul>" +
      lines
        .map(function (l) {
          return "<li>" + l + "</li>";
        })
        .join("") +
      "</ul>";
  }
  form.addEventListener("change", function (e) {
    if (e.target.id === "aPlan" || e.target.id === "aParts" || e.target.id === "aB") bill();
  });
  bill();

  function bump(el) {
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  phoneField($("aC")); // spaces the contact number like 0917 123 4567 (utils.js)

  /** Paid plans get the gold "Featured" label on the new listing. */
  function isFeatured(plan) {
    return plan !== "basic";
  }
  function planName() {
    var s = $("aPlan");
    return s.options[s.selectedIndex].text;
  }
  /** "parts" when the owner chose to pay a semester boost or yearly Pro in parts, else "full". */
  function payMode(plan) {
    return splitable(plan) && parts() ? "parts" : "full";
  }
  return { isFeatured: isFeatured, planName: planName, payMode: payMode, bill: bill, BOOST: BOOST, PRO: PRO };
})();
