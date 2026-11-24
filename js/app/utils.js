/* ==========================================================
   utils.js - tiny helpers: $ (getElementById), peso (money), esc (HTML-escape)
   ========================================================== */

var $ = function (i) {
    return document.getElementById(i);
  },
  peso = function (n) {
    return n == null ? "On request" : "₱" + n.toLocaleString("en-PH");
  };

/** Monthly rent as HTML; many places do not publish a rate. */
function rent(h) {
  return h.p == null ? '<span class="np">Rate on request</span>' : peso(h.p) + " <small>/ month</small>";
}

/* ---------- stars = quality, rated only by people who stayed there ----------
   Google reviews (h.r over h.rc ratings) + DormNamo tenant ratings left with a
   comment (comments.js, one per person). Hearts (hearts.js) are separate and
   never change this number. */
function rating(h) {
  var t = window.Comments && Comments.stats ? Comments.stats(h.id) : { n: 0, sum: 0 },
    g = h.r ? h.rc || 0 : 0,
    n = g + t.n;
  if (!n) return null;
  return { avg: (g * h.r + t.sum) / n, n: n, g: g, gr: h.r, t: t.n, tavg: t.n ? t.sum / t.n : 0 };
}
/** Stars as HTML. long = dialog version with where the ratings come from. */
function stars(h, long) {
  var x = rating(h),
    body;
  if (!x) body = '<span class="meta">No ratings yet</span>';
  else
    body =
      '<span class="star" title="Quality rating from ' +
      x.n +
      (x.n === 1 ? " person" : " people") +
      ' who stayed here">★ ' +
      x.avg.toFixed(1) +
      ' <span class="meta">(' +
      x.n +
      (long ? (x.n === 1 ? " rating" : " ratings") : "") +
      ")</span></span>";
  if (long)
    body +=
      '<span class="rate-src">' +
      (x
        ? [
            x.g ? "Google " + x.gr.toFixed(1) + " (" + x.g + ")" : "",
            x.t ? "Tenants on DormNamo " + x.tavg.toFixed(1) + " (" + x.t + ")" : "",
          ]
            .filter(Boolean)
            .join(" · ") + ". "
        : "") +
      "Stars rate quality and only come from people who stayed here.</span>";
  return '<span class="rate" data-rate="' + h.id + '" data-long="' + (long ? 1 : 0) + '">' + body + "</span>";
}
/** Re-draw every star rating of one listing on the page (after a tenant rates it). */
function refreshStars(h) {
  document.querySelectorAll('[data-rate="' + h.id + '"]').forEach(function (el) {
    el.outerHTML = stars(h, el.dataset.long === "1");
  });
}
/** Sort key for "Top rated". */
function ratingScore(h) {
  var x = rating(h);
  return x ? x.avg : 0;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

/* ---------- reference numbers: every listing has a permanent random UUID v4 (h.ref) ---------- */
var UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** A new UUID v4 (RFC 9562): 122 random bits, version 4, variant 10. */
function uuid() {
  var c = window.crypto;
  if (c && c.randomUUID) return c.randomUUID();
  var b = new Uint8Array(16),
    i;
  if (c && c.getRandomValues) c.getRandomValues(b);
  else for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  var x = "";
  for (i = 0; i < 16; i++)
    x += (b[i] + 0x100).toString(16).slice(1) + ([3, 5, 7, 9].indexOf(i) >= 0 ? "-" : "");
  return x;
}
/** Reference number as shown to people: "DN-" + the first block, e.g. DN-B6648126 (the full UUID is in the title). */
function refShort(h) {
  return h && h.ref ? "DN-" + h.ref.slice(0, 8).toUpperCase() : "";
}
/** Small "Ref. no." chip with a copy button; [data-copy] is handled by details.js. */
function refHTML(h) {
  if (!h || !h.ref) return "";
  return (
    '<span class="ref" title="Reference no. ' +
    esc(h.ref) +
    '">Ref. no. <code>' +
    esc(refShort(h)) +
    '</code><button type="button" class="ref-cp" data-copy="' +
    esc(h.ref) +
    '" aria-label="Copy the full reference number">' +
    ico("copy") +
    "</button></span>"
  );
}

/* ---------- PH mobile numbers: always 09XX XXX XXXX (11 digits, starting with 09) ----------
   Other ways of writing the same number are converted: "+63 917 123 4567", "63917…" and
   "917…" all become "0917 123 4567". Anything that doesn't start with 09 is not accepted. */
function fmtPhone(v) {
  var d = String(v || "").replace(/\D/g, "");
  if (/^63/.test(d))
    d = "0" + d.slice(2); // +63 917… -> 0917…
  else if (/^9/.test(d)) d = "0" + d; // 917… -> 0917…
  d = d.slice(0, 11);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7)].filter(Boolean).join(" ");
}
function phoneOk(v) {
  return /^09\d{9}$/.test(String(v || "").replace(/\D/g, ""));
}
var PHONE_MSG = "Mobile numbers start with 09 and have 11 digits, like 0917 123 4567.";
/** Format an <input type=tel> while typing (keeps the caret after the same digit) and flag numbers not starting with 09. */
function phoneField(tel) {
  if (!tel) return;
  tel.setAttribute("inputmode", "tel");
  tel.setAttribute("autocomplete", "tel");
  tel.setAttribute("pattern", "09\\d{2} \\d{3} \\d{4}");
  tel.setAttribute("title", PHONE_MSG);
  if (!tel.placeholder) tel.placeholder = "09XX XXX XXXX";
  tel.maxLength = 13;
  function check() {
    var bad = tel.value && !phoneOk(tel.value);
    tel.setCustomValidity(bad ? PHONE_MSG : "");
    tel.classList.toggle("bad-tel", !!bad);
  }
  tel.addEventListener("input", function () {
    var v = tel.value,
      pos = tel.selectionStart,
      before = v.slice(0, pos).replace(/\D/g, "").length;
    if (/^\s*\+\d?$/.test(v)) return; // let "+" / "+6" be typed on the way to +63
    var out = fmtPhone(v),
      k = 0,
      i = 0,
      digits = v.replace(/\D/g, "");
    if (/^63/.test(digits))
      before--; // "63" became "0"
    else if (/^9/.test(digits)) before++; // a 0 was added in front
    tel.value = out;
    while (i < out.length && k < before) {
      if (/\d/.test(out[i])) k++;
      i++;
    }
    if (document.activeElement === tel) tel.setSelectionRange(i, i);
    if (tel.classList.contains("bad-tel") || phoneOk(out)) check();
  });
  tel.addEventListener("blur", function () {
    check();
  });
}

