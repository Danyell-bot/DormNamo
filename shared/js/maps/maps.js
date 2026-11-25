/* ==========================================================
   maps.js - map + "Nearby places" in the listing dialog
   DNMaps.section(h) returns the HTML; DNMaps.mount(h) fills it in after
   the dialog opens. Needs nearby-core.js, pins.js and (optional) config.js.

   Two providers, picked automatically from shared/js/app/config.js:
   - map:    Google Maps (mapsBrowserKey set)  or  OpenStreetMap via Leaflet (free, no key)
   - nearby: our Google worker (nearbyApiUrl + nearbyGoogle)  or  OpenStreetMap via Overpass (free, no key)
     The worker may run only for Namo's Gemini wording; nearbyGoogle false keeps nearby on OpenStreetMap.
   Exact dorm locations come from pins.js (set by hand in the pin tool (pin/)), drafts
   saved on this device by the pin tool (pin/), or lat/lng in data.js.
   Everything fails soft: without coordinates or a network the dialog still works.
   ========================================================== */
var DNMaps = (function () {
  var C = NearbyCore;
  var cfg = window.DN_CONFIG || {};
  var GOOGLE_MAP = !!cfg.mapsBrowserKey,
    GOOGLE_NEARBY = !!cfg.nearbyApiUrl && cfg.nearbyGoogle !== false;
  var LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
  var OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ];
  var PIN_DRAFTS = "dn:pinDrafts";
  var libReady = null,
    authFailed = false;
  var memo = {}; // provider|coords|radii -> Promise of nearby data (one fetch per listing)
  var radii = { mall: 3000 };
  var hidden =
    load("dn:nbHidden", null) ||
    C.CATEGORIES.reduce(function (o, c) {
      if (c.optional) o[c.key] = 1;
      return o;
    }, {});
  var view = null; // {h, map, markers:{cat:[...]}, data}
  var shared = null; // {el, map, dorm}: one map reused by every dialog

  function load(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k)) || d;
    } catch (e) {
      return d;
    }
  }
  function keep(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }
  function el(id) {
    return document.getElementById(id);
  }
  function live(h) {
    return view && view.h === h && el("nbMap") && el("nbMap").isConnected;
  }

  /* ---------- exact pins (pins.js + this device's drafts from the pin tool (pin/)) ---------- */
  function applyPins() {
    var file = window.PINS || {},
      drafts = load(PIN_DRAFTS, {});
    if (typeof HOUSES === "undefined") return;
    HOUSES.forEach(function (h) {
      var draft = Object.prototype.hasOwnProperty.call(drafts, h.id),
        p = draft ? drafts[h.id] : file[h.id];
      if (p && isFinite(p.lat) && isFinite(p.lng)) {
        h.lat = +p.lat;
        h.lng = +p.lng;
        h.geo = "manual";
        h.pinDraft = draft;
      } else if (draft && p === null && h.geo === "manual") {
        delete h.lat;
        delete h.lng;
        h.pinDraft = true;
      }
    });
  }
  applyPins();

  /* ---------- markup ---------- */
  function section(h) {
    var has = h.lat != null && h.lng != null;
    return (
      '<section class="nb" aria-labelledby="nbTitle">' +
      '<div class="nb-head"><h3 id="nbTitle">Location &amp; nearby places</h3>' +
      '<a class="btn sm" href="' +
      esc(C.directionsUrl(h)) +
      '" target="_blank" rel="noopener">' +
      ico("compass") +
      "Get directions</a></div>" +
      '<div class="nb-map" id="nbMap" role="region" aria-label="Map showing ' +
      esc(h.n) +
      ' and nearby places">' +
      (has
        ? '<div class="nb-skel nb-skel-map" aria-hidden="true"></div><span class="sr">Loading map…</span>'
        : msg(
            "pin",
            "Exact location not set yet",
            "This dorm hasn't been pinned on the map yet. Use Get directions to search for it on Google Maps.",
          )) +
      "</div>" +
      (has ? '<div class="nb-route" id="nbRoute" aria-live="polite" hidden></div>' : "") +
      (has && h.pinDraft
        ? '<p class="meta nb-draft">' +
          ico("pin") +
          'Pin preview from this device only. Download pins.js in the <a href="' +
          pageUrl("pin") +
          '">pin tool</a> and upload it to publish.</p>'
        : "") +
      (has
        ? '<div class="nb-legend" id="nbLegend" role="group" aria-label="Show categories on the map and list"></div>' +
          '<div class="nb-sum" id="nbSum" aria-live="polite">' +
          skelLines(2) +
          "</div>" +
          '<div id="nbList" aria-busy="true">' +
          skelList() +
          "</div>"
        : "") +
      '<p class="nb-attr" id="nbAttr">' +
      attribution(null) +
      "</p>" +
      "</section>"
    );
  }
  function attribution(source) {
    var map = GOOGLE_MAP
      ? 'Map: <span translate="no">Google Maps</span>.'
      : "Map © OpenStreetMap contributors.";
    if (source === "osm")
      return (
        map +
        " Nearby places © OpenStreetMap contributors (mapped by volunteers, so some shops may be missing)."
      );
    if (source === "google")
      return (
        map + ' Nearby places: <span translate="no">Google Maps</span>. Ratings and hours may be out of date.'
      );
    return map;
  }
  function msg(icon, title, text) {
    return (
      '<div class="nb-msg"><span class="nb-msg-i">' +
      ico(icon) +
      "</span><b>" +
      esc(title) +
      "</b><small>" +
      esc(text) +
      "</small></div>"
    );
  }
  function skelLines(n) {
    var s = "";
    for (var i = 0; i < n; i++)
      s += '<div class="nb-skel nb-skel-line" style="width:' + (80 - i * 22) + '%"></div>';
    return s;
  }
  function skelList() {
    var s = "";
    for (var i = 0; i < 3; i++)
      s +=
        '<div class="nb-cat"><div class="nb-skel nb-skel-line" style="width:40%"></div>' +
        skelLines(3) +
        "</div>";
    return s;
  }
  function infoNode(title, lines, link) {
    var d = document.createElement("div");
    d.className = "nb-info";
    var b = document.createElement("b");
    b.textContent = title;
    d.appendChild(b);
    lines.filter(Boolean).forEach(function (t) {
      var s = document.createElement("div");
      s.textContent = t;
      d.appendChild(s);
    });
    if (link) {
      var a = document.createElement("a");
      a.href = link[0];
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = link[1];
      d.appendChild(a);
    }
    return d;
  }
  function openLink(url) {
    var a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  } // window.open is taken by details.js

  /* ---------- map libraries ---------- */
  window.gm_authFailure = function () {
    // Google calls this when the browser key is rejected
    authFailed = true;
    if (el("nbMap"))
      el("nbMap").innerHTML = msg(
        "compass",
        "Map unavailable",
        "The Google Maps key was rejected (check its HTTP referrer and API restrictions).",
      );
  };
  function loadGoogle() {
    return new Promise(function (resolve, reject) {
      if (window.google && google.maps && google.maps.importLibrary) return resolve();
      var cb = "__dnMapsReady",
        t = setTimeout(function () {
          reject(new Error("Google Maps took too long to load."));
        }, 15000);
      window[cb] = function () {
        clearTimeout(t);
        resolve();
      };
      var s = document.createElement("script");
      s.src =
        "https://maps.googleapis.com/maps/api/js?key=" +
        encodeURIComponent(cfg.mapsBrowserKey) +
        "&v=weekly&loading=async&libraries=marker&region=PH&callback=" +
        cb;
      s.async = true;
      s.onerror = function () {
        clearTimeout(t);
        reject(new Error("Could not load Google Maps. Check your connection."));
      };
      document.head.appendChild(s);
    }).then(function () {
      return Promise.all([google.maps.importLibrary("maps"), google.maps.importLibrary("marker")]);
    });
  }
  /** Leaflet (free OpenStreetMap map), loaded on first use. Also used by the pin tool (pin/). */
  function loadLeaflet() {
    return new Promise(function (resolve, reject) {
      if (window.L && L.map) return resolve();
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = LEAFLET + "leaflet.min.css";
      document.head.appendChild(css);
      var s = document.createElement("script");
      s.src = LEAFLET + "leaflet.min.js";
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Could not load the map. Check your connection."));
      };
      document.head.appendChild(s);
    });
  }
  function loadLib() {
    if (!libReady) {
      libReady = GOOGLE_MAP ? loadGoogle() : loadLeaflet();
      libReady.catch(function () {
        libReady = null;
      });
    }
    return libReady;
  }

  /* ---------- map adapters: same small interface for Google and Leaflet ---------- */
  /** Minimal marker: a plain color dot for places, a teardrop with a white center for the dorm. */
  function pinHTML(color, big) {
    return '<span style="background:' + color + '">' + (big ? "<i></i>" : "") + "</span>";
  }
  function googleAdapter(canvas, pos) {
    var opts = {
      center: pos,
      zoom: 16,
      gestureHandling: "greedy",
      clickableIcons: false,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: true,
    };
    if (cfg.mapId) opts.mapId = cfg.mapId;
    var map = new google.maps.Map(canvas, opts),
      info = new google.maps.InfoWindow();
    function adv(m) {
      return "content" in m;
    } // AdvancedMarkerElement vs classic Marker
    return {
      marker: function (p, title, color, big) {
        var lib = google.maps.marker;
        if (lib && lib.AdvancedMarkerElement && cfg.mapId) {
          var content = document.createElement("div");
          content.className = "nb-pin nb-pin-g" + (big ? " nb-pin-big" : "");
          content.innerHTML = pinHTML(color, big);
          return new lib.AdvancedMarkerElement({
            map: map,
            position: p,
            title: title,
            content: content,
            gmpClickable: true,
            zIndex: big ? 1000 : 0,
          });
        }
        return new google.maps.Marker({
          map: map,
          position: p,
          title: title,
          zIndex: big ? 1000 : 0,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
            scale: big ? 9 : 5,
          },
        });
      },
      show: function (m, on) {
        if (adv(m)) m.map = on ? map : null;
        else m.setMap(on ? map : null);
      },
      move: function (m, p, title) {
        if (adv(m)) {
          m.position = p;
          m.title = title;
        } else {
          m.setPosition(p);
          m.setTitle(title);
        }
      },
      onClick: function (m, fn) {
        m.addListener("click", fn);
      },
      popup: function (m, node) {
        info.setContent(node);
        info.open({ map: map, anchor: m });
      },
      closePopup: function () {
        info.close();
      },
      setView: function (p, z) {
        map.setCenter(p);
        map.setZoom(z);
      },
      pan: function (p) {
        map.panTo(p);
      },
      fit: function (pts, done) {
        var b = new google.maps.LatLngBounds();
        pts.forEach(function (p) {
          b.extend(p);
        });
        map.fitBounds(b, 40);
        google.maps.event.addListenerOnce(map, "idle", function () {
          if (map.getZoom() > 17) map.setZoom(17);
          if (done) done();
        });
      },
      // route line: white casing + blue line; dashed = straight-line placeholder
      line: function (pts, dashed) {
        var casing = new google.maps.Polyline({
          map: map,
          path: pts,
          strokeColor: "#fff",
          strokeOpacity: dashed ? 0 : 0.95,
          strokeWeight: 8,
          zIndex: 1,
        });
        var main = new google.maps.Polyline(
          dashed
            ? {
                map: map,
                path: pts,
                strokeOpacity: 0,
                zIndex: 2,
                icons: [
                  {
                    icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: "#0a47a9", scale: 3 },
                    offset: "0",
                    repeat: "11px",
                  },
                ],
              }
            : {
                map: map,
                path: pts,
                strokeColor: "#0a47a9",
                strokeOpacity: 0.95,
                strokeWeight: 4.5,
                zIndex: 2,
              },
        );
        return [casing, main];
      },
      unline: function (l) {
        l.forEach(function (x) {
          x.setMap(null);
        });
      },
      credit: function () {},
      refresh: function () {},
    };
  }
  function leafletAdapter(canvas, pos) {
    var map = L.map(canvas, { scrollWheelZoom: true, wheelPxPerZoomLevel: 90, zoomControl: true }).setView(
      [pos.lat, pos.lng],
      17,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
    }).addTo(map);
    var ll = function (p) {
        return [p.lat, p.lng];
      },
      credited = false;
    return {
      marker: function (p, title, color, big) {
        var s = big ? 26 : 14; // dorm: teardrop whose tip is the exact spot; places: small dots centered on the spot
        var icon = L.divIcon({
          className: "nb-pin" + (big ? " nb-pin-big" : ""),
          html: pinHTML(color, big),
          iconSize: [s, s],
          iconAnchor: big ? [s / 2, Math.round(s * 1.2)] : [s / 2, s / 2],
          popupAnchor: [0, big ? -Math.round(s * 1.2) : -s / 2],
        });
        return L.marker(ll(p), {
          icon: icon,
          title: title,
          alt: title,
          keyboard: true,
          riseOnHover: true,
          zIndexOffset: big ? 1000 : 0,
        }).addTo(map);
      },
      show: function (m, on) {
        if (on) m.addTo(map);
        else m.remove();
      },
      move: function (m, p, title) {
        m.setLatLng(ll(p));
        m.options.title = title;
        var i = m.getElement && m.getElement();
        if (i) {
          i.title = title;
          i.setAttribute("alt", title);
        }
      },
      onClick: function (m, fn) {
        m.on("click", fn);
      },
      popup: function (m, node) {
        L.popup({
          maxWidth: 260,
          offset: m.options.icon.options.popupAnchor,
          autoPanPaddingTopLeft: L.point(52, 14),
          autoPanPaddingBottomRight: L.point(14, 24),
        })
          .setLatLng(m.getLatLng())
          .setContent(node)
          .openOn(map);
      },
      closePopup: function () {
        map.closePopup();
      },
      setView: function (p, z) {
        map.setView(ll(p), z);
      },
      pan: function (p) {
        map.panTo(ll(p));
      },
      fit: function (pts, done) {
        map.fitBounds(L.latLngBounds(pts.map(ll)), { padding: [30, 30], maxZoom: 17, animate: false });
        if (done) done();
      },
      // route line: white casing + blue line; dashed = straight-line placeholder
      line: function (pts, dashed) {
        var p = pts.map(ll);
        return L.layerGroup([
          L.polyline(p, {
            color: "#fff",
            weight: 8,
            opacity: dashed ? 0 : 0.95,
            lineCap: "round",
            lineJoin: "round",
            interactive: false,
          }),
          L.polyline(p, {
            color: "#0a47a9",
            weight: dashed ? 3 : 4.5,
            opacity: 0.95,
            dashArray: dashed ? "2 9" : null,
            lineCap: "round",
            lineJoin: "round",
            interactive: false,
          }),
        ]).addTo(map);
      },
      unline: function (l) {
        l.remove();
      },
      credit: function (html) {
        if (!credited) {
          map.attributionControl.addAttribution(html);
          credited = true;
        }
      },
      refresh: function () {
        map.invalidateSize();
      },
    };
  }

  function renderMap(h) {
    return loadLib()
      .then(function () {
        if (!live(h) || authFailed) return;
        var box = el("nbMap"),
          pos = { lat: h.lat, lng: h.lng };
        box.innerHTML = "";
        // One map per page, moved into each dialog (each new Google map is a billed load; Leaflet just saves work).
        if (!shared) {
          var canvas = document.createElement("div");
          canvas.className = "nb-canvas";
          box.appendChild(canvas);
          var m = (GOOGLE_MAP ? googleAdapter : leafletAdapter)(canvas, pos);
          shared = { el: canvas, map: m, dorm: m.marker(pos, h.n, "#0a47a9", true) };
          m.onClick(shared.dorm, function () {
            dormInfo(view.h);
          });
        } else {
          box.appendChild(shared.el);
          shared.map.closePopup();
          shared.map.move(shared.dorm, pos, h.n);
          shared.map.refresh();
          shared.map.setView(pos, 17);
        }
        shared.map.refresh();
        view.map = shared.map;
        view.markers = {};
        if (!view.route) dormInfo(h);
        if (view.data) drawMarkers();
      })
      .catch(function (e) {
        if (live(h))
          el("nbMap").innerHTML = msg(
            "compass",
            "Map unavailable",
            e.message + " Nearby places are still listed below.",
          );
      });
  }
  function dormInfo(h) {
    shared.map.popup(
      shared.dorm,
      infoNode(
        h.n,
        [h.addr || h.a, "Tap a store, here or in the list below, to see the walking route."],
        [C.directionsUrl(h), "Get directions ↗"],
      ),
    );
  }
  function clearMarkers(v) {
    if (!v || !v.markers || !v.map) return;
    Object.keys(v.markers).forEach(function (k) {
      v.markers[k].forEach(function (m) {
        v.map.show(m, false);
      });
    });
    v.markers = {};
  }
  function drawMarkers() {
    if (!view.map || !view.data) return;
    clearMarkers(view);
    var pts = [{ lat: view.h.lat, lng: view.h.lng }];
    C.CATEGORIES.forEach(function (c) {
      var cat = view.data.categories[c.key];
      if (!cat) return;
      view.markers[c.key] = (cat.places || []).map(function (p, i) {
        var m = view.map.marker(
          { lat: p.lat, lng: p.lng },
          C.placeName(p) + " (" + c.one + ", " + C.formatDistance(p.distance) + ")",
          c.color,
        );
        view.map.onClick(m, function () {
          openPlace(c, p, m);
        });
        if (hidden[c.key]) view.map.show(m, false);
        else if (i < 3) pts.push({ lat: p.lat, lng: p.lng }); // frame the dorm and the 3 closest of each shown category
        return m;
      });
    });
    // reopen the dorm bubble once the view settles, so it pans into view instead of being cut off
    var h = view.h;
    if (view.route) return; // a store was clicked while loading: keep its route framed, no dorm bubble on top
    if (pts.length > 1)
      view.map.fit(pts, function () {
        if (view.h === h && !view.route) dormInfo(h);
      });
    else dormInfo(h);
  }
  /* ---------- walking route from the dorm to a clicked place ---------- */
  // free OSM routers, no key: FOSSGIS walking profile first; OSRM demo (road path, walking time estimated) as backup
  var ROUTERS = [
    { base: "https://routing.openstreetmap.de/routed-foot/route/v1/foot/", walking: true },
    { base: "https://router.project-osrm.org/route/v1/driving/", walking: false },
  ];
  var ROUTE_CREDIT =
    'Routes &copy; <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">FOSSGIS</a> / OSRM';
  var routeMemo = {},
    routeToken = 0;
  function getRoute(a, b) {
    var key =
      "dn:route:" +
      a.lat.toFixed(5) +
      "," +
      a.lng.toFixed(5) +
      ">" +
      b.lat.toFixed(5) +
      "," +
      b.lng.toFixed(5);
    if (routeMemo[key]) return routeMemo[key];
    var hit = null;
    try {
      hit = JSON.parse(sessionStorage.getItem(key));
    } catch (e) {}
    if (hit) return (routeMemo[key] = Promise.resolve(hit));
    var i = 0;
    function attempt() {
      var R = ROUTERS[i];
      return fetchTimeout(C.routeUrl(R.base, a, b), {}, 12000)
        .then(function (r) {
          if (!r.ok) throw new Error("router " + r.status);
          return r.json();
        })
        .then(function (j) {
          var rt = C.parseRoute(j, R.walking);
          if (!rt) throw new Error("no route");
          return rt;
        })
        .catch(function (e) {
          if (++i < ROUTERS.length) return attempt();
          throw e;
        });
    }
    routeMemo[key] = attempt().then(
      function (rt) {
        try {
          sessionStorage.setItem(key, JSON.stringify(rt));
        } catch (e) {}
        return rt;
      },
      function (e) {
        delete routeMemo[key];
        throw e;
      },
    );
    return routeMemo[key];
  }
  function clearRoute() {
    if (view && view.route && view.map) view.map.unline(view.route);
    if (view) {
      view.route = null;
      view.routeCat = null;
    }
    var bar = el("nbRoute");
    if (bar) bar.hidden = true;
  }
  /** The bar under the map: where to, how far, and the place's details. */
  function routeBar(c, p, status, busy) {
    var bar = el("nbRoute");
    if (!bar) return;
    var facts = [
      p.address ? esc(p.address) : "",
      p.rating ? '<span class="star">★ ' + p.rating.toFixed(1) + "</span> (" + p.ratingCount + ")" : "",
      p.open === true
        ? '<span class="nb-open">Open now</span>'
        : p.open === false
          ? '<span class="nb-closed">Closed now</span>'
          : "",
      p.mapsUri
        ? '<a href="' + esc(p.mapsUri) + '" target="_blank" rel="noopener">' + linkLabel() + "</a>"
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    bar.innerHTML =
      '<span class="nb-route-i" aria-hidden="true">' +
      ico("route") +
      "</span>" +
      '<div class="nb-route-t"><div>Route to <b>' +
      esc(C.placeName(p)) +
      "</b> <small>" +
      esc(c.one) +
      "</small></div>" +
      '<div class="nb-route-s' +
      (busy ? " busy" : "") +
      '">' +
      status +
      "</div>" +
      (facts ? '<div class="meta">' + facts + "</div>" : "") +
      "</div>" +
      '<button type="button" class="nb-route-x" aria-label="Clear route">' +
      ico("x") +
      "</button>";
    bar.hidden = false;
    bar.querySelector(".nb-route-x").onclick = function () {
      routeToken++;
      clearRoute();
    };
  }
  function routeTo(c, p, m) {
    var my = ++routeToken,
      h = view.h,
      from = { lat: h.lat, lng: h.lng },
      to = { lat: p.lat, lng: p.lng };
    var straight = "straight line " + C.formatDistance(p.distance);
    clearRoute();
    view.map.closePopup();
    view.route = view.map.line([from, to], true);
    view.routeCat = c.key; // dashed straight line right away
    view.map.fit([from, to]);
    routeBar(c, p, "Finding the walking route… · " + straight, true);
    getRoute(from, to).then(
      function (rt) {
        if (my !== routeToken || view.h !== h || !view.map) return; // another place was clicked meanwhile
        clearRoute();
        view.route = view.map.line(rt.coords, false);
        view.routeCat = c.key;
        view.map.credit(ROUTE_CREDIT);
        p.travel = { mode: "WALK", seconds: rt.seconds, meters: rt.meters }; // the list shows it too from now on
        var row = el("nbList").querySelector(
          '.nb-name[data-cat="' +
            c.key +
            '"][data-i="' +
            view.data.categories[c.key].places.indexOf(p) +
            '"]',
        );
        if (row) row.parentNode.querySelector(".nb-d").textContent = C.routeLabel(rt);
        view.map.fit(rt.coords.concat([from, to]));
        routeBar(
          c,
          p,
          "<b>" +
            C.formatDuration(rt.seconds) +
            " walk</b> · " +
            C.formatDistance(rt.meters) +
            " along streets" +
            (rt.estimated ? " (time estimated)" : "") +
            " · " +
            straight,
        );
      },
      function () {
        if (my !== routeToken || view.h !== h) return;
        routeBar(c, p, "Walking route unavailable right now. The dashed line shows the " + straight + ".");
      },
    );
  }

  function linkLabel() {
    return view.data && view.data.source === "osm" ? "View on OpenStreetMap ↗" : "View on Google Maps ↗";
  }
  function openPlace(c, p, m) {
    if (view.map) routeTo(c, p, m);
  }

  /* ---------- nearby data: Google worker or OpenStreetMap ---------- */
  function radiiAll() {
    var r = {};
    C.CATEGORIES.forEach(function (c) {
      r[c.key] = radii[c.key] || c.radius;
    });
    return r;
  }
  function cached(key, ttl, store) {
    try {
      var s = JSON.parse(store.getItem(key));
      if (s && s.t > Date.now() - ttl) return s.d;
    } catch (e) {}
    return null;
  }
  function stash(key, d, store) {
    try {
      store.setItem(key, JSON.stringify({ t: Date.now(), d: d }));
    } catch (e) {}
  }
  function fetchTimeout(url, opts, ms) {
    var ctl = window.AbortController ? new AbortController() : null,
      t = setTimeout(function () {
        if (ctl) ctl.abort();
      }, ms);
    if (ctl) opts.signal = ctl.signal;
    return fetch(url, opts).then(
      function (r) {
        clearTimeout(t);
        return r;
      },
      function (e) {
        clearTimeout(t);
        throw e;
      },
    );
  }
  function googleNearby(h) {
    var q = "lat=" + h.lat + "&lng=" + h.lng;
    Object.keys(radii).forEach(function (k) {
      q += "&r_" + k + "=" + radii[k];
    });
    return fetchTimeout(cfg.nearbyApiUrl + "/nearby?" + q, {}, 20000).then(
      function (r) {
        return r
          .json()
          .catch(function () {
            return {};
          })
          .then(function (j) {
            if (!r.ok)
              throw new Error(j.message || "Nearby places are unavailable right now (" + r.status + ").");
            j.source = "google";
            return j;
          });
      },
      function () {
        throw new Error("Couldn't reach the nearby-places service. Check your connection.");
      },
    );
  }
  function osmNearby(h) {
    var origin = { lat: h.lat, lng: h.lng },
      r = radiiAll(),
      body = "data=" + encodeURIComponent(C.osmQuery(origin, r)),
      i = 0;
    function attempt() {
      return fetchTimeout(
        OVERPASS[i],
        { method: "POST", body: body, headers: { "Content-Type": "application/x-www-form-urlencoded" } },
        30000,
      )
        .then(function (res) {
          if (!res.ok) throw new Error("busy");
          return res.json();
        })
        .catch(function () {
          if (++i < OVERPASS.length) return attempt();
          throw new Error(
            "OpenStreetMap's place service is busy right now. Close and reopen this listing in a minute to try again.",
          );
        });
    }
    return attempt().then(function (j) {
      return C.osmResult(j.elements, origin, r);
    });
  }
  /** Saved OpenStreetMap results for this exact pin (shared/js/data/nearby-snapshot.js, from `npm run nearby`), cut to the chosen radii. */
  function fromSnapshot(h) {
    var s = window.NEARBY_SNAPSHOT && NEARBY_SNAPSHOT[h.id],
      r = radiiAll(),
      out = { source: "osm", travelMode: null, snapshot: s && s.fetchedAt, categories: {} };
    if (!s || Math.abs(s.lat - h.lat) > 1e-6 || Math.abs(s.lng - h.lng) > 1e-6) return null; // pin moved since the snapshot
    for (var i = 0; i < C.CATEGORIES.length; i++) {
      var k = C.CATEGORIES[i].key,
        c = s.categories[k];
      if (!c || r[k] > c.radius) return null; // needs a wider search than saved
      out.categories[k] = {
        radius: r[k],
        places: c.places.filter(function (p) {
          return p.distance <= r[k];
        }),
      };
    }
    return out;
  }
  function getNearby(h) {
    var snap = GOOGLE_NEARBY ? null : fromSnapshot(h);
    if (snap) return Promise.resolve(snap);
    var src = GOOGLE_NEARBY ? "google" : "osm";
    var key =
      "dn:nearby:" + src + ":" + h.lat.toFixed(5) + "," + h.lng.toFixed(5) + ":" + JSON.stringify(radii);
    if (memo[key]) return memo[key];
    // Google results: 1 h per browser session (the worker caches 24 h). OSM: 24 h in this browser (open data).
    var store = src === "google" ? window.sessionStorage : window.localStorage,
      ttl = src === "google" ? 3600e3 : 86400e3;
    var hit = null;
    try {
      hit = cached(key, ttl, store);
    } catch (e) {}
    if (hit) return (memo[key] = Promise.resolve(hit));
    memo[key] = (src === "google" ? googleNearby(h) : osmNearby(h)).then(
      function (d) {
        try {
          stash(key, d, store);
        } catch (e) {}
        return d;
      },
      function (e) {
        delete memo[key];
        throw e;
      },
    );
    return memo[key];
  }

  /* ---------- list, legend, summary ---------- */
  function placeHTML(c, p, i) {
    var meta = [
      p.address ? esc(p.address) : "",
      p.rating ? '<span class="star">★ ' + p.rating.toFixed(1) + "</span> (" + p.ratingCount + ")" : "",
      p.open === true
        ? '<span class="nb-open">Open now</span>'
        : p.open === false
          ? '<span class="nb-closed">Closed now</span>'
          : "",
    ]
      .filter(Boolean)
      .join(" · ");
    var link = p.mapsUri
      ? '<a href="' +
        esc(p.mapsUri) +
        '" target="_blank" rel="noopener">' +
        (view.data.source === "osm" ? "OpenStreetMap" : "Google Maps") +
        " ↗</a>"
      : "";
    return (
      "<li" +
      (i >= C.TOP_N ? " hidden" : "") +
      '><div class="nb-row"><button type="button" class="nb-name" data-cat="' +
      c.key +
      '" data-i="' +
      i +
      '" title="Show on map">' +
      esc(C.placeName(p)) +
      "</button>" +
      '<span class="nb-d">' +
      esc(C.travelLabel(p)) +
      "</span></div>" +
      '<div class="meta">' +
      [meta, link].filter(Boolean).join(" · ") +
      "</div></li>"
    );
  }
  function catHTML(c, cat) {
    var sel = c.radiusOptions
      ? ' <select class="nb-r" data-cat="' +
        c.key +
        '" aria-label="Search radius for ' +
        esc(c.label) +
        '">' +
        c.radiusOptions
          .map(function (r) {
            return (
              '<option value="' +
              r +
              '"' +
              (r === cat.radius ? " selected" : "") +
              ">within " +
              C.formatDistance(r) +
              "</option>"
            );
          })
          .join("") +
        "</select>"
      : " <small>within " + C.formatDistance(cat.radius) + "</small>";
    var body = cat.error
      ? '<p class="meta">Couldn\'t load these: ' + esc(cat.error) + "</p>"
      : !cat.places.length
        ? '<p class="meta">' + esc(C.emptyMessage(c.key, cat.radius)) + "</p>"
        : "<ol>" +
          cat.places
            .map(function (p, i) {
              return placeHTML(c, p, i);
            })
            .join("") +
          "</ol>" +
          (cat.places.length > C.TOP_N
            ? '<button type="button" class="linkbtn" data-more="' +
              c.key +
              '" aria-expanded="false">Show ' +
              (cat.places.length - C.TOP_N) +
              " more</button>"
            : "");
    return (
      '<div class="nb-cat" data-cat="' +
      c.key +
      '"' +
      (hidden[c.key] ? " hidden" : "") +
      '><h4><span class="nb-dot" style="background:' +
      c.color +
      '" aria-hidden="true"></span>' +
      esc(c.label) +
      sel +
      "</h4>" +
      body +
      "</div>"
    );
  }
  function cats() {
    return C.CATEGORIES.filter(function (c) {
      return view.data && view.data.categories[c.key];
    });
  }
  function drawLegend() {
    el("nbLegend").innerHTML =
      '<span class="nb-legend-h">Show on map:</span>' +
      cats()
        .map(function (c) {
          var cat = view.data.categories[c.key];
          return (
            '<button type="button" class="nb-chip" data-cat="' +
            c.key +
            '" aria-pressed="' +
            !hidden[c.key] +
            '"><span class="nb-dot" style="background:' +
            c.color +
            '" aria-hidden="true"></span>' +
            esc(c.label) +
            " <small>" +
            (cat.error ? "!" : cat.places.length + (cat.places.length >= 20 ? "+" : "")) +
            "</small></button>"
          );
        })
        .join("");
  }
  function drawSummary() {
    var lines = cats()
      .filter(function (c) {
        return !hidden[c.key] && !view.data.categories[c.key].error;
      })
      .map(function (c) {
        var k = view.data.categories[c.key];
        return "<li>" + esc(C.summarize(c.key, k.places, k.radius)) + "</li>";
      });
    el("nbSum").innerHTML =
      (lines.length
        ? "<b>Summary</b><ul>" + lines.join("") + "</ul>"
        : '<p class="meta">Pick a category above to see what\'s nearby.</p>') +
      '<p class="meta nb-note">' +
      (view.data.travelMode
        ? "Times are " +
          (view.data.travelMode === "DRIVE" ? "driving" : "walking") +
          " routes from Google (top " +
          C.TOP_N +
          " per category); others show straight-line distance."
        : "Distances are straight-line from the dorm, not walking routes.") +
      "</p>";
  }
  function drawList() {
    var list = el("nbList");
    list.innerHTML = cats()
      .map(function (c) {
        return catHTML(c, view.data.categories[c.key]);
      })
      .join("");
    list.setAttribute("aria-busy", "false");
  }
  function renderNearby(h) {
    return getNearby(h).then(
      function (d) {
        if (!live(h)) return;
        view.data = d;
        el("nbAttr").innerHTML = attribution(d.source);
        drawLegend();
        drawSummary();
        drawList();
        if (view.map) drawMarkers();
      },
      function (e) {
        if (!live(h)) return;
        el("nbLegend").innerHTML = "";
        el("nbSum").innerHTML = "";
        el("nbList").innerHTML = msg("alert", "Nearby places unavailable", e.message);
        el("nbList").setAttribute("aria-busy", "false");
      },
    );
  }

  function wire(h) {
    var root = el("nbMap").closest(".nb");
    root.onclick = function (e) {
      var chip = e.target.closest(".nb-chip");
      if (chip) {
        var k = chip.dataset.cat;
        hidden[k] = hidden[k] ? 0 : 1;
        keep("dn:nbHidden", hidden);
        if (hidden[k] && view.routeCat === k) {
          clearRoute();
          view.map.closePopup();
        }
        chip.setAttribute("aria-pressed", !hidden[k]);
        var sec = root.querySelector('.nb-cat[data-cat="' + k + '"]');
        if (sec) sec.hidden = !!hidden[k];
        if (view.map)
          (view.markers[k] || []).forEach(function (m) {
            view.map.show(m, !hidden[k]);
          });
        drawSummary();
        return;
      }
      var more = e.target.closest("[data-more]");
      if (more) {
        var open = more.getAttribute("aria-expanded") !== "true";
        root.querySelectorAll('.nb-cat[data-cat="' + more.dataset.more + '"] li').forEach(function (li, i) {
          if (i >= C.TOP_N) li.hidden = !open;
        });
        more.setAttribute("aria-expanded", open);
        more.textContent = open
          ? "Show less"
          : "Show " + (view.data.categories[more.dataset.more].places.length - C.TOP_N) + " more";
        return;
      }
      var name = e.target.closest(".nb-name");
      if (name) {
        var c = C.BY_KEY[name.dataset.cat],
          p = view.data.categories[c.key].places[+name.dataset.i];
        var m = view.markers[c.key] && view.markers[c.key][+name.dataset.i];
        if (m && view.map) {
          openPlace(c, p, m);
          el("nbMap").scrollIntoView({ block: "nearest", behavior: "smooth" });
        } else if (p.mapsUri) openLink(p.mapsUri);
      }
    };
    root.onchange = function (e) {
      var s = e.target.closest(".nb-r");
      if (!s) return;
      radii[s.dataset.cat] = +s.value;
      el("nbList").setAttribute("aria-busy", "true");
      el("nbSum").innerHTML = skelLines(2);
      renderNearby(h);
    };
  }

  /** Fill in the section rendered by section(h). Safe to call every time the dialog opens. */
  function mount(h) {
    clearRoute();
    routeToken++;
    clearMarkers(view); // the shared map still holds the last listing's pins
    view = { h: h, map: null, markers: {}, data: null };
    if (h.lat == null || h.lng == null || !el("nbMap")) return;
    wire(h);
    renderMap(h);
    renderNearby(h);
  }

  return {
    section: section,
    mount: mount,
    nearby: getNearby,
    loadLeaflet: loadLeaflet,
    applyPins: applyPins,
    PIN_DRAFTS: PIN_DRAFTS,
  };
})();
