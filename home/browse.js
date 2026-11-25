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
$("aB").innerHTML = barangayOptions(""); // Iligan City barangays (data.js)
$("aPlace").innerHTML = placeLineHTML(); // city, province, region, ZIP
// Returning student who accepted preference cookies: start the search from their saved preferences
// (dn_prefs cookie, shared/js/app/consent.js). Runs before select.js styles these menus, so no sync needed.
(function () {
  var p = window.Consent && Consent.readPrefs();
  if (!p) return;
  if (SCHOOLS.indexOf(p.school) >= 0) $("qNear").value = p.school;
  var best = null;
  Array.prototype.forEach.call($("qBudget").options, function (o) {
    if (+o.value >= p.bhMax && (best == null || +o.value < +best.value)) best = o;
  });
  if (best) $("qBudget").value = best.value;
})();
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
  var count = "<b>" + r.length + "</b> " + (r.length === 1 ? "place" : "places") + " found";
  if (render.count !== count) $("res").innerHTML = render.count = count;
  filterUI();
  var CC = window.Comments ? Comments.counts() : {};
  if (window.Insights) Insights.filters(F); // only records anything if the student said yes (insights.js)
  // Start-up calls render() several times (saved preferences, log-in, hearts). Rebuilding identical cards
  // reloads their photos and replays their entrance, so the grid is only replaced when it would look different.
  var grid = r.length
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
  var g = $("grid");
  // compare with what was last drawn, and that the cards are still there (nothing replaced them)
  if (render.grid !== grid || g.childElementCount !== render.cards) {
    g.innerHTML = grid;
    render.grid = grid;
    render.cards = g.childElementCount;
  }
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
/* ---------- Compare: up to 3 places side by side ----------
   Rows are grouped (match, cost and place, quality, the student's own preferences, details). In rows
   with a clear winner the best cell gets a gold "Best" mark; unknown details stay "Unknown", never guessed. */
