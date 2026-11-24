/* js-files.mjs - where each browser script lives, for Node tools and tests
   The site loads its scripts with <script> tags (see the HTML pages); tools and
   tests that run those same files in Node look them up here by short name, so a
   file only has to be moved in one place. Keep in step with the js/ folders. */
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const FOLDERS = {
  app: ["config", "config.example", "utils", "consent", "state", "nav", "fx", "select", "main"], // start-up, settings, shared helpers
  account: ["argon2id", "accounts", "auth", "onboarding", "inbox", "testbot"], // sign up / log in, profiles, preferences, messages
  data: ["data", "pins", "nearby-snapshot"], // the listings and saved map data
  listings: ["photos", "listings", "details", "comments", "hearts"], // everything shown about one listing
  matching: ["matching", "twotower", "insights"], // ranking rooms for each student
  maps: ["nearby-core", "maps", "pin-tool"], // map, nearby places, walking routes, pin tool
  namo: ["explain", "namo-guard", "namo-ai", "knowledge", "websearch", "talk", "chat"], // Namo the chatbot
  pages: ["browse", "owners", "hero-fx", "discover", "mylistings", "people", "messages"], // code used by one page only
};

const WHERE = {};
for (const [folder, names] of Object.entries(FOLDERS)) for (const n of names) WHERE[n] = folder;

/** "data" -> "js/data/data.js" (relative to the project root) */
export function jsFile(name) {
  if (!WHERE[name]) throw new Error("Unknown script: " + name + " (add it to tools/js-files.mjs)");
  return "js/" + WHERE[name] + "/" + name + ".js";
}
/** Absolute path, for fs.readFileSync / writeFileSync. */
export function jsPath(name) {
  return path.join(ROOT, jsFile(name));
}
