/* Example of shared/js/app/config.js. Don't put a real key here.
   Create the real file with `npm run config` (it reads .env), or copy this file
   to shared/js/app/config.js and fill it in. shared/js/app/config.js is gitignored. */
var DN_CONFIG = {
  mapsBrowserKey: "", // GOOGLE_MAPS_BROWSER_KEY: Maps JavaScript API only, HTTP-referrer restricted
  mapId: "DEMO_MAP_ID", // GOOGLE_MAPS_MAP_ID: needed for the colored category markers
  nearbyApiUrl: "", // NEARBY_API_URL: your deployed worker, e.g. https://dormnamo-nearby.you.workers.dev
  nearbyGoogle: false, // NEARBY_GOOGLE=on: nearby places from Google via the worker (else OpenStreetMap)
  namoAI: true, // NAMO_AI=off turns off Gemini wording for Namo (worker POST /namo); students are asked first anyway
  supabaseUrl: "", // SUPABASE_URL: https://<project-ref>.supabase.co (no /rest/v1)
  supabaseKey: "", // SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY): browser-safe; never the service_role key
};
