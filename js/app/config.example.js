/* Example of js/app/config.js. Don't put a real key here.
   Create the real file with `npm run config` (it reads .env), or copy this file
   to js/app/config.js and fill it in. js/app/config.js is gitignored. */
var DN_CONFIG = {
  mapsBrowserKey: "", // GOOGLE_MAPS_BROWSER_KEY: Maps JavaScript API only, HTTP-referrer restricted
  mapId: "DEMO_MAP_ID", // GOOGLE_MAPS_MAP_ID: needed for the colored category markers
  nearbyApiUrl: "", // NEARBY_API_URL: your deployed worker, e.g. https://dormnamo-nearby.you.workers.dev
  namoAI: true, // NAMO_AI=off turns off Gemini wording for Namo (worker POST /namo); students are asked first anyway
};
