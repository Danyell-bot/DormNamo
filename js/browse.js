/* ==========================================================
   browse.js - the original "Find your room" list, filters, compare and details dialog
   ========================================================== */

var F = { q: "", near: "", p: 10000, types: [], am: [], v: false, sort: "rec" },
  CMP = [];
function fillSel(el, arr, first) {
  el.innerHTML =
    (first != null ? '<option value="">' + first + "</option>" : "") +
    arr
      .map(function (x) {
        return "<option>" + esc(x) + "</option>";
      })
      .join("");
}
fillSel($("qNear"), SCHOOLS, "Any school");
fillSel($("fNear"), SCHOOLS, "Any school");
fillSel($("aS"), SCHOOLS);
fillSel($("aT"), TYPES);
TYPES.forEach(function (t) {
  var o = document.createElement("option");
  o.textContent = t;
  $("qType").appendChild(o);
});
function chips(el, arr, key) {
  el.innerHTML = arr
    .map(function (x) {
      return (
        '<button type="button" class="chip" aria-pressed="false" data-v="' +
        esc(x) +
        '">' +
        esc(x) +
        "</button>"
      );
    })
    .join("");
  el.onclick = function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    var v = b.dataset.v,
      i = F[key].indexOf(v);
    i < 0 ? F[key].push(v) : F[key].splice(i, 1);
    b.setAttribute("aria-pressed", i < 0);
    render();
  };
}
chips($("fTypes"), TYPES, "types");
chips($("fAm"), AMS, "am");
function list() {
  var r = HOUSES.filter(function (h) {
    if (F.q && (h.n + " " + h.a).toLowerCase().indexOf(F.q.toLowerCase()) < 0) return false;
    if (F.near && h.s !== F.near) return false;
    if (F.p < 10000 && (h.p == null || h.p > F.p)) return false;
    if (F.types.length && F.types.indexOf(h.t) < 0) return false;
    if (F.v && !h.v) return false;
    return F.am.every(function (a) {
      return h.am.indexOf(a) >= 0;
    });
  });
  var s = F.sort;
  r.sort(function (a, b) {
    if (s === "pa") return (a.p == null ? 1e9 : a.p) - (b.p == null ? 1e9 : b.p);
    if (s === "pd") return (b.p == null ? -1 : b.p) - (a.p == null ? -1 : a.p);
    if (s === "rt") return ratingScore(b) - ratingScore(a);
    if (s === "ds") return a.d - b.d;
    return b.f - a.f || b.v - a.v || ratingScore(b) - ratingScore(a);
  });
  return r;
}
function render() {
  var r = list();
  $("res").innerHTML = "<b>" + r.length + "</b> " + (r.length === 1 ? "place" : "places") + " found";
  filterUI();
  var CC = window.Comments ? Comments.counts() : {};
  $("grid").innerHTML = r.length
    ? r
        .map(function (h, pos) {
          return (
            '<article class="card' +
            (h.f ? " feat" : "") +
            '"><div class="ph">' +
            Photos.thumb(h, pos) +
            (h.f ? '<span class="tag">Featured</span>' : "") +
            (h.v ? '<span class="ver">Verified</span>' : "") +
            (window.Hearts ? Hearts.button(h, "hrt-card") : "") +
            "</div>" +
            '<div class="cb"><div class="c-head"><h3>' +
            esc(h.n) +
            "</h3>" +
            stars(h) +
            "</div>" +
            '<div class="c-meta">' +
            esc(h.t) +
            " · " +
            esc(h.a) +
            '<span class="c-cm" data-cm="' +
            h.id +
            '"' +
            (CC[h.id]
              ? ' aria-label="' + CC[h.id] + (CC[h.id] === 1 ? " comment" : " comments") + '"'
              : " hidden") +
            ">" +
            ico("chat") +
            "<b>" +
            (CC[h.id] || 0) +
            "</b></span></div>" +
            '<div class="c-dist">' +
            ico("pin") +
            h.d +
            " km from " +
            esc(h.s) +
            "</div>" +
            '<div class="price">' +
            rent(h) +
            "</div>" +
            '<div class="acts"><label class="cmp"><input type="checkbox" data-c="' +
            h.id +
            '"' +
            (CMP.indexOf(h.id) >= 0 ? " checked" : "") +
            '> Compare</label><button class="btn sm" data-o="' +
            h.id +
            '">View details' +
            ico("next") +
            "</button></div></div></article>"
          );
        })
        .join("")
    : '<div class="empty f-empty"><span class="f-empty-i">' +
      ico("search") +
      '</span><b>No rooms match these filters.</b><span>Try a higher budget or fewer must-haves.</span><button class="btn alt sm" type="button" data-clear>Clear filters</button></div>';
  $("sCount").textContent = HOUSES.length;
  $("sVer").textContent = HOUSES.filter(function (h) {
    return /\d/.test(h.c);
  }).length;
  $("sMin").textContent = (function (k) {
    return k.length ? peso(Math.min.apply(null, k)) : "n/a";
  })(
    HOUSES.map(function (h) {
      return h.p;
    }).filter(function (p) {
      return p != null;
    }),
  );
  cmpUI();
}
/** Set the max-price filter everywhere: F, the slider, its filled track and the label. */
function setPrice(v) {
  F.p = Math.min(10000, Math.max(500, v));
  var s = $("fP");
  s.value = F.p;
  s.style.setProperty("--fill", (((F.p - 500) / 9500) * 100).toFixed(1) + "%");
  $("fPv").textContent = F.p >= 10000 ? "Any" : peso(F.p);
}
/** How many filters are on: shown as a badge, and "Clear all" only appears when there is something to clear. */
function filterUI() {
  var n =
    (F.q ? 1 : 0) + (F.near ? 1 : 0) + (F.p < 10000 ? 1 : 0) + F.types.length + F.am.length + (F.v ? 1 : 0);
  $("fCount").hidden = !n;
  $("fCount").textContent = n;
  $("reset").hidden = !n;
  $("fToggle").querySelector("span").textContent = $("filters").classList.contains("open") ? "Hide" : "Show"; // the count badge sits next to the title
}
function ddSync(id) {
  if (window.Dropdown && Dropdown.sync) Dropdown.sync($(id));
}
function cmpUI() {
  $("cmpbar").hidden = !CMP.length;
  $("cmpTxt").textContent = CMP.length + " selected (max 3)";
  $("cmpGo").disabled = CMP.length < 2;
}
$("grid").onclick = function (e) {
  var o = e.target.closest("[data-o]");
  if (o) open(+o.dataset.o);
};
$("grid").onchange = function (e) {
  var c = e.target.dataset.c;
  if (!c) return;
  c = +c;
  var i = CMP.indexOf(c);
  if (i >= 0) CMP.splice(i, 1);
  else if (CMP.length < 3) CMP.push(c);
  else {
    e.target.checked = false;
    toast("You can compare up to 3 places at a time.");
  }
  cmpUI();
};
$("cmpGo").onclick = function () {
  var hs = CMP.map(function (id) {
    return HOUSES.filter(function (x) {
      return x.id === id;
    })[0];
  });
  var rows = [
    [
      "Price",
      function (h) {
        return h.p == null ? "On request" : peso(h.p) + " / mo";
      },
    ],
    [
      "Type",
      function (h) {
        return h.t;
      },
    ],
    [
      "Area",
      function (h) {
        return h.a;
      },
    ],
    [
      "Distance",
      function (h) {
        return h.d + " km to " + h.s;
      },
    ],
    [
      "Rating",
      function (h) {
        var x = rating(h);
        return x ? "★ " + x.avg.toFixed(1) + " (" + x.n + (x.n === 1 ? " rating" : " ratings") + ")" : "No ratings";
      },
    ],
    [
      "Verified",
      function (h) {
        return h.v ? "Yes" : "Not yet";
      },
    ],
    [
      "Amenities",
      function (h) {
        return h.am.join(", ") || "Not published";
      },
    ],
  ];
  D.innerHTML =
    '<div class="db"><div class="row"><h2>Compare</h2><button class="btn sm" onclick="dlg.close()">Close</button></div><div class="scroll"><table><tr><th></th>' +
    hs
      .map(function (h) {
        return "<th>" + esc(h.n) + "</th>";
      })
      .join("") +
    "</tr>" +
    rows
      .map(function (r) {
        return (
          "<tr><th>" +
          r[0] +
          "</th>" +
          hs
            .map(function (h) {
              return "<td>" + esc(r[1](h)) + "</td>";
            })
            .join("") +
          "</tr>"
        );
      })
      .join("") +
    "</table></div></div>";
  D.showModal();
};
$("cmpClr").onclick = function () {
  CMP = [];
  render();
};
$("fQ").oninput = function (e) {
  F.q = e.target.value;
  render();
};
$("fNear").onchange = function (e) {
  F.near = e.target.value;
  render();
};
$("fP").oninput = function (e) {
  setPrice(+e.target.value);
  render();
};
$("fV").onchange = function (e) {
  F.v = e.target.checked;
  render();
};
$("sort").onchange = function (e) {
  F.sort = e.target.value;
  render();
};
function clearFilters() {
  F = { q: "", near: "", p: 10000, types: [], am: [], v: false, sort: F.sort };
  $("fQ").value = "";
  $("fNear").value = "";
  ddSync("fNear");
  setPrice(10000); // "Any": a price cap would also hide every place with unpublished rent
  $("fV").checked = false;
  document.querySelectorAll("#filters .chip[aria-pressed]").forEach(function (c) {
    c.setAttribute("aria-pressed", "false");
  });
  render();
}
$("reset").onclick = clearFilters;
$("grid").addEventListener("click", function (e) {
  if (e.target.closest("[data-clear]")) clearFilters();
});
// phones: the filter panel folds behind a button
$("fToggle").onclick = function () {
  var open = $("filters").classList.toggle("open");
  $("fToggle").setAttribute("aria-expanded", open);
  filterUI();
};
$("quick").onsubmit = function (e) {
  e.preventDefault();
  F.near = $("qNear").value;
  $("fNear").value = F.near;
  ddSync("fNear");
  setPrice(+$("qBudget").value);
  var t = $("qType").value;
  F.types = t ? [t] : [];
  document.querySelectorAll("#fTypes .chip").forEach(function (c) {
    c.setAttribute("aria-pressed", c.dataset.v === t);
  });
  render();
  FX.glideTo(FX.resultsTarget($("finder")), function () {
    FX.showResults($("finder"));
  });
};
$("addForm").onsubmit = function (e) {
  e.preventDefault();
  var plan = $("aPlan") ? $("aPlan").value : "basic",
    planName = window.Owners && Owners.planName ? Owners.planName() : "Basic";
  // saved through Listings (js/listings.js), so it stays after a reload and can be edited in My listings
  var res = Listings.save({
    n: $("aN").value.trim(),
    a: $("aA").value.trim(),
    s: $("aS").value,
    d: 1.5,
    t: $("aT").value,
    p: +$("aP").value,
    c: $("aC").value,
    ds: $("aD").value.trim(),
    am: [],
    facts: {},
    plan: plan,
    f: window.Owners && Owners.isFeatured && Owners.isFeatured(plan) ? 1 : 0,
  });
  if (res.error) {
    $("aMsg").textContent = "Couldn’t save the listing: this browser’s storage is full.";
    return;
  }
  this.reset();
  $("aMsg").innerHTML =
    "Added with " +
    esc(planName) +
    ". It’s now in the list above" +
    (plan !== "basic" ? " with a Featured label" : "") +
    '. <a href="mylistings.html#' +
    res.rec.id +
    '">Add photos and house rules in My listings →</a> (Demo: no payment taken.)';
  render();
};
render();
