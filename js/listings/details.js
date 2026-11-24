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
  // The close button comes first and is sticky (css/components/details.css), so it stays at the top while the dialog scrolls.
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
    "</div>" +
    refHTML(h) +
    "</div>" +
    '<div class="dlg-price-row"><div class="dlg-price">' +
    rent(h) +
    "</div>" +
    inquireBtn(h) +
    '</div><div class="inq" id="inq" hidden></div><p class="dlg-desc">' +
    esc(h.ds) +
    "</p>" +
    Photos.rooms(h) +
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
    (window.Hearts
      ? '<span class="dlg-k dlg-k2">Saved by students</span><div>' + Hearts.savedLine(h) + "</div>"
      : "") +
    '<span class="dlg-k dlg-k2">Contact</span><div>' +
    tel +
    "</div></div>" +
    "</div>" +
    ownerHTML(h) +
    (window.DNMaps ? DNMaps.section(h) : "") +
    (window.Comments ? Comments.section(h) : "") +
    "</div>";
  D.showModal();
  D.scrollTop = 0; // start at the top even if the last listing was scrolled
  Photos.mount(D, h);
  Photos.mountRooms(D, h); // room photos open in their own viewer, apart from the cover
  if (window.DNMaps) DNMaps.mount(h); // map + nearby places load after the dialog is visible
  if (window.Comments) Comments.mount(D, h);
}

/** Copy a listing's full reference number ([data-copy] from refHTML in utils.js). */
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-copy]");
  if (!b) return;
  var text = b.dataset.copy;
  function done(ok) {
    if (typeof toast === "function") toast(ok ? "Reference no. copied" : "Reference no.: " + text);
  }
  if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(text).then(
      function () {
        done(true);
      },
      function () {
        done(false);
      },
    );
  else done(false);
});

/* ---------- who owns it: landowner card + "I'm interested" (inbox.js) ---------- */
function avatarHTML(id, name, cls) {
  var hue = 0;
  String(id + name)
    .split("")
    .forEach(function (c) {
      hue = (hue * 31 + c.charCodeAt(0)) % 360;
    });
  return (
    '<span class="av ' +
    (cls || "") +
    '" style="--av:' +
    hue +
    '" aria-hidden="true">' +
    esc(
      String(name || "?")
        .charAt(0)
        .toUpperCase(),
    ) +
    "</span>"
  );
}
function ownerHTML(h) {
  var own = window.Inbox ? Inbox.ownerOf(h.id) : null;
  if (!own)
    return (
      '<div class="own-card own-none"><span class="dlg-k">Landowner</span><p class="meta">This owner isn' +
      "'t on DormNamo yet, so you can't message them here. " +
      (/\d/.test(h.c || "")
        ? "Call or text " + esc(h.c) + " instead, or tap Inquire now."
        : "Ask around the area or check the map.") +
      "</p></div>"
    );
  var p = window.Accounts && Accounts.person ? Accounts.person(own.id) : null,
    mine = window.USER && USER.id === own.id,
    guest = !window.USER || USER.id === "guest";
  return (
    '<div class="own-card"><span class="dlg-k">Landowner</span><div class="own-row">' +
    avatarHTML(own.id, own.name) +
    '<div class="own-t"><b>' +
    esc(p ? p.name : own.name) +
    "</b><small>" +
    esc(p ? Accounts.describe(p) : "Landowner") +
    "</small>" +
    (p && p.bio ? '<p class="own-bio">' + esc(p.bio) + "</p>" : "") +
    '</div></div><div class="own-acts">' +
    (mine
      ? '<a class="btn alt sm" href="mylistings.html#' + h.id + '">This is your place · Edit it</a>'
      : guest
        ? '<span class="meta">Create an account to message the landowner (guests can' +
          "'t receive replies).</span>"
        : '<button type="button" class="btn sm" data-interest="' +
          h.id +
          '">' +
          ico("chat") +
          "I'm interested · Message</button>") +
    '<a class="btn alt sm" href="people.html#u=' +
    esc(own.id) +
    '">View profile</a></div></div>'
  );
}
/** "I'm interested": start the chat with the landowner and go to Messages. */
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-interest]");
  if (b && window.Inbox) startInterest(+b.dataset.interest);
});
function startInterest(id) {
  var r = Inbox.interest(id);
  if (r.error) {
    toast(r.error === "account" ? "Create an account to message landowners." : "You can't message yourself.");
    return;
  }
  var url = "messages.html#t=" + r.thread.id;
  if (document.body.dataset.page === "messages") {
    if (D.open) D.close();
    location.hash = "t=" + r.thread.id;
    return;
  }
  document.documentElement.classList.add("leaving");
  setTimeout(function () {
    location.href = url;
  }, 220);
}

