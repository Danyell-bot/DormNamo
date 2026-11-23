/* cache.mjs - TTL cache for nearby results, on Cloudflare KV or in memory.
   Entries are stored as {v, exp}; an expired entry reads as a miss even if
   the backing store has not evicted it yet. */

export const DEFAULT_TTL_S = 24 * 60 * 60; // 24 hours
export const MAX_TTL_S = 30 * 24 * 60 * 60; // never keep Places data longer than 30 days
export const MIN_TTL_S = 60;
export const ERROR_TTL_S = 5 * 60; // partial failures: retry soon, don't hammer

/** Clamp a TTL (seconds) from config to the allowed range. */
export function clampTtl(ttl) {
  const n = Math.floor(Number(ttl));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL_S;
  return Math.min(MAX_TTL_S, Math.max(MIN_TTL_S, n));
}

/** Stable cache key: coordinates rounded to ~11 m so tiny float noise reuses the same entry. */
export function cacheKey({ lat, lng, radii, routes, categories }) {
  const r = Object.keys(radii || {})
    .sort()
    .map((k) => k + ":" + radii[k])
    .join(",");
  return [
    "nearby",
    "v1",
    Number(lat).toFixed(4),
    Number(lng).toFixed(4),
    (categories || []).join("+"),
    r,
    routes || "off",
  ].join("|");
}

/** In-memory store with the same get/put shape as a KV namespace (for tests and local dev). */
export function memoryStore() {
  const m = new Map();
  return {
    async get(k) {
      return m.has(k) ? m.get(k) : null;
    },
    async put(k, v) {
      m.set(k, v);
    },
    async delete(k) {
      m.delete(k);
    },
    size: () => m.size,
  };
}

/**
 * makeCache(store, now) -> {get(key), set(key, value, ttlSeconds)}
 * `store` is a KV namespace or memoryStore(); `now` returns ms (injectable for tests).
 */
export function makeCache(store, now = () => Date.now()) {
  return {
    async get(key) {
      let raw;
      try {
        raw = await store.get(key);
      } catch {
        return null;
      }
      if (!raw) return null;
      let e;
      try {
        e = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        return null;
      }
      if (!e || typeof e.exp !== "number" || e.exp <= now()) return null;
      return { value: e.v, expiresAt: e.exp, storedAt: e.at };
    },
    async set(key, value, ttlSeconds) {
      const ttl = clampTtl(ttlSeconds);
      const t = now();
      const body = JSON.stringify({ v: value, exp: t + ttl * 1000, at: t });
      // KV needs expirationTtl >= 60; memoryStore ignores options.
      try {
        await store.put(key, body, { expirationTtl: Math.max(60, ttl) });
      } catch {
        /* cache is best-effort */
      }
    },
  };
}
