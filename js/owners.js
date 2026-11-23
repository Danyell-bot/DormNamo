/* ==========================================================
   owners.js - "List your place" pricing (index.html)
   Prices in PHP. Edit BOOST / PRO to change them; keep the
   <select id="aPlan"> options in index.html in sync.
   ========================================================== */
var Owners = (function () {
  var BOOST = {
    b7: { price: 149, days: 7, per: "for 7 days", note: "About ₱21 a day. Try it for one week." },
    b30: {
      price: 399,
      days: 30,
      per: "for 30 days",
      note: "About ₱13 a day, the price of one jeepney ride.",
    },
    bsem: {
      price: 1499,
      days: 150,
      per: "for a semester (about 5 months)",
      note: "About ₱10 a day, all semester long.",
    },
  };
  var PRO = { month: 499, year: 4990 };
  function php(n) {
    return "₱" + n.toLocaleString("en-PH");
  }
  function $(id) {
    return document.getElementById(id);
  }
  var form = $("addForm");
  if (!form) return {};

  /* boost length picker */
  document.querySelectorAll("[data-boost]").forEach(function (b) {
    b.onclick = function () {
      var k = b.dataset.boost,
        o = BOOST[k];
      document.querySelectorAll("[data-boost]").forEach(function (x) {
        x.setAttribute("aria-checked", x === b);
      });
      $("bPrice").textContent = php(o.price);
      $("bPer").textContent = o.per;
      $("bNote").textContent = o.note;
      $("bCta").dataset.plan = k;
      bump($("bPrice"));
    };
  });

  /* monthly / yearly for Owner Pro */
  document.querySelectorAll("[data-bill]").forEach(function (b) {
    b.onclick = function () {
      var yearly = b.dataset.bill === "y";
      document.querySelectorAll("[data-bill]").forEach(function (x) {
        x.setAttribute("aria-pressed", x === b);
      });
      $("proPrice").textContent = php(yearly ? Math.round(PRO.year / 12) : PRO.month);
      $("proPer").textContent = yearly ? "per month, billed yearly" : "per month";
      $("proNote").textContent = yearly
        ? php(PRO.year) + " a year. You save " + php(PRO.month * 12 - PRO.year) + "."
        : "Includes 2 free 7-day boosts a month (" + php(BOOST.b7.price * 2) + " value).";
      $("proCta").dataset.plan = yearly ? "pro-y" : "pro-m";
      bump($("proPrice"));
    };
  });

  /* plan buttons: pick the plan in the form and glide down to it */
  document.querySelectorAll(".plan-cta").forEach(function (a) {
    a.onclick = function (e) {
      e.preventDefault();
      $("aPlan").value = a.dataset.plan;
      if (window.Dropdown) Dropdown.sync($("aPlan"));
      FX.glideTo(form, function () {
        $("aN").focus({ preventScroll: true });
        form.classList.remove("picked");
        void form.offsetWidth;
        form.classList.add("picked");
      });
    };
  });

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
  return { isFeatured: isFeatured, planName: planName };
})();
