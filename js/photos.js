/* ==========================================================
   photos.js - pictures for listing cards and the listing dialog
   AREA: free, credited photos of the neighborhood (Wikimedia Commons,
         CC BY-SA 4.0). Shown on every dorm WITHOUT its own photos,
         always labeled "Area photo, not this dorm".
   DORM: real photos of a dorm, by listing id. Only add photos you are
         allowed to use (taken yourself, or the owner said yes), e.g.
           "7": [{ src: "img/dorms/7-1.jpg", alt: "Front gate of Brylle's Dormitory",
                   credit: "Owner", license: "Used with permission" }]
         Never copy photos from Google Maps or Facebook.
         Optional: thumb = a ~500px wide copy, used on cards (saves data on phones).
   ========================================================== */
var PHOTOS = {
  area: [
    {
      src: "img/area/tibanga-avenue.jpg",
      thumb: "img/area/tibanga-avenue-500.jpg",
      w: 960,
      h: 720,
      alt: "Andres Bonifacio Avenue in Tibanga, the main road beside MSU-IIT, lined with shops and fast-food places",
      caption: "Andres Bonifacio Ave, Tibanga (beside MSU-IIT)",
      credit: "Patrickroque01",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      page: "https://commons.wikimedia.org/wiki/File:Iligan_Tibanga,_Andres_Bonfacio_Avenue_(Iligan,_Lanao_Del_Norte;_10-15-2023).jpg",
    },
    {
      src: "img/area/msu-iit-gym.jpg",
      thumb: "img/area/msu-iit-gym-500.jpg",
      w: 960,
      h: 432,
      alt: "The MSU-IIT gymnasium with the big MSU-IIT letters in front and students walking by",
      caption: "MSU-IIT Gymnasium",
      credit: "Exec8",
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      page: "https://commons.wikimedia.org/wiki/File:Facade_of_Mindanao_State_University_%E2%80%93_Iligan_Institute_of_Technology_Gymnasium.jpg",
    },
  ],
  dorm: {},
};

var Photos = (function () {
  /** {list, area}: the dorm's own photos, or the area photos (rotated so neighboring cards differ). */
  function forHouse(h, pos) {
    var own = PHOTOS.dorm[h.id];
    if (own && own.length) return { list: own, area: false };
    var a = PHOTOS.area,
      k = (pos == null ? h.id || 0 : pos) % a.length; // by list position, so neighbors differ
    return { list: a.slice(k).concat(a.slice(0, k)), area: true };
  }
  function creditHTML(p) {
    var who = p.page
      ? '<a href="' + esc(p.page) + '" target="_blank" rel="noopener">' + esc(p.credit) + "</a>"
      : esc(p.credit);
    var lic = p.licenseUrl
      ? '<a href="' + esc(p.licenseUrl) + '" target="_blank" rel="noopener">' + esc(p.license) + "</a>"
      : esc(p.license || "");
    return "Photo: " + who + (lic ? ", " + lic : "");
  }
  /** Card thumbnail: first photo, lazy-loaded, with a small label and credit. */
  function thumb(h, pos) {
    var f = forHouse(h, pos),
      p = f.list[0];
    // cards are ~300px wide: the 500px file (about 60 KB) unless the screen needs more
    var srcset = p.thumb
      ? ' srcset="' + esc(p.thumb) + " 500w, " + esc(p.src) + ' 960w" sizes="(max-width: 700px) 92vw, 340px"'
      : "";
    return (
      '<img class="ph-img" src="' +
      esc(p.thumb || p.src) +
      '"' +
      srcset +
      ' alt="' +
      esc(f.area ? "Area near " + h.n + ": " + p.alt : p.alt) +
      '" loading="lazy" decoding="async" draggable="false">' +
      '<span class="ph-label">' +
      (f.area ? "<b>Area photo</b> · " : "") +
      "© " +
      esc(p.credit) +
      (p.license ? ", " + esc(p.license) : "") +
      "</span>"
    );
  }
  /** Dialog hero gallery (prev/next + dots when there is more than one photo). */
  function hero(h) {
    var f = forHouse(h),
      many = f.list.length > 1;
    return (
      '<div class="dlg-gal" data-i="0" data-id="' +
      h.id +
      '">' +
      '<img class="dlg-img" src="' +
      esc(f.list[0].src) +
      '" alt="" draggable="false">' +
      '<span class="dlg-shade" aria-hidden="true"></span>' +
      (f.area
        ? '<span class="dlg-area" title="No photos of this dorm yet">Area photo · not this dorm</span>'
        : "") +
      (many
        ? '<button type="button" class="dlg-nav dlg-prev" aria-label="Previous photo">‹</button><button type="button" class="dlg-nav dlg-next" aria-label="Next photo">›</button>' +
          '<span class="dlg-dots" aria-hidden="true">' +
          f.list
            .map(function (_, i) {
              return "<i" + (i ? "" : ' class="on"') + "></i>";
            })
            .join("") +
          "</span>"
        : "") +
      '<p class="dlg-cap" aria-live="polite"></p></div>'
    );
  }
  /** Wire the gallery rendered by hero(h) inside `root`. */
  function mount(root, h) {
    var g = root.querySelector(".dlg-gal");
    if (!g) return;
    var f = forHouse(h),
      img = g.querySelector(".dlg-img"),
      cap = g.querySelector(".dlg-cap"),
      dots = g.querySelectorAll(".dlg-dots i");
    function show(i) {
      i = (i + f.list.length) % f.list.length;
      var p = f.list[i];
      g.dataset.i = i;
      img.src = p.src;
      img.alt = f.area ? "Area near " + h.n + ": " + p.alt : p.alt;
      cap.innerHTML =
        (p.caption ? "<b>" + esc(p.caption) + "</b> · " : "") +
        creditHTML(p) +
        (f.list.length > 1 ? ' <span class="dlg-count">' + (i + 1) + "/" + f.list.length + "</span>" : "");
      dots.forEach(function (d, k) {
        d.className = k === i ? "on" : "";
      });
    }
    g.onclick = function (e) {
      if (e.target.closest(".dlg-prev")) show(+g.dataset.i - 1);
      else if (e.target.closest(".dlg-next")) show(+g.dataset.i + 1);
    };
    g.onkeydown = function (e) {
      if (e.key === "ArrowLeft") show(+g.dataset.i - 1);
      if (e.key === "ArrowRight") show(+g.dataset.i + 1);
    };
    show(0);
  }
  return { forHouse: forHouse, thumb: thumb, hero: hero, mount: mount };
})();