/* ---------- addresses: barangay + Iligan City, Lanao del Norte, Region X (data.js PH_PLACE, BARANGAYS) ---------- */
/** The barangay as written in BARANGAYS ("tibanga" -> "Tibanga"), or "" if it isn't one. */
function barangayOf(v) {
  var t = String(v || "")
    .toLowerCase()
    .replace(/^(brgy\.?|barangay)\s+/, "")
    .trim();
  return (
    (window.BARANGAYS || []).filter(function (b) {
      return b.toLowerCase() === t;
    })[0] || ""
  );
}
/** "Purok 4, Brgy. Tibanga, Iligan City, Lanao del Norte, Region X (Northern Mindanao), 9200" */
function fullAddress(street, brgy) {
  var P = window.PH_PLACE || {};
  return [street, brgy ? "Brgy. " + brgy : "", P.city, P.province, P.region, P.zip]
    .map(function (x) {
      return String(x || "").trim();
    })
    .filter(Boolean)
    .join(", ");
}
/** <option>s for a barangay <select>, the current one selected. */
function barangayOptions(cur) {
  return (
    '<option value="">Choose a barangay</option>' +
    (window.BARANGAYS || [])
      .map(function (b) {
        return "<option" + (b === cur ? " selected" : "") + ">" + esc(b) + "</option>";
      })
      .join("")
  );
}
/** The fixed part of every address, shown under the barangay picker. */
function placeLineHTML() {
  var P = window.PH_PLACE || {};
  return (
    '<p class="place-line">' +
    ico("pin") +
    "<span><b>" +
    esc(P.city || "") +
    "</b> · " +
    esc(P.province || "") +
    " · " +
    esc(P.region || "") +
    " · ZIP " +
    esc(P.zip || "") +
    "</span></p>"
  );
}

