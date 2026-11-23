/* ==========================================================
   details.js - listing details dialog (used by Rooms and Discover)
   ========================================================== */

function bg(h) {
  return "#eef4fd";
}
function city(h) {
  return ["MSU-IIT", "Iligan Capitol College", "St. Michael’s College"].indexOf(h.s) >= 0
    ? "Iligan City"
    : "Cagayan de Oro";
}
var ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="#8fb0e0" stroke-width="3" stroke-linejoin="round" aria-hidden="true"><path d="M8 30L32 10l24 20M14 26v28h36V26"/><path d="M26 54V38h12v16"/></svg>';
var D = $("dlg");
function open(id) {
  var h = HOUSES.filter(function (x) {
    return x.id === id;
  })[0];
  var tel = /\d/.test(h.c)
    ? '<a href="tel:' + h.c.replace(/[^+\d]/g, "") + '">' + esc(h.c) + "</a>"
    : "Phone not listed";
  // The close button comes first and is sticky (css/details.css), so it stays at the top while the dialog scrolls.
  D.innerHTML =
    '<button class="x dlg-x" type="button" aria-label="Close" onclick="dlg.close()">✕</button>' +
    '<div class="dh dlg-hero">' +
    Photos.hero(h) +
    '<span class="dlg-type">' +
    esc(h.t) +
    "</span></div>" +
    '<div class="db dlg-body"><div class="dlg-title">' +
    (window.Hearts ? Hearts.button(h, "hrt-dlg") : "") +
    "<h2>" +
    esc(h.n) +
    '</h2><div class="meta">' +
    esc(h.a) +
    ", " +
    city(h) +
    " · From " +
    esc(h.src || "owner") +
    "</div></div>" +
    '<div class="dlg-price">' +
    rent(h) +
    '</div><p class="dlg-desc">' +
    esc(h.ds) +
    "</p>" +
    '<div class="dlg-facts">' +
    '<div class="dlg-fact dlg-wide"><span class="dlg-k">Amenities</span><div class="chips">' +
    (h.am.length
      ? h.am
          .map(function (a) {
            return '<span class="chip">' + esc(a) + "</span>";
          })
          .join("")
      : '<span class="meta">Not published. Ask the owner.</span>') +
    "</div></div>" +
    '<div class="dlg-fact"><span class="dlg-k">Location</span><div>' +
    esc(h.addr || h.a) +
    '</div><div class="meta">About ' +
    h.d +
    " km from " +
    esc(h.s) +
    " (straight line)</div>" +
    (h.map ? '<a href="' + esc(h.map) + '" target="_blank" rel="noopener">Open in Google Maps ↗</a>' : "") +
    "</div>" +
    '<div class="dlg-fact"><span class="dlg-k">Quality rating</span><div>' +
    stars(h, 1) +
    "</div>" +
    (window.Hearts ? '<span class="dlg-k dlg-k2">Saved by students</span><div>' + Hearts.savedLine(h) + "</div>" : "") +
    '<span class="dlg-k dlg-k2">Contact</span><div>' +
    tel +
    "</div></div>" +
    "</div>" +
    (window.DNMaps ? DNMaps.section(h) : "") +
    (window.Comments ? Comments.section(h) : "") +
    "</div>";
  D.showModal();
  D.scrollTop = 0; // start at the top even if the last listing was scrolled
  Photos.mount(D, h);
  if (window.DNMaps) DNMaps.mount(h); // map + nearby places load after the dialog is visible
  if (window.Comments) Comments.mount(D, h);
}