function cmpHouses() {
  return CMP.map(function (id) {
    return HOUSES.filter(function (x) {
      return x.id === id;
    })[0];
  }).filter(Boolean);
}
/** Index of the best value (lowest or highest), or -1 when fewer than 2 are known or they all tie. */
function cmpBest(vals, low) {
  var known = vals.filter(function (v) {
    return v != null;
  });
  if (known.length < 2) return -1;
  var b = low ? Math.min.apply(null, known) : Math.max.apply(null, known);
  if (
    known.every(function (v) {
      return v === b;
    })
  )
    return -1;
  return vals.indexOf(b);
}
function showCompare() {
  var hs = cmpHouses();
  if (hs.length < 2) return;
  var me = !!(window.S && S.P),
    sc = hs.map(function (h) {
      return me ? score(h) : null;
    }),
    cc = window.Comments ? Comments.counts() : {},
    yes = '<span class="cmp-y">' + ico("check") + "Yes</span>",
    no = '<span class="cmp-n">' + ico("x") + "No</span>",
    unk = '<span class="cmp-u">Unknown</span>';
  function small(t) {
    return '<small class="meta">' + t + "</small>";
  }
  /** One table row: cell(h, i) gives the HTML; val(h, i) the number for "Best" (low = lower wins). */
  function row(label, cell, val, low) {
    var best = val ? cmpBest(hs.map(val), low) : -1;
    return (
      '<tr><th scope="row">' +
      label +
      "</th>" +
      hs
        .map(function (h, i) {
          return (
            "<td" +
            (i === best ? ' class="best"' : "") +
            ">" +
            cell(h, i) +
            (i === best ? '<span class="cmp-best">Best</span>' : "") +
            "</td>"
          );
        })
        .join("") +
      "</tr>"
    );
  }
  function group(t) {
    return '<tr class="cmp-g"><th colspan="' + (hs.length + 1) + '" scope="rowgroup">' + t + "</th></tr>";
  }

  var rows = "";
  if (me)
    rows +=
      group("Your match") +
      row(
        "Match",
        function (h, i) {
          var s = sc[i];
          return (
            '<b class="cmp-pct">' +
            s.pct +
            "%</b>" +
            (s.fail
              ? '<small class="cmp-warn">Misses a must-have</small>'
              : s.must.length
                ? small("A must-have is unverified")
                : "")
          );
        },
        function (h, i) {
          return sc[i].fail ? null : sc[i].pct;
        },
      );
  rows +=
    group("Cost and place") +
    row(
      "Rent",
      function (h) {
        return h.p == null
          ? '<span class="cmp-u">Rate on request</span>'
          : "<b>" + peso(h.p) + "</b>" + small("per month");
      },
      function (h) {
        return h.p;
      },
      true,
    ) +
    row(
      "Distance",
      function (h) {
        return (
          "<b>" +
          h.d +
          " km</b>" +
          small("to " + esc(h.s) + ", about " + Math.max(1, Math.round(h.d * 12.5)) + " min walk")
        );
      },
      function (h) {
        return h.d;
      },
      true,
    ) +
    row("Type", function (h) {
      return esc(h.t);
    }) +
    row("Address", function (h) {
      return esc(h.addr || h.a);
    }) +
    group("Quality and popularity") +
    row(
      "Rating",
      function (h) {
        var x = rating(h);
        return x
          ? '<b class="cmp-star">★ ' +
              x.avg.toFixed(1) +
              "</b>" +
              small(x.n + (x.n === 1 ? " rating" : " ratings"))
          : unk;
      },
      function (h) {
        var x = rating(h);
        return x ? Math.round(x.avg * 100) + Math.min(x.n, 99) / 100 : null; // a tie goes to the one with more ratings
      },
    ) +
    (window.Hearts
      ? row(
          "Saved by",
          function (h) {
            var n = Hearts.count(h.id);
            return n
              ? '<b class="cmp-heart">♥ ' + n + "</b>" + small(n === 1 ? "student" : "students")
              : '<span class="meta">No one yet</span>';
          },
          function (h) {
            return Hearts.count(h.id) || null;
          },
        )
      : "") +
    row("Comments", function (h) {
      return cc[h.id] ? "<b>" + cc[h.id] + "</b>" : '<span class="meta">None yet</span>';
    }) +
    row("Verified", function (h) {
      return h.v ? yes : '<span class="meta">Not yet</span>';
    });

  if (me) {
    var keys = Object.keys(LBL).filter(function (k) {
        return S.P.m[k] > 0 && k !== "dist" && k !== "budget";
      }),
      evs = hs.map(function (h) {
        var o = {};
        ev(h).forEach(function (x) {
          o[x.k] = x.s;
        });
        return o;
      });
    if (keys.length)
      rows +=
        group("What you asked for") +
        keys
          .map(function (k) {
            return row(
              esc(LBL[k]) + (S.P.m[k] === 2 ? ' <small class="cmp-must">must</small>' : ""),
              function (h, i) {
                var s = evs[i][k];
                return s === true ? yes : s === false ? no : unk;
              },
            );
          })
          .join("");
  }

  rows +=
    group("Details") +
    row("Amenities", function (h) {
      return h.am.length
        ? '<div class="cmp-chips">' +
            h.am
              .map(function (a) {
                return "<span>" + esc(a) + "</span>";
              })
              .join("") +
            "</div>"
        : '<span class="cmp-u">Not published</span>';
    }) +
    row("Contact", function (h) {
      return /\d/.test(h.c || "") ? esc(h.c) : '<span class="meta">Not listed</span>';
    }) +
    row("Ref. no.", function (h) {
      return h.ref ? '<code class="cmp-ref" title="' + esc(h.ref) + '">' + esc(refShort(h)) + "</code>" : "";
    });

  var heads = hs
    .map(function (h) {
      var f = Photos.forHouse(h),
        p = f.list[0];
      return (
        '<th scope="col" class="cmp-col"><div class="cmp-ph"><img src="' +
        esc(p.thumb || p.src) +
        '" alt="" loading="lazy" decoding="async" draggable="false">' +
        (f.area ? '<span class="cmp-area">Area photo</span>' : "") +
        '<button type="button" class="cmp-rm" data-cx="' +
        h.id +
        '" aria-label="Remove ' +
        esc(h.n) +
        ' from the comparison">' +
        ico("x") +
        '</button></div><b class="cmp-name">' +
        esc(h.n) +
        '</b><span class="cmp-sub">' +
        esc(h.t) +
        " · " +
        esc(h.a) +
        '</span><button type="button" class="btn sm cmp-view" data-cv="' +
        h.id +
        '">View details' +
        ico("next") +
        "</button></th>"
      );
    })
    .join("");

  D.innerHTML =
    '<div class="cmp-d"><header class="cmp-h"><button class="cmp-close" type="button" aria-label="Close compare" onclick="dlg.close()">' +
    ico("x") +
    '</button><span class="cmp-kick">Compare</span><h2>' +
    hs.length +
    " places side by side</h2>" +
    '<p class="meta">The best in each row is marked <span class="cmp-best">Best</span>. Details no one has confirmed stay “Unknown”, never guessed.</p></header>' +
    '<div class="cmp-scroll"><table class="cmp-t" data-n="' +
    hs.length +
    '"><thead><tr><td class="cmp-corner"></td>' +
    heads +
    "</tr></thead><tbody>" +
    rows +
    "</tbody></table></div></div>";
  D.classList.add("cmp-wide");
  if (!D.open) {
    D.showModal();
    D.addEventListener(
      "close",
      function () {
        D.classList.remove("cmp-wide");
      },
      { once: true },
    );
  }
  D.scrollTop = 0;
  D.querySelector(".cmp-d").onclick = function (e) {
    var v = e.target.closest("[data-cv]"),
      x = e.target.closest("[data-cx]");
    if (v) {
      D.classList.remove("cmp-wide");
      open(+v.dataset.cv);
    } else if (x) {
      CMP.splice(CMP.indexOf(+x.dataset.cx), 1);
      render(); // unticks that card's Compare box
      if (CMP.length < 2) {
        D.close();
        toast("Pick at least 2 places to compare.");
      } else showCompare();
    }
  };
}
$("cmpGo").onclick = showCompare;
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
  if (!barangayOf($("aB").value)) {
    $("aMsg").textContent = "Choose the barangay.";
    return;
  }
  if (!phoneOk($("aC").value)) {
    $("aMsg").textContent = PHONE_MSG;
    $("aC").focus();
    return;
  }
  var plan = $("aPlan") ? $("aPlan").value : "basic",
    planName = window.Owners && Owners.planName ? Owners.planName() : "Basic";
  // saved through Listings (shared/js/listings/listings.js), so it stays after a reload and can be edited in My listings
  var res = Listings.save({
    n: $("aN").value.trim(),
    a: $("aB").value,
    brgy: $("aB").value,
    street: $("aSt").value.trim(),
    addr: fullAddress($("aSt").value, $("aB").value),
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
    pay: window.Owners && Owners.payMode ? Owners.payMode(plan) : "full",
  });
  if (res.error === "limit") {
    $("aMsg").innerHTML = res.pro
      ? "Owner Pro covers " + res.max + " places, and you’ve listed " + res.max + "."
      : "Basic covers " +
        res.max +
        " places for free, and you’ve used both. Choose <b>Owner Pro</b> to list up to " +
        Listings.LIMIT.pro +
        ".";
    return;
  }
  if (res.error) {
    $("aMsg").textContent = "Couldn’t save the listing: this browser’s storage is full.";
    return;
  }
  this.reset();
  ddSync("aB");
  ddSync("aPlan");
  if (window.Owners && Owners.bill) Owners.bill();
  $("aMsg").innerHTML =
    "Added with " +
    esc(planName) +
    ". It’s now in the list above" +
    (plan !== "basic" ? " with a Featured label" : "") +
    '. <a href="' +
    pageUrl("listings", res.rec.id) +
    '">Add photos and house rules in My listings →</a> (Demo: no payment taken.)';
  render();
};
render();
