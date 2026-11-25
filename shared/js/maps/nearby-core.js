/* ==========================================================
   nearby-core.js - shared "Nearby Places" logic, no DOM, no network
   Used by the browser (global `NearbyCore`), the Cloudflare Worker
   (worker/nearby.mjs) and the tests. Edit CATEGORIES to change what
   is searched, the radius of each category, colors and labels.
   ========================================================== */
(function (root) {
  // types = Places API (New) "Table A" types sent as includedTypes.
  // extraTypes are tried too, but dropped automatically if Google rejects them.
  var CATEGORIES = [
    {
      key: "convenience",
      label: "Convenience stores",
      one: "Convenience store",
      icon: "🏪",
      color: "#0a8f5a",
      radius: 1000,
      types: ["convenience_store"],
    },
    {
      key: "grocery",
      label: "Supermarkets & markets",
      one: "Supermarket / market",
      icon: "🛒",
      color: "#d9480f",
      radius: 1000,
      types: ["supermarket", "grocery_store"],
      extraTypes: ["market", "farmers_market"],
    },
    {
      key: "mall",
      label: "Shopping malls",
      one: "Mall",
      icon: "🏬",
      color: "#7048e8",
      radius: 3000,
      radiusOptions: [1000, 3000],
      types: ["shopping_mall"],
    },
    {
      key: "retail",
      label: "Stores & retail",
      one: "Store",
      icon: "🛍️",
      color: "#c2255c",
      radius: 1000,
      types: [
        "department_store",
        "clothing_store",
        "home_goods_store",
        "electronics_store",
        "hardware_store",
      ],
      extraTypes: ["store"],
    },
    {
      key: "food",
      label: "Food & dining",
      one: "Restaurant / café",
      icon: "🍽️",
      color: "#e8590c",
      radius: 1000,
      optional: true,
      types: ["restaurant", "cafe"],
    },
    {
      key: "transit",
      label: "Transit",
      one: "Transit stop",
      icon: "🚌",
      color: "#1971c2",
      radius: 1000,
      optional: true,
      types: ["transit_station", "bus_station"],
      extraTypes: ["bus_stop"],
    },
    {
      key: "health",
      label: "Hospitals & pharmacies",
      one: "Hospital / pharmacy",
      icon: "🏥",
      color: "#e03131",
      radius: 1000,
      optional: true,
      types: ["hospital", "pharmacy"],
      extraTypes: ["drugstore"],
    },
  ];
  var BY_KEY = {};
  CATEGORIES.forEach(function (c) {
    BY_KEY[c.key] = c;
  });

  // Free fallback: OpenStreetMap tags per category, [tag, "value|value"]. First matching category wins.
  // Sari-sari stores are usually mapped as shop=convenience or shop=general.
  var OSM = {
    convenience: [["shop", "convenience|general|kiosk"]],
    grocery: [
      ["shop", "supermarket|greengrocer|butcher|wholesale"],
      ["amenity", "marketplace"],
    ],
    mall: [["shop", "mall"]],
    retail: [
      [
        "shop",
        "department_store|clothes|hardware|doityourself|electronics|mobile_phone|computer|variety_store|books|stationery|houseware|shoes|furniture|bag",
      ],
    ],
    food: [["amenity", "restaurant|cafe|fast_food|food_court"]],
    transit: [
      ["highway", "bus_stop"],
      ["amenity", "bus_station|taxi"],
      ["public_transport", "station"],
    ],
    health: [
      ["amenity", "hospital|pharmacy|clinic|doctors"],
      ["shop", "chemist"],
      ["healthcare", "pharmacy|hospital|clinic"],
    ],
  };
  CATEGORIES.forEach(function (c) {
    c.osm = OSM[c.key] || [];
  });
  var ALLOWED_RADII = [500, 1000, 2000, 3000, 5000];
  var TOP_N = 5; // shown per category before "Show more"
  var NEAR_M = 500; // "N within 500 m" in the summary

  /** Category for a Google place type ("cafe" -> "food"), or null. */
  function categoryForType(type) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      var c = CATEGORIES[i];
      if (c.types.indexOf(type) >= 0 || (c.extraTypes || []).indexOf(type) >= 0) return c.key;
    }
    return null;
  }

  /** Clamp a requested radius to an allowed value (or the category default). */
  function radiusFor(key, requested) {
    var c = BY_KEY[key];
    if (!c) return null;
    var r = +requested;
    return ALLOWED_RADII.indexOf(r) >= 0 ? r : c.radius;
  }

  /** Straight-line (great-circle) distance in meters. */
  function haversine(a, b) {
    var R = 6371008.8,
      rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad,
      dLng = (b.lng - a.lng) * rad;
    var s =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /** 37 -> "40 m", 950 -> "950 m", 1000 -> "1 km", 1234 -> "1.2 km", 12500 -> "13 km". */
  function formatDistance(m) {
    if (m == null || !isFinite(m) || m < 0) return "";
    if (m < 995) return Math.max(10, Math.round(m / 10) * 10) + " m";
    var km = m / 1000;
    return String(km < 9.95 ? Math.round(km * 10) / 10 : Math.round(km)) + " km"; // 1 km, 1.2 km, 13 km
  }

  /** 45 -> "1 min", 600 -> "10 min", 4500 -> "1 h 15 min". Seconds in. */
  function formatDuration(s) {
    if (s == null || !isFinite(s) || s < 0) return "";
    var min = Math.max(1, Math.round(s / 60));
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60),
      r = min % 60;
    return h + " h" + (r ? " " + r + " min" : "");
  }

  /** "~6 min walk" / "4 min drive"; label says which source it came from. */
  function travelLabel(place) {
    if (place.travel && place.travel.seconds != null) {
      var mode = place.travel.mode === "DRIVE" ? "drive" : "walk";
      return (
        formatDuration(place.travel.seconds) +
        " " +
        mode +
        (place.travel.meters != null
          ? " · " + formatDistance(place.travel.meters) + (mode === "walk" ? " along streets" : " by road")
          : "")
      );
    }
    return formatDistance(place.distance) + " straight line";
  }

  /**
   * Is a place open at `date`? Uses regularOpeningHours.periods from Places API (New)
   * and the place's utcOffsetMinutes, so cached hours still give a live answer.
   * Returns true / false, or null when hours are unknown.
   */
  function isOpenAt(periods, utcOffsetMinutes, date) {
    if (!periods || !periods.length || utcOffsetMinutes == null) return null;
    var local = new Date(date.getTime() + utcOffsetMinutes * 60000);
    var WEEK = 7 * 1440,
      now = local.getUTCDay() * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes();
    function at(p) {
      return p.day * 1440 + (p.hour || 0) * 60 + (p.minute || 0);
    }
    for (var i = 0; i < periods.length; i++) {
      var p = periods[i];
      if (!p.open) continue;
      if (!p.close) return true; // open 24/7
      var o = at(p.open),
        c = at(p.close);
      if (c <= o) c += WEEK; // wraps past Saturday night
      if ((now >= o && now < c) || (now + WEEK >= o && now + WEEK < c)) return true;
    }
    return false;
  }

  /** Turn one Places API (New) result into the small record we keep. */
  function normalizePlace(p, origin) {
    if (!p || !p.location) return null;
    var loc = { lat: p.location.latitude, lng: p.location.longitude };
    return {
      id: p.id,
      name: (p.displayName && p.displayName.text) || "Unnamed place",
      address: p.shortFormattedAddress || p.formattedAddress || "",
      lat: loc.lat,
      lng: loc.lng,
      rating: p.rating == null ? null : p.rating,
      ratingCount: p.userRatingCount || 0,
      type: p.primaryType || (p.types && p.types[0]) || null,
      mapsUri: p.googleMapsUri || null,
      hours: (p.regularOpeningHours && p.regularOpeningHours.periods) || null,
      utcOffset: p.utcOffsetMinutes == null ? null : p.utcOffsetMinutes,
      status: p.businessStatus || null,
      distance: Math.round(haversine(origin, loc)),
    };
  }

  /** Drop closed-for-good places and duplicates, sort closest first. */
  function cleanPlaces(list) {
    var seen = {};
    return list
      .filter(function (p) {
        if (!p || p.status === "CLOSED_PERMANENTLY" || seen[p.id]) return false;
        seen[p.id] = 1;
        return true;
      })
      .sort(function (a, b) {
        return a.distance - b.distance;
      });
  }

  /** "Convenience store: 3 within 500 m" / "Mall: nearest is 1.2 km away" / "Mall: none within 3 km". */
  function summarize(cat, places, radius) {
    var c = BY_KEY[cat] || { one: cat };
    if (!places || !places.length) return c.one + ": none within " + formatDistance(radius || c.radius);
    var near = places.filter(function (p) {
      return p.distance <= NEAR_M;
    }).length;
    if (near)
      return (
        c.one +
        ": " +
        near +
        (places.length >= 20 && near === places.length ? "+" : "") +
        " within " +
        NEAR_M +
        " m"
      );
    return c.one + ": nearest is " + formatDistance(places[0].distance) + " away";
  }

  /** Friendly empty message: "No supermarkets or markets within 1 km." */
  function emptyMessage(cat, radius) {
    var c = BY_KEY[cat] || { label: cat };
    return (
      "No " +
      c.label.toLowerCase().replace(/ & /g, " or ") +
      " within " +
      formatDistance(radius || c.radius) +
      "."
    );
  }

  /* ---------- OpenStreetMap (Overpass API) fallback ---------- */

  /** Category for a set of OSM tags ({shop: "convenience"} -> "convenience"), or null. */
  function osmCategory(tags) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      var sels = CATEGORIES[i].osm;
      for (var j = 0; j < sels.length; j++) {
        var v = tags && tags[sels[j][0]];
        if (v && ("|" + sels[j][1] + "|").indexOf("|" + v + "|") >= 0) return CATEGORIES[i].key;
      }
    }
    return null;
  }

  /** One Overpass QL query for every category around the dorm, each with its own radius. */
  function osmQuery(origin, radii) {
    var parts = [];
    CATEGORIES.forEach(function (c) {
      var r = (radii && radii[c.key]) || c.radius;
      c.osm.forEach(function (s) {
        parts.push(
          "nwr(around:" + r + "," + origin.lat + "," + origin.lng + ')["' + s[0] + '"~"^(' + s[1] + ')$"];',
        );
      });
    });
    return "[out:json][timeout:25];(" + parts.join("") + ");out center tags;";
  }

  // what an unnamed OSM place is, in words ("marketplace" -> "market")
  var OSM_WORDS = {
    general: "general store",
    kiosk: "kiosk",
    variety_store: "variety store",
    marketplace: "market",
    greengrocer: "fruit and vegetable stand",
    fast_food: "fast food place",
    food_court: "food court",
    bus_stop: "bus stop",
    bus_station: "bus terminal",
    chemist: "pharmacy",
    doctors: "clinic",
    department_store: "department store",
    mobile_phone: "phone shop",
    doityourself: "hardware store",
    clothes: "clothing store",
    station: "station",
    convenience: "convenience store",
    hardware: "hardware store",
    electronics: "electronics store",
    computer: "computer store",
    furniture: "furniture store",
    books: "bookstore",
    stationery: "school supplies store",
    houseware: "houseware store",
    shoes: "shoe store",
    bag: "bag store",
    wholesale: "wholesale store",
    cafe: "café",
    taxi: "taxi stand",
    healthcare: "health center",
  };
  /** Display name: the real name, or "Unnamed <what it is>". Works on saved snapshots too. */
  function placeName(p) {
    if (p.name && !/^Unnamed /.test(p.name)) return p.name;
    var t = p.type ? OSM_WORDS[p.type] || p.type.replace(/_/g, " ") : null;
    return t ? "Unnamed " + t : p.name || "Unnamed place";
  }

  /** Turn one Overpass element into the same record shape as normalizePlace(). */
  function normalizeOsm(el, origin, cat) {
    var lat = el.lat != null ? el.lat : el.center && el.center.lat,
      lng = el.lon != null ? el.lon : el.center && el.center.lon;
    if (lat == null || lng == null) return null;
    var t = el.tags || {},
      c = BY_KEY[cat] || { one: "place" };
    var street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    return {
      id: el.type + "/" + el.id,
      name: t.name || t["name:en"] || t.brand || "Unnamed " + c.one.toLowerCase(),
      address: [street, t["addr:city"]].filter(Boolean).join(", "),
      lat: lat,
      lng: lng,
      rating: null,
      ratingCount: 0,
      type: t.shop || t.amenity || t.healthcare || t.highway || t.public_transport || null,
      mapsUri: "https://www.openstreetmap.org/" + el.type + "/" + el.id,
      open: t.opening_hours === "24/7" ? true : null,
      distance: Math.round(haversine(origin, { lat: lat, lng: lng })),
    };
  }

  /** Overpass elements -> {source, travelMode, categories:{key:{radius, places}}} like the worker returns. */
  function osmResult(elements, origin, radii) {
    var cats = {};
    CATEGORIES.forEach(function (c) {
      cats[c.key] = { radius: (radii && radii[c.key]) || c.radius, places: [] };
    });
    (elements || []).forEach(function (el) {
      var k = osmCategory(el.tags);
      if (!k) return;
      var p = normalizeOsm(el, origin, k);
      if (p && p.distance <= cats[k].radius) cats[k].places.push(p);
    });
    Object.keys(cats).forEach(function (k) {
      cats[k].places = cleanPlaces(cats[k].places).slice(0, 20);
    });
    return { source: "osm", travelMode: null, categories: cats };
  }

  /* ---------- reading a location someone pastes (the pin tool (pin/)) ---------- */
  // Open Location Code ("plus code") alphabet; the format is an open standard (Apache-2.0)
  var OLC = "23456789CFGHJMPQRVWX";

  /** First `n` digits of the full plus code for a point (used to complete short codes). */
  function olcPrefix(lat, lng, n) {
    var la = Math.min(179.999999, lat + 90),
      lo = (lng + 180) % 360,
      out = "",
      pv = 20;
    for (var i = 0; i < n / 2; i++) {
      var a = Math.floor(la / pv),
        b = Math.floor(lo / pv);
      out += OLC[a] + OLC[b];
      la -= a * pv;
      lo -= b * pv;
      pv /= 20;
    }
    return out;
  }
  /** Centre of a full plus code ("6QW666RW+F4M"), or null. */
  function olcDecode(code) {
    var c = code.toUpperCase().replace("+", "").replace(/0+$/, "");
    if (!c.length || (c.length % 2 && c.length < 11)) return null;
    var lat = 0,
      lng = 0,
      pv = 20,
      i;
    for (i = 0; i < Math.min(c.length, 10); i += 2) {
      var a = OLC.indexOf(c[i]),
        b = OLC.indexOf(c[i + 1]);
      if (a < 0 || b < 0) return null;
      lat += a * pv;
      lng += b * pv;
      pv /= 20;
    }
    var hLat = pv * 20,
      hLng = pv * 20; // size of the last full pair
    for (i = 10; i < c.length; i++) {
      // grid refinement digits (4 x 5 grid)
      var g = OLC.indexOf(c[i]);
      if (g < 0) return null;
      hLat /= 5;
      hLng /= 4;
      lat += Math.floor(g / 4) * hLat;
      lng += (g % 4) * hLng;
    }
    return { lat: lat - 90 + hLat / 2, lng: lng - 180 + hLng / 2 };
  }
  /** Full or short plus code -> point. Short codes ("66RW+F4M") are completed near `ref`. */
  function plusCode(code, ref) {
    var sep = code.indexOf("+");
    if (sep < 0 || sep > 8 || sep % 2) return null;
    if (sep === 8) return olcDecode(code);
    if (!ref) return null;
    var pad = 8 - sep,
      res = Math.pow(20, 2 - pad / 2),
      half = res / 2;
    var p = olcDecode(olcPrefix(ref.lat, ref.lng, pad) + code);
    if (!p) return null;
    if (ref.lat + half < p.lat && p.lat - res >= -90) p.lat -= res;
    else if (ref.lat - half > p.lat && p.lat + res <= 90) p.lat += res;
    if (ref.lng + half < p.lng) p.lng -= res;
    else if (ref.lng - half > p.lng) p.lng += res;
    return p;
  }
  /**
   * Read a pasted location: "8.2412, 124.2453" (also 8.2412° N, 124.2453° E), a plus code
   * ("66RW+F4M Iligan" or "6QW666RW+F4M"), or a map link with coordinates in it.
   * Returns {lat, lng, from} rounded to 6 decimals, or null.
   */
  function parseLocation(text, ref) {
    var s = String(text || "").trim(),
      m,
      p = null,
      from = "";
    if (!s) return null;
    if ((m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/))) {
      p = { lat: +m[1], lng: +m[2] };
      from = "map link";
    } else if ((m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/))) {
      p = { lat: +m[1], lng: +m[2] };
      from = "map link";
    } else if (
      (m = s.match(
        /[?&#](?:q|query|ll|destination|center|mlat)=(-?\d+\.\d+)(?:,|%2C|&mlon=)\s*(-?\d+\.\d+)/i,
      ))
    ) {
      p = { lat: +m[1], lng: +m[2] };
      from = "map link";
    } else if ((m = s.match(/map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/))) {
      p = { lat: +m[1], lng: +m[2] };
      from = "map link";
    } else if (
      (m = s.match(
        /^\(?\s*(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])?\s*\)?$/i,
      ))
    ) {
      p = { lat: +m[1] * (/s/i.test(m[2] || "") ? -1 : 1), lng: +m[3] * (/w/i.test(m[4] || "") ? -1 : 1) };
      from = "coordinates";
    } else if (
      (m = s
        .toUpperCase()
        .match(/(?:^|\s)([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,4})(?=\s|,|$)/))
    ) {
      p = plusCode(m[1], ref);
      from = "plus code";
    }
    if (!p || !isFinite(p.lat) || !isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180)
      return null;
    return { lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6, from: from };
  }

  /* ---------- walking routes (OSRM-compatible routers) ---------- */
  var WALK_MPS = 1.33; // ~4.8 km/h, used when a router only gives a road path (car profile)
  /** OSRM route URL; coordinates go lng,lat. */
  function routeUrl(base, a, b) {
    return base + a.lng + "," + a.lat + ";" + b.lng + "," + b.lat + "?overview=full&geometries=geojson";
  }
  /**
   * OSRM response -> {coords:[{lat,lng}], meters, seconds, estimated} or null.
   * walking = false: the router's time is for driving, so walking time is estimated from the distance.
   */
  function parseRoute(j, walking) {
    var r = j && j.code === "Ok" && j.routes && j.routes[0];
    if (!r || !r.geometry || !r.geometry.coordinates || r.geometry.coordinates.length < 2) return null;
    return {
      coords: r.geometry.coordinates.map(function (c) {
        return { lat: c[1], lng: c[0] };
      }),
      meters: Math.round(r.distance),
      seconds: Math.round(walking ? r.duration : r.distance / WALK_MPS),
      estimated: !walking,
    };
  }
  /** "7 min walk · 527 m along streets" */
  function routeLabel(rt) {
    return formatDuration(rt.seconds) + " walk · " + formatDistance(rt.meters) + " along streets";
  }

  /** Google Maps directions URL with the dorm as destination (Maps URLs, no key needed). */
  function directionsUrl(h) {
    var u = "https://www.google.com/maps/dir/?api=1&destination=";
    if (h.lat != null && h.lng != null)
      return u + h.lat + "," + h.lng + (h.pid ? "&destination_place_id=" + encodeURIComponent(h.pid) : "");
    return u + encodeURIComponent(h.n + ", " + (h.addr || h.a || ""));
  }

  var api = {
    CATEGORIES: CATEGORIES,
    BY_KEY: BY_KEY,
    ALLOWED_RADII: ALLOWED_RADII,
    TOP_N: TOP_N,
    NEAR_M: NEAR_M,
    categoryForType: categoryForType,
    radiusFor: radiusFor,
    haversine: haversine,
    formatDistance: formatDistance,
    formatDuration: formatDuration,
    travelLabel: travelLabel,
    isOpenAt: isOpenAt,
    normalizePlace: normalizePlace,
    cleanPlaces: cleanPlaces,
    summarize: summarize,
    emptyMessage: emptyMessage,
    directionsUrl: directionsUrl,
    osmCategory: osmCategory,
    osmQuery: osmQuery,
    normalizeOsm: normalizeOsm,
    osmResult: osmResult,
    placeName: placeName,
    parseLocation: parseLocation,
    plusCode: plusCode,
    routeUrl: routeUrl,
    parseRoute: parseRoute,
    routeLabel: routeLabel,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NearbyCore = api;
})(typeof self !== "undefined" ? self : this);
