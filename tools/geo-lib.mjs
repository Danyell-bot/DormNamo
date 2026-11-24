/* geo-lib.mjs - pure helpers for tools/geocode.mjs (tested in tests/geo-lib.test.mjs) */

const GEO_KEYS = ["lat", "lng", "pid", "geo", "geoAt"];

/** Find the HOUSES records in js/data/data.js. Each listing is one JSON object on one line. */
export function parseHouses(src) {
  const lines = src.split(/\r?\n/),
    out = [];
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(\{"id":.*\})\s*,?\s*$/);
    if (!m) return;
    try {
      out.push({ line: i, h: JSON.parse(m[1]) });
    } catch {
      /* not a listing line */
    }
  });
  return { lines, eol: src.includes("\r\n") ? "\r\n" : "\n", houses: out };
}

/** Rewrite one listing line with new geo fields, keeping the rest of the line exactly as it was. */
export function setGeoFields(line, fields) {
  let l = line;
  GEO_KEYS.forEach((k) => {
    l = l.replace(new RegExp(',\\s*"' + k + '":\\s*("(?:[^"\\\\]|\\\\.)*"|-?[\\d.eE+-]+|null)', "g"), "");
  });
  const add = GEO_KEYS.filter((k) => fields[k] != null)
    .map((k) => '"' + k + '": ' + JSON.stringify(fields[k]))
    .join(", ");
  return add ? l.replace(/\}(\s*,?\s*)$/, ", " + add + "}$1") : l;
}

/** Days between two YYYY-MM-DD dates. */
export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/**
 * Should this listing be (re)geocoded?
 * - no coordinates yet -> yes
 * - coordinates typed in by hand (geo: "manual") -> never
 * - coordinates from Google older than maxAgeDays -> yes (Google's terms only allow
 *   temporary caching of lat/lng, 30 days; see README)
 */
export function needsGeocode(h, today, maxAgeDays = 30, force = false) {
  if (h.geo === "manual") return false;
  if (force) return true;
  if (h.lat == null || h.lng == null) return true;
  if (!h.geoAt) return true;
  return daysBetween(h.geoAt, today) >= maxAgeDays;
}

const STOP = new Set([
  "boarding",
  "house",
  "dormitory",
  "dorm",
  "residence",
  "residences",
  "hall",
  "the",
  "and",
  "of",
  "bh",
]);
const words = (s) =>
  String(s)
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

/** Does Google's place name look like our listing name? (share most distinctive words) */
export function nameMatches(ours, theirs) {
  const a = words(ours),
    b = new Set(words(theirs));
  if (!a.length) return false;
  return a.filter((w) => b.has(w)).length / a.length >= 0.5;
}