/* ---------- brand + line icons ---------- */
/** DormNamo mark: rounded tile, arched door on a small step, gold knob. Colors are set in css/base/brand.css (.dn-*). */
/* Two door leaves over a doorway (.dn-in). The gap between the leaves is the old white seam; on hover
   (css/base/brand.css) the leaves swing open toward their hinges and the doorway lights up gold. No clipPath,
   so several copies on one page (nav, login, questionnaire) never clash over ids. */
var LOGO_MARK =
  '<svg class="dn-mark" viewBox="0 0 28 32" aria-hidden="true">' +
  '<path class="dn-in" d="M3 28.4V14a11 11 0 0 1 22 0v14.4a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 28.4z"/>' +
  '<g class="dn-leaf dn-l"><path class="dn-arch" d="M3 28.4V14A11 11 0 0 1 13.2 3.03V30H4.6A1.6 1.6 0 0 1 3 28.4z"/><circle class="dn-knob" cx="10.9" cy="18.6" r="1.45"/></g>' +
  '<g class="dn-leaf dn-r"><path class="dn-arch" d="M14.8 3.03A11 11 0 0 1 25 14v14.4a1.6 1.6 0 0 1-1.6 1.6H14.8z"/><circle class="dn-knob" cx="17.1" cy="18.6" r="1.45"/></g>' +
  "</svg>";
function logoHTML() {
  return LOGO_MARK + '<span class="dn-word">Dorm<span>Namo</span></span>';
}

/** Line icons (24x24, drawn in the current text color). Use ico("heart"). */
var ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  heart:
    '<path d="M12 20s-7-4.4-9.2-8.6C1.3 8.4 3.2 5 6.6 5c2.1 0 3.4 1.2 5.4 3.3C14 6.2 15.3 5 17.4 5c3.4 0 5.3 3.4 3.8 6.4C19 15.6 12 20 12 20z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6v.01"/>',
  dots: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
  bookmark: '<path d="M6 3.5h12v17l-6-4.3-6 4.3z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  sliders:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  route:
    '<circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8.2 19h8.3a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7h7.3"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16v.01"/>',
  logout:
    '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>',
  wallet:
    '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7z"/><path d="M4 7V6a2 2 0 0 1 2-2h10"/><path d="M16 13.5h.01"/>',
  users:
    '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8"/><path d="M17.5 14.2A5.5 5.5 0 0 1 20.5 19"/>',
  drop: '<path d="M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/>',
  door: '<path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21"/><path d="M4 21h16"/><path d="M14.5 12.5h.01"/>',
  done: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>',
  next: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  back: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  image:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-4.8-4.8L6 19.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash:
    '<path d="M4 7h16"/><path d="M9.5 7V4.8h5V7"/><path d="M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6L12 16.6l-5 2.6.9-5.6-4-3.9 5.6-.8z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  send: '<path d="M21 3 10 14"/><path d="M21 3l-6.5 18-4.5-7-7-4.5L21 3z"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  phone:
    '<path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 5.1 5.1l1.4-2.3L19 14.5V18a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
};
function ico(name, cls) {
  return (
    '<svg class="ic' +
    (cls ? " " + cls : "") +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[name] || "") +
    "</svg>"
  );
}
