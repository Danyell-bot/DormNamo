/* ==========================================================
   websearch.js - Namo searches the web for places DormNamo doesn't list yet
   Used when a student has no good match (chat.js offers it), or asks
   ("search online for dorms in Tibanga").

   Source: OpenStreetMap's free search (Nominatim, no key), limited to a box
   around the student's school (or a named area) and their walking range.
   For each place found it extracts what the map knows (type, street,
   distance, phone, website) and gives links: the place's own website if
   mapped, its OpenStreetMap page, and a Google Maps search for it. It also
   always gives "search further" links built from the student's area, type
   and budget: search engines and maps (Google Maps, Google, a Google search
   of social media only, OpenStreetMap) and every big social network
   (Facebook posts, groups and Marketplace, Instagram, TikTok, X, Threads,
   YouTube, Reddit), where most boarding houses here advertise.

   Free-only on purpose: Gemini's Google Search tool needs a paid (billing)
   project, so it isn't used. Nominatim's rules: at most 1 request a second,
   cache results, credit "© OpenStreetMap contributors". So the search terms
   run one after another, results are kept for an hour in this tab, and
   only the area, room type and budget words are sent. Nothing about the account.
   Rent, rules and availability are not on the map: places found are always
   labeled as unverified, and Namo never invents those details.
   ========================================================== */
