# js/ — the website's JavaScript

Plain browser scripts, no build step. Each HTML page loads them with `<script>` tags,
**in order**, and that order matters: a file can only use what was loaded before it.
Tools and tests find these files through [`tools/js-files.mjs`](../tools/js-files.mjs),
so if you move or add a file, update that map and the `<script>` tags in the pages.

| Folder | What it's for |
|---|---|
| [`app/`](#app--start-up-settings-shared-helpers) | Start-up, settings and small helpers every page uses |
| [`account/`](#account--log-in-and-the-questionnaire) | Sign up / log in and the preference questionnaire |
| [`data/`](#data--the-listings-and-saved-map-data) | The listings themselves and saved map data |
| [`listings/`](#listings--everything-shown-about-one-place) | Everything shown about one place: photos, details, comments, hearts |
| [`matching/`](#matching--ranking-rooms-for-each-student) | Ranking rooms for each student |
| [`maps/`](#maps--map-nearby-places-walking-routes) | The map, nearby stores and walking routes |
| [`namo/`](#namo--the-chatbot) | Namo, the room-helper chatbot |
| [`pages/`](#pages--code-for-one-page-only) | Code that only one page needs |

## app/ — start-up, settings, shared helpers
| File | Purpose |
|---|---|
| `config.js` | Site settings made by `npm run config` from `.env` (worker address, Maps key, AI on/off). Gitignored. |
| `config.example.js` | Template showing what `config.js` contains. |
| `utils.js` | Small helpers used everywhere: `$`, money, escaping, icons, the logo, star ratings, phone formatting. |
| `consent.js` | Asks first whether to remember preferences (cookies), and saves / reads the preferences cookie. |
| `state.js` | The logged-in student's saved data (preferences, likes, passes…) and default preferences. |
| `nav.js` | The top navigation bar and the account menu. |
| `fx.js` | Animations: smooth scrolling, the toast message, results rising in. |
| `select.js` | The styled dropdown menus that replace plain `<select>` boxes. |
| `main.js` | Start-up: log in → questionnaire → show the page. Loaded last. |

## account/ — log in and the questionnaire
| File | Purpose |
|---|---|
| `argon2id.js` | Secure password hashing (Argon2id), in plain JavaScript. |
| `accounts.js` | Accounts, sessions, profiles and roles (student, landowner or both), and per-student saved data, stored in this browser. |
| `auth.js` | The sign-up / log-in screen. |
| `onboarding.js` | The "what do you need in a room?" questionnaire. |
| `inbox.js` | Messages: one-to-one chats between students and landowners, offers, photos, emojis and tenant group chats. |
| `testbot.js` | A test landowner bot that answers by itself, for trying messages, photos, emojis and offers alone. |

## data/ — the listings and saved map data
| File | Purpose |
|---|---|
| `data.js` | All listings (real places near MSU-IIT). One listing per line: tools edit it line by line. |
| `pins.js` | Exact map pins for dorms, made with `pin.html`. |
| `nearby-snapshot.js` | Saved nearby stores per pinned dorm (`npm run nearby`), so the map loads instantly. |

## listings/ — everything shown about one place
| File | Purpose |
|---|---|
| `photos.js` | Listing photos and the dialog photo gallery (area photos when a dorm has none). |
| `listings.js` | Places owners add, saved in this browser and merged into the listings. |
| `details.js` | The listing details dialog (opens when you click a room). |
| `comments.js` | Student comments and tenant star ratings on each listing. |
| `hearts.js` | Hearts: saving a room (popularity, never the star rating). |

## matching/ — ranking rooms for each student
| File | Purpose |
|---|---|
| `matching.js` | Reads facts from each listing and scores it against the student's preferences. |
| `twotower.js` | A tiny learning model that adjusts the ranking from likes and passes. |
| `insights.js` | With consent, learns what a student likes from their activity on DormNamo. |

## maps/ — map, nearby places, walking routes
| File | Purpose |
|---|---|
| `nearby-core.js` | Shared nearby-places logic (categories, distances, routes). Also used by the worker and tests. |
| `maps.js` | The map in the listing dialog, nearby stores and walking routes. |
| `pin-tool.js` | The `pin.html` tool for placing each dorm's exact pin. |

## namo/ — the chatbot
| File | Purpose |
|---|---|
| `explain.js` | Writes Namo's explanations ("why is this best for me?") from the real match data. |
| `namo-guard.js` | Fact check for AI-worded replies: blocks any invented number, price, place or promise. Also used by the worker. |
| `namo-ai.js` | Optional Google Gemini wording (free tier, through the worker), only with the student's consent. |
| `knowledge.js` | Everything Namo knows: every listing detail, ratings, hearts, comments, the student's preferences, cookie and consent. Recognizes dorm names ("uy pad"), answers detail and cross-listing questions. |
| `websearch.js` | When there is no good match: searches OpenStreetMap for places DormNamo doesn't list yet, near the student's school or area, and gives the links. |
| `talk.js` | Small talk: greetings, thanks, feelings, "how does matching work?" and more. |
| `chat.js` | Namo itself: reads messages, changes preferences, answers, and the chat window. |

## pages/ — code for one page only
| File | Page | Purpose |
|---|---|---|
| `browse.js` | Rooms (`index.html`) | Search, filters, room cards, compare, the add-property form. |
| `owners.js` | Rooms | "List your place" plan prices and plan buttons. |
| `hero-fx.js` | Rooms | The top banner's intro animation, grid spotlight and counters. |
| `discover.js` | Discover (`discover.html`) | The swipe deck: like, pass, bookmark, undo. |
| `mylistings.js` | My listings (`mylistings.html`) | The owner's editor: photos, details, rules, save. |
| `people.js` | Landowners (`people.html`) | Your account (view and edit) and every account sorted into landowners and students. |
| `messages.js` | Messages (`messages.html`) | Chats with landowners and students, offers, and tenant group chats. |
