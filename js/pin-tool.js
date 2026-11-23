/* ==========================================================
   pin-tool.js - pin.html: set each dorm's exact location by hand
   1. pick a dorm  2. click its building on the map (drag to adjust)
   3. Download pins.js and replace js/pins.js, then upload the site.
   Pins are kept as drafts in this browser (localStorage) until then,
   and the site already shows them on this device for previewing.
   ========================================================== */
(function () {
  var KEY = DNMaps.PIN_DRAFTS,
    CAMPUS = { lat: 8.2415, lng: 124.244 }; // MSU-IIT (OpenStreetMap)
  var FILE = window.PINS || {},
    drafts = read(),
    cur = null,
    map = null,
    marker = null;
  function $(id) {
    return document.getElementById(id);
  }
  function read() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(drafts));
    } catch (e) {
      say("Couldn't save the draft in this browser (storage blocked). Use Copy/Download now.");
    }
  }
  function has(o, k) {
    return Object.prototype.hasOwnProperty.call(o, k);
  }
  function pinOf(id) {
    return has(drafts, id) ? drafts[id] : FILE[id] || null;
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function say(t) {
    $("ptMsg").textContent = t;
  }
  function r6(x) {
    return Math.round(x * 1e6) / 1e6;
  }

  function status(h) {
    var p = pinOf(h.id);
    if (has(drafts, h.id))
      return p ? ["draft", "New pin, not published yet"] : ["draft", "Pin removed, not published yet"];
    return p ? ["ok", "Pinned"] : ["none", "Not pinned yet"];
  }
  function drawList() {
    var done = HOUSES.filter(function (h) {
      return pinOf(h.id);
    }).length;
    $("ptCount").textContent = done + " of " + HOUSES.length + " pinned";
    $("ptList").innerHTML = HOUSES.map(function (h) {
      var s = status(h);
      return (
        '<li><button type="button" data-id="' +
        h.id +
        '"' +
        (cur && cur.id === h.id ? ' aria-current="true"' : "") +
        "><b>" +
        esc(h.n) +
        "</b><small>" +
        esc(h.addr || h.a) +
        '</small><span class="pt-s pt-' +
        s[0] +
        '">' +
        s[1] +
        "</span></button></li>"
      );
    }).join("");
  }
  function drawExport() {
    var all = {};
    Object.keys(FILE).forEach(function (k) {
      all[k] = FILE[k];
    });
    Object.keys(drafts).forEach(function (k) {
      if (drafts[k]) all[k] = drafts[k];
      else delete all[k];
    });
    var ids = Object.keys(all).sort(function (a, b) {
      return a - b;
    });
    $("ptOut").value =
      '/* pins.js - exact dorm locations, set by hand with pin.html.\n   Replace this whole file with the one pin.html downloads, then upload the site.\n   These win over coordinates in js/data.js (they count as geo: "manual"). */\nvar PINS = {\n' +
      ids
        .map(function (id) {
          return '  "' + id + '": ' + JSON.stringify(all[id]);
        })
        .join(",\n") +
      "\n};\n";
    var n = Object.keys(drafts).length;
    $("ptPending").textContent = n
      ? n +
        " unpublished change" +
        (n > 1 ? "s" : "") +
        ". Download pins.js, replace js/pins.js with it, and upload the site."
      : "Everything here is already in js/pins.js.";
  }

  function select(h) {
    cur = h;
    drawList();
    var p = pinOf(h.id);
    $("ptInfo").innerHTML =
      "<b>" +
      esc(h.n) +
      "</b><small>" +
      esc(h.addr || h.a) +
      " · listed as ~" +
      h.d +
      " km from " +
      esc(h.s) +
      "</small>" +
      '<span class="pt-links">' +
      (h.map
        ? '<a href="' + esc(h.map) + '" target="_blank" rel="noopener">See it on Google Maps ↗</a>'
        : "") +
      ' <button type="button" class="linkbtn" id="ptRemove"' +
      (p ? "" : " hidden") +
      ">Remove pin</button>" +
      ' <button type="button" class="linkbtn" id="ptNext">Next dorm →</button></span>';
    if (p) {
      place(p, false);
      map.setView([p.lat, p.lng], 18);
      say("Drag the pin or click the map to move it. Coordinates: " + p.lat + ", " + p.lng);
    } else {
      if (marker) {
        marker.remove();
        marker = null;
      }
      map.setView([CAMPUS.lat, CAMPUS.lng], 16);
      say("Find the building (Satellite view helps), then click it to drop the pin.");
    }
    $("ptNext").onclick = nextDorm;
    $("ptRemove").onclick = function () {
      if (has(FILE, h.id)) drafts[h.id] = null;
      else delete drafts[h.id];
      write();
      select(h);
      drawExport();
      say("Pin removed for " + h.n + ".");
    };
  }
  function place(p, save) {
    if (!marker) {
      marker = L.marker([p.lat, p.lng], {
        draggable: true,
        autoPan: true,
        title: "Drag to adjust",
        keyboard: true,
        icon: L.divIcon({
          className: "nb-pin nb-pin-big",
          html: '<span style="background:#0a47a9"><i></i></span>',
          iconSize: [26, 26],
          iconAnchor: [13, 31],
        }),
      }).addTo(map);
      marker.on("dragend", function () {
        var ll = marker.getLatLng();
        set({ lat: ll.lat, lng: ll.lng });
      });
    } else marker.setLatLng([p.lat, p.lng]);
    if (save) set(p);
  }
  function set(p) {
    if (!cur) return;
    var v = { lat: r6(p.lat), lng: r6(p.lng), at: today() };
    drafts[cur.id] = v;
    write();
    drawList();
    drawExport();
    $("ptRemove").hidden = false;
    say(
      "Saved draft for " +
        cur.n +
        ": " +
        v.lat +
        ", " +
        v.lng +
        ". Pick the next dorm, or download pins.js when you're done.",
    );
  }

  function initMap() {
    map = L.map("ptMap", { maxZoom: 19 }).setView([CAMPUS.lat, CAMPUS.lng], 16);
    var streets = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map);
    var sat = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, maxNativeZoom: 18, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" },
    );
    L.control.layers({ Streets: streets, Satellite: sat }, null, { collapsed: false }).addTo(map);
    L.circleMarker([CAMPUS.lat, CAMPUS.lng], { radius: 6, color: "#ffc83d", weight: 3, fillOpacity: 0.9 })
      .bindTooltip("MSU-IIT")
      .addTo(map);
    map.on("click", function (e) {
      if (!cur) return say("Pick a dorm from the list first.");
      place({ lat: e.latlng.lat, lng: e.latlng.lng }, true);
    });
  }

  /** Go to the next dorm without a pin (wrapping around), or say all are done. */
  function nextDorm() {
    var i = HOUSES.indexOf(cur),
      n = HOUSES.length;
    for (var k = 1; k <= n; k++) {
      var h = HOUSES[(i + k) % n];
      if (!pinOf(h.id)) {
        select(h);
        $("ptLoc").focus();
        return;
      }
    }
    say("Every dorm has a pin. Download pins.js below, then run npm run nearby.");
  }

  // paste coordinates, a plus code or a map link -> pin (parsing in nearby-core.js, unit-tested)
  $("ptPaste").onsubmit = function (e) {
    e.preventDefault();
    if (!cur) return say("Pick a dorm from the list first.");
    var p = NearbyCore.parseLocation($("ptLoc").value, CAMPUS);
    if (!p)
      return say(
        "Couldn't read that. Paste coordinates like 8.2412, 124.2453, a plus code like 66RW+F4M, or a map link that has coordinates in it.",
      );
    var km = NearbyCore.haversine(CAMPUS, p) / 1000;
    if (km > 15)
      return say(
        "That spot is " +
          km.toFixed(1) +
          " km from MSU-IIT, outside Iligan. Check the numbers (latitude first, then longitude).",
      );
    place(p, true);
    map.setView([p.lat, p.lng], 18);
    $("ptLoc").value = "";
    var off = Math.abs(km - cur.d);
    say(
      "Pinned " +
        cur.n +
        " from the " +
        p.from +
        " (" +
        p.lat +
        ", " +
        p.lng +
        "). " +
        (off > 0.6
          ? "Heads up: that's " +
            km.toFixed(1) +
            " km from campus, but the listing says about " +
            cur.d +
            " km. Make sure it's the right dorm."
          : "That matches the listed distance (" +
            km.toFixed(1) +
            " km from campus). Drag the pin if it needs fine-tuning, or press Next dorm."),
    );
  };

  // jump to a street/landmark with OpenStreetMap search (Nominatim), limited to the Iligan area
  $("ptFind").onsubmit = function (e) {
    e.preventDefault();
    var q = $("ptQ").value.trim();
    if (!q) return;
    say("Searching…");
    fetch(
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&viewbox=124.15,8.32,124.33,8.15&bounded=1&q=" +
        encodeURIComponent(q),
    )
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j.length) return say("No match for “" + q + "” around Iligan. Try a street or landmark name.");
        map.setView([+j[0].lat, +j[0].lon], 18);
        say(
          "Found " + j[0].display_name.split(",").slice(0, 3).join(",") + ". Now click the dorm's building.",
        );
      })
      .catch(function () {
        say("Search is unavailable right now. Pan the map by hand.");
      });
  };
  $("ptList").onclick = function (e) {
    var b = e.target.closest("button[data-id]");
    if (b)
      select(
        HOUSES.filter(function (h) {
          return h.id === +b.dataset.id;
        })[0],
      );
  };
  $("ptCopy").onclick = function () {
    var done = function () {
      say("Copied. Paste it over everything in js/pins.js.");
    };
    if (navigator.clipboard)
      navigator.clipboard.writeText($("ptOut").value).then(done, function () {
        $("ptOut").select();
        say("Press Ctrl+C to copy.");
      });
    else {
      $("ptOut").select();
      say("Press Ctrl+C to copy.");
    }
  };
  $("ptDl").onclick = function () {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([$("ptOut").value], { type: "text/javascript" }));
    a.download = "pins.js";
    document.body.appendChild(a);
    a.click();
    a.remove();
    say(
      "Downloaded pins.js. Put it in the js/ folder (replace the old one), upload the site, then click “Clear drafts”.",
    );
  };
  $("ptClear").onclick = function () {
    if ($("ptClear").dataset.sure !== "1") {
      $("ptClear").dataset.sure = "1";
      $("ptClear").textContent = "Click again to clear drafts";
      return;
    }
    $("ptClear").dataset.sure = "";
    $("ptClear").textContent = "Clear drafts";
    drafts = {};
    write();
    drawList();
    drawExport();
    if (cur) select(cur);
    say("Drafts cleared. The site now uses js/pins.js only.");
  };

  $("ptLogo").innerHTML = logoHTML();
  DNMaps.loadLeaflet().then(
    function () {
      initMap();
      drawList();
      drawExport();
      var first =
        HOUSES.filter(function (h) {
          return !pinOf(h.id);
        })[0] || HOUSES[0];
      select(first);
    },
    function (e) {
      $("ptMap").innerHTML = '<p class="nb-msg">' + esc(e.message) + "</p>";
    },
  );
})();