var WebSearch = (function () {
  var NOMINATIM = "https://nominatim.openstreetmap.org/search",
    GAP_MS = 1100, // Nominatim: max 1 request a second
    TTL_MS = 60 * 60 * 1000,
    TERMS = {
      "Boarding house": ["boarding house", "pension house", "bedspace", "dormitory"],
      Dormitory: ["dormitory", "residence hall", "hostel", "boarding house"],
      Apartment: ["apartment", "apartelle", "condominium", "boarding house"],
      any: ["boarding house", "dormitory", "apartment", "pension house", "hostel"],
    },
    HOUSING =
      /board|dorm|pension|bed ?space|lodg|apart|residen|hostel|condo|\binn\b|transient|\brooms?\b|\bpad\b/i,
    KINDS = {
      dormitory: "Dormitory",
      apartments: "Apartment building",
      apartment: "Apartment",
      hostel: "Hostel",
      guest_house: "Guest house",
      motel: "Motel / pension",
      hotel: "Hotel / pension",
    };

  /* ---------- helpers (pure, tested in tests/websearch.test.mjs) ---------- */
  function rad(x) {
    return (x * Math.PI) / 180;
  }
  function km(a, b) {
    var dLat = rad(b.lat - a.lat),
      dLng = rad(b.lng - a.lng),
      s =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }
  /** Nominatim viewbox "left,top,right,bottom" r km around c. */
  function box(c, r) {
    var dy = r / 111.32,
      dx = r / (111.32 * Math.cos(rad(c.lat)));
    return [c.lng - dx, c.lat + dy, c.lng + dx, c.lat - dy]
      .map(function (v) {
        return v.toFixed(5);
      })
      .join(",");
  }
  /** The search area: the school (or a named area) and the walking range, 1 to 5 km. */
  function region(P, area) {
    var at = (window.SCHOOL_AT || {})[P.school] || { lat: 8.241, lng: 124.244, city: "Iligan City" };
    return {
      school: P.school,
      city: at.city || "",
      center: { lat: at.lat, lng: at.lng },
      r: Math.max(1, Math.min(5, Math.round(((+P.maxKm || 1.5) + 0.5) * 10) / 10)),
      area: area || "",
      label: area ? area + ", " + (at.city || "") : P.school,
    };
  }
  function safeUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u) ? "https://" + u : "";
    return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : "";
  }
  function fbUrl(v) {
    v = String(v || "").trim();
    if (!v) return "";
    return safeUrl(/facebook\.com/i.test(v) ? v : "https://www.facebook.com/" + v.replace(/^@/, ""));
  }
  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
  /** Is this map result a place to live (not a school, store or a big hotel)? */
  function isHousing(p) {
    var t = p.type,
      c = p.category,
      name = p.name || "";
    if (!name) return false;
    if (c === "building" && (t === "dormitory" || t === "apartments")) return true;
    if (c === "tourism" && (t === "hostel" || t === "apartment" || t === "guest_house")) return true;
    if (c === "amenity" && t === "university") return false;
    return HOUSING.test(name); // e.g. "Celadon Pension House" (tourism/hotel)
  }
  function kindOf(p) {
    var n = p.name || "";
    if (/pension/i.test(n)) return "Pension house";
    if (/boarding|bed ?space/i.test(n)) return "Boarding house";
    if (/dorm|residence hall/i.test(n)) return "Dormitory";
    if (/apart|condo/i.test(n)) return "Apartment";
    return KINDS[p.type] || "Place to stay";
  }
  /** Turn Nominatim answers into DormNamo-style entries: housing only, in range, not already listed, nearest first. */
  function parse(lists, reg, houses) {
    var seen = {},
      known = (houses || []).map(function (h) {
        return norm(h.n);
      }),
      out = [];
    lists.forEach(function (list) {
      (list || []).forEach(function (p) {
        if (!isHousing(p)) return;
        var key = norm(p.name);
        if (!key || seen[key]) return;
        if (
          known.some(function (k) {
            return k === key || (k.length > 6 && (k.indexOf(key) >= 0 || key.indexOf(k) >= 0));
          })
        )
          return; // already on DormNamo
        var at = { lat: +p.lat, lng: +p.lon },
          d = km(reg.center, at);
        if (!(d <= reg.r + 0.05)) return;
        seen[key] = 1;
        var a = p.address || {},
          x = p.extratags || {},
          street = [a.house_number, a.road].filter(Boolean).join(" "),
          where = [street, a.quarter || a.suburb || a.village || a.neighbourhood].filter(Boolean).join(", ");
        out.push({
          name: p.name,
          kind: kindOf(p),
          where: where,
          km: Math.round(d * 10) / 10,
          walk: Math.max(1, Math.round(d * 12.5)), // about 4.8 km/h, straight line
          phone: x.phone || x["contact:phone"] || "",
          site: safeUrl(x.website || x["contact:website"]) || fbUrl(x["contact:facebook"] || x.facebook),
          osm:
            /^(node|way|relation)$/.test(p.osm_type) && /^\d+$/.test(String(p.osm_id))
              ? "https://www.openstreetmap.org/" + p.osm_type + "/" + p.osm_id
              : "",
          gmaps:
            "https://www.google.com/maps/search/?api=1&query=" +
            encodeURIComponent(p.name + (reg.city ? ", " + reg.city : "")),
        });
      });
    });
    return out.sort(function (a, b) {
      return a.km - b.km;
    });
  }
  /**
   * "Search further" links: always available, even with no internet search at all.
   * Two groups: search engines and maps ("web"), and every big social network ("social"), where most
   * boarding houses in the Philippines actually advertise (Facebook pages, groups and Marketplace posts).
   * These are links to each site's own search: DormNamo doesn't read those sites (no free, allowed way
   * to), the student opens them. Some ask the student to log in first.
   */
  function links(reg, P, type) {
    var what = (type && type !== "any" ? type : "boarding house").toLowerCase(),
      place = reg.area || reg.school,
      city = reg.city || "",
      near = place + (city ? " " + city : ""),
      budget = P && P.bhMax && P.bhMax !== 6000 ? " " + P.bhMax + " pesos" : "",
      q = what + " " + near, // "boarding house MSU-IIT Iligan City"
      cityQ = what + " " + (city.replace(/ City$/, "") || place), // "boarding house Iligan"
      tag = (what + (city.replace(/ City$/, "") || "")).replace(/[^a-z0-9]/gi, "").toLowerCase(),
      e = encodeURIComponent;
    function L(group, label, note, url) {
      return { group: group, label: label, note: note, url: url };
    }
    return [
      L(
        "web",
        "Google Maps",
        what + "s near " + place,
        "https://www.google.com/maps/search/?api=1&query=" + e(what + " near " + near),
      ),
      L(
        "web",
        "Google",
        what + " for rent" + (budget ? ", around" + budget : ""),
        "https://www.google.com/search?q=" + e(what + " for rent near " + near + budget),
      ),
      L(
        "web",
        "Google (social media only)",
        "posts on Facebook, Instagram, TikTok, X and Reddit at once",
        "https://www.google.com/search?q=" +
          e(
            cityQ +
              " (site:facebook.com OR site:instagram.com OR site:tiktok.com OR site:x.com OR site:reddit.com)",
          ),
      ),
      L(
        "web",
        "OpenStreetMap",
        "everything mapped in " + (city || place),
        "https://www.openstreetmap.org/search?query=" + e(what + " " + (city || place)),
      ),
      L(
        "social",
        "Facebook posts",
        "pages and posts about " + what + "s near " + place,
        "https://www.facebook.com/search/posts/?q=" + e(q),
      ),
      L(
        "social",
        "Facebook groups",
        "rental and boarding house groups in " + (city || place),
        "https://www.facebook.com/search/groups/?q=" + e(cityQ),
      ),
      L(
        "social",
        "Facebook Marketplace",
        "rooms for rent listed for sale",
        "https://www.facebook.com/marketplace/search/?query=" + e(cityQ),
      ),
      L(
        "social",
        "Instagram",
        "posts and accounts",
        "https://www.instagram.com/explore/search/keyword/?q=" + e(cityQ),
      ),
      L("social", "TikTok", "room tours and listings", "https://www.tiktok.com/search?q=" + e(cityQ)),
      L("social", "X (Twitter)", "latest posts", "https://x.com/search?q=" + e(cityQ) + "&f=live"),
      L("social", "Threads", "latest posts", "https://www.threads.com/search?q=" + e(cityQ)),
      L(
        "social",
        "YouTube",
        "video tours",
        "https://www.youtube.com/results?search_query=" + e(cityQ + " room tour"),
      ),
      L("social", "Reddit", "advice from students", "https://www.reddit.com/search/?q=" + e(cityQ)),
      L("social", "Instagram hashtag", "#" + tag, "https://www.instagram.com/explore/tags/" + e(tag) + "/"),
    ];
  }

  /* ---------- the search (browser) ---------- */
  var mem = {};
  function cached(k) {
    if (mem[k] && Date.now() - mem[k].at < TTL_MS) return mem[k];
    try {
      var c = JSON.parse(sessionStorage.getItem("dn:web:" + k));
      if (c && Date.now() - c.at < TTL_MS) return (mem[k] = c);
    } catch (e) {}
    return null;
  }
  function keep(k, v) {
    mem[k] = v;
    try {
      sessionStorage.setItem("dn:web:" + k, JSON.stringify(v));
    } catch (e) {}
  }
  function wait(ms) {
    return new Promise(function (ok) {
      setTimeout(ok, ms);
    });
  }
  function nominatim(q, vbox, fetchFn) {
    var u =
      NOMINATIM +
      "?format=jsonv2&addressdetails=1&extratags=1&limit=25&bounded=1&accept-language=en&viewbox=" +
      vbox +
      "&q=" +
      encodeURIComponent(q);
    return fetchFn(u, { headers: { Accept: "application/json" } })
      .then(function (r) {
        return r.ok ? r.json() : [];
      })
      .catch(function () {
        return [];
      });
  }
  /**
   * run(P, {area, type, fetch}) -> Promise<{region, places, links, ok}>
   * ok = false when the map search couldn't be reached (the links still work).
   */
  function run(P, opts) {
    opts = opts || {};
    var type = opts.type || "any",
      fetchFn = opts.fetch || (typeof fetch === "function" ? fetch.bind(window) : null),
      reg = region(P, opts.area),
      key = [reg.school, reg.area, reg.r, type].join("|"),
      hit = cached(key);
    if (hit) return Promise.resolve(hit);
    if (!fetchFn) return Promise.resolve({ region: reg, places: [], links: links(reg, P, type), ok: false });
    var gap = opts.gap == null ? GAP_MS : opts.gap;
    // 1) a named area ("in Tibanga"): find it first, near the school
    var start = reg.area
      ? nominatim(reg.area + (reg.city ? ", " + reg.city : ""), box(reg.center, 10), fetchFn).then(
          function (a) {
            if (a && a[0]) reg.center = { lat: +a[0].lat, lng: +a[0].lon };
            else reg.missed = true; // area not found: search around the school instead
            return wait(gap);
          },
        )
      : Promise.resolve();
    // 2) the housing words, one request a second
    var lists = [],
      reached = false,
      terms = TERMS[type] || TERMS.any;
    return start
      .then(function () {
        var vbox = box(reg.center, reg.r);
        return terms.reduce(function (p, term, i) {
          return p.then(function () {
            return (i ? wait(gap) : Promise.resolve()).then(function () {
              return nominatim(term, vbox, fetchFn).then(function (l) {
                if (Array.isArray(l)) reached = true;
                lists.push(l);
              });
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        var res = {
          region: reg,
          places: parse(lists, reg, window.HOUSES || []),
          links: links(reg, P, type),
          ok: reached,
          at: Date.now(),
        };
        if (reached) keep(key, res);
        return res;
      });
  }

  return { run: run, parse: parse, links: links, region: region, box: box, km: km, isHousing: isHousing };
})();
