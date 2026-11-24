// js/namo/websearch.js: Namo's web search (OpenStreetMap Nominatim) for places DormNamo doesn't list.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { jsPath } from "../tools/js-files.mjs";

function load() {
  const ctx = {
    console,
    Math,
    JSON,
    Date,
    Promise,
    setTimeout,
    encodeURIComponent,
    sessionStorage: { getItem: () => null, setItem() {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["data", "websearch"])
    vm.runInContext(fs.readFileSync(jsPath(f), "utf8"), ctx, { filename: f });
  return { ctx, run: (c) => vm.runInContext(c, ctx) };
}
const P = { school: "MSU-IIT", maxKm: 1.5, bhMax: 6000 };
// shapes as Nominatim returns them (format=jsonv2, addressdetails, extratags)
const place = (name, category, type, lat, lon, extra = {}) => ({
  name,
  category,
  type,
  lat: String(lat),
  lon: String(lon),
  osm_type: "way",
  osm_id: 296139088,
  address: { road: "Andres Bonifacio Avenue", suburb: "Tibanga" },
  extratags: extra,
});

test("only places to live, in range, not already on DormNamo, nearest first", () => {
  const { ctx, run } = load();
  const reg = run('WebSearch.region({ school: "MSU-IIT", maxKm: 1.5 })');
  assert.equal(reg.r, 2); // walking range + 0.5 km
  const lists = [
    [
      place("Celadon Pension House", "tourism", "hotel", 8.2455, 124.2475, {
        website: "celadon.example.ph",
        phone: "+63 63 221 0000",
      }),
      place("Jollibee Tibanga", "amenity", "fast_food", 8.2412, 124.2441),
      place("Graduate School Dormitory", "building", "dormitory", 8.2418, 124.2436),
      place("Far Away Apartment", "building", "apartments", 8.3, 124.3), // ~9 km
      place("Uy Pad Residences", "building", "apartments", 8.24, 124.246), // already listed
    ],
    [place("Graduate School Dormitory", "building", "dormitory", 8.2418, 124.2436)], // duplicate from another term
  ];
  ctx.lists = lists;
  ctx.reg = reg;
  const out = run("WebSearch.parse(lists, reg, HOUSES)");
  assert.deepEqual([...out.map((p) => p.name)], ["Graduate School Dormitory", "Celadon Pension House"]);
  const c = out[1];
  assert.equal(c.kind, "Pension house");
  assert.equal(c.site, "https://celadon.example.ph");
  assert.equal(c.osm, "https://www.openstreetmap.org/way/296139088");
  assert.match(
    c.gmaps,
    /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Celadon%20Pension%20House%2C%20Iligan%20City$/,
  );
  assert.equal(c.where, "Andres Bonifacio Avenue, Tibanga");
  assert.ok(c.km > 0 && c.km < 1 && c.walk >= 1);
});

test("unsafe or odd links are dropped, never put into an href", () => {
  const { ctx, run } = load();
  ctx.reg = run('WebSearch.region({ school: "MSU-IIT", maxKm: 1.5 })');
  ctx.lists = [
    [
      place("A Boarding House", "building", "house", 8.2412, 124.2442, { website: "javascript:alert(1)" }),
      place("B Dormitory", "building", "dormitory", 8.2413, 124.2443, { "contact:facebook": "bdorm.iligan" }),
    ],
  ];
  const out = run("WebSearch.parse(lists, reg, [])");
  assert.equal(out.find((p) => p.name === "A Boarding House").site, "");
  assert.equal(out.find((p) => p.name === "B Dormitory").site, "https://www.facebook.com/bdorm.iligan");
});

test("search-further links use the area, type and budget, and work without any network", async () => {
  const { run } = load();
  const res = await run(
    'WebSearch.run({ school: "MSU-IIT", maxKm: 1, bhMax: 3000 }, { type: "Dormitory", fetch: null })',
  );
  assert.equal(res.ok, false);
  const urls = [...res.links.map((l) => l.url)];
  // search engines and maps, then every big social network
  const groups = [...res.links.map((l) => l.group + ":" + l.label)];
  assert.deepEqual(groups.slice(0, 4), [
    "web:Google Maps",
    "web:Google",
    "web:Google (social media only)",
    "web:OpenStreetMap",
  ]);
  for (const site of [
    "facebook.com/search/posts",
    "facebook.com/search/groups",
    "facebook.com/marketplace",
    "instagram.com",
    "tiktok.com",
    "x.com",
    "threads.com",
    "youtube.com",
    "reddit.com",
  ])
    assert.ok(
      res.links.some((l) => l.group === "social" && l.url.includes(site)),
      "social link for " + site,
    );
  assert.match(urls[2], /site%3Afacebook.com%20OR%20site%3Ainstagram.com/);
  assert.ok(urls.some((u) => u === "https://www.facebook.com/search/groups/?q=dormitory%20Iligan"));
  assert.match(
    urls[0],
    /google\.com\/maps\/search\/\?api=1&query=dormitory%20near%20MSU-IIT%20Iligan%20City/,
  );
  assert.match(
    urls[1],
    /google\.com\/search\?q=dormitory%20for%20rent%20near%20MSU-IIT%20Iligan%20City%203000%20pesos/,
  );
  urls.forEach((u) => assert.match(u, /^https:\/\//));
});

test("a named area is found first, then searched one request at a time inside a box", async () => {
  const { ctx, run } = load();
  const calls = [];
  ctx.fakeFetch = async (url) => {
    calls.push(url);
    const q = decodeURIComponent(/[?&]q=([^&]*)/.exec(url)[1]);
    const body = /^Tibanga/.test(q)
      ? [{ lat: "8.2440", lon: "124.2460", name: "Tibanga" }]
      : q === "dormitory"
        ? [place("Tibanga Ladies Dormitory", "building", "dormitory", 8.2445, 124.2465)]
        : [];
    return { ok: true, json: async () => body };
  };
  const res = await run(
    'WebSearch.run({ school: "MSU-IIT", maxKm: 1.5 }, { area: "Tibanga", type: "any", fetch: fakeFetch, gap: 0 })',
  );
  assert.equal(res.ok, true);
  assert.equal(res.region.center.lat, 8.244, "centered on the named area");
  assert.equal(res.places[0].name, "Tibanga Ladies Dormitory");
  assert.equal(calls.length, 1 + 5, "the area, then one request per search word");
  calls.slice(1).forEach((u) => {
    assert.match(u, /bounded=1/);
    assert.match(u, /viewbox=124\.2/);
  });
});

test("Iligan places: 44 barangays, the fixed region / province / city, full addresses", () => {
  const { ctx, run } = load();
  vm.runInContext(fs.readFileSync(jsPath("utils"), "utf8"), ctx, { filename: "utils" });
  assert.equal(run("BARANGAYS.length"), 44);
  assert.equal(run("new Set(BARANGAYS).size"), 44);
  assert.equal(
    run('PH_PLACE.city + " | " + PH_PLACE.province + " | " + PH_PLACE.region'),
    "Iligan City | Lanao del Norte | Region X (Northern Mindanao)",
  );
  assert.equal(run('barangayOf("brgy. tibanga")'), "Tibanga");
  assert.equal(run('barangayOf("Purok 11-A")'), "");
  assert.equal(
    run('fullAddress("Purok 4", "Pala-o")'),
    "Purok 4, Brgy. Pala-o, Iligan City, Lanao del Norte, Region X (Northern Mindanao), 9200",
  );
});

test("contact numbers always start with 09", () => {
  const { ctx, run } = load();
  vm.runInContext(fs.readFileSync(jsPath("utils"), "utf8"), ctx, { filename: "utils" });
  for (const [typed, shown] of [
    ["09171234567", "0917 123 4567"],
    ["+63 917 123 4567", "0917 123 4567"],
    ["639171234567", "0917 123 4567"],
    ["9171234567", "0917 123 4567"],
  ]) {
    assert.equal(run("fmtPhone(" + JSON.stringify(typed) + ")"), shown, typed);
    assert.equal(run("phoneOk(" + JSON.stringify(shown) + ")"), true);
  }
  for (const bad of ["0817 123 4567", "1234 567 8901", "0917 123", ""])
    assert.equal(run("phoneOk(" + JSON.stringify(bad) + ")"), false, bad);
});