/* ---------- "Inquire now": talk to the landowner and negotiate ----------
   A place whose landowner is on DormNamo -> the chat with them (Messages, offers, tenant group).
   A place from Google Maps (no account here) -> a panel to call or text them, with a ready message. */
function inquireBtn(h) {
  var own = window.Inbox ? Inbox.ownerOf(h.id) : null;
  if (own && window.USER && USER.id === own.id) return ""; // your own place
  return (
    '<button type="button" class="btn inq-btn" data-inquire="' +
    h.id +
    '">' +
    ico("chat") +
    "Inquire now</button>"
  );
}
function inquiryText(h) {
  return (
    "Hi! I saw " +
    h.n +
    " on DormNamo. Is there a room available? How much is the monthly rent, and what is included (water, electricity, Wi-Fi)? Can I visit this week? Thank you!"
  );
}
function inquiryHTML(h) {
  var phone = /\d/.test(h.c || "") ? h.c.replace(/[^+\d]/g, "") : "",
    msg = inquiryText(h),
    city = (window.PH_PLACE && PH_PLACE.city) || "",
    fb = "https://www.facebook.com/search/top?q=" + encodeURIComponent(h.n + " " + city),
    map = h.map || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(h.n + ", " + city);
  return (
    "<p class=\"inq-h\"><b>This owner isn't on DormNamo yet,</b> so there's no chat here. Contact them directly:</p>" +
    (phone
      ? '<div class="inq-acts"><a class="btn sm" href="tel:' +
        esc(phone) +
        '">' +
        ico("phone") +
        "Call " +
        esc(fmtPhone(h.c)) +
        '</a><a class="btn alt sm" href="sms:' +
        esc(phone) +
        "?&body=" +
        encodeURIComponent(msg) +
        '">' +
        ico("send") +
        "Text this message</a></div>"
      : '<p class="meta">No phone number is listed. Try finding them online:</p>') +
    '<label class="inq-msg"><span>Your message <small class="meta">(edit it, then copy)</small></span><textarea id="inqText" rows="3">' +
    esc(msg) +
    '</textarea></label><div class="inq-acts"><button type="button" class="btn alt sm" data-inq-copy>' +
    ico("copy") +
    'Copy message</button><a class="btn alt sm" href="' +
    esc(fb) +
    '" target="_blank" rel="noopener nofollow">Find them on Facebook</a><a class="btn alt sm" href="' +
    esc(map) +
    '" target="_blank" rel="noopener nofollow">Google Maps</a></div>' +
    '<small class="meta">Tip: ask Namo “what should I ask the landlord?” before you call.</small>'
  );
}
document.addEventListener("click", function (e) {
  var b = e.target.closest("[data-inquire]");
  if (b) {
    var id = +b.dataset.inquire,
      h = HOUSES.filter(function (x) {
        return x.id === id;
      })[0],
      own = window.Inbox ? Inbox.ownerOf(id) : null;
    if (own) return startInterest(id); // the chat with the landowner, like "I'm interested · Message"
    var box = document.getElementById("inq");
    if (!box || !h) return;
    if (box.hidden) box.innerHTML = inquiryHTML(h);
    box.hidden = !box.hidden;
    b.setAttribute("aria-expanded", !box.hidden);
    if (!box.hidden) box.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  if (e.target.closest("[data-inq-copy]")) {
    var t = document.getElementById("inqText");
    if (!t) return;
    var ok = function () {
        toast("Message copied. Paste it in Messenger or your SMS app.");
      },
      bad = function () {
        t.select();
        toast("Select the message and copy it.");
      };
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(t.value).then(ok, bad);
    else bad();
  }
});
