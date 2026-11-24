# css/ — the website's styles

Each page links these stylesheets **in a fixed order** (see the `<link>` tags at the
top of each HTML page). When two rules are equally specific, the one loaded later wins,
so keep the order when adding a file. Current order:
`base → home → chat → ui → discover → maps → details → polish → hero → brand → onboarding`,
then `owners → finder` on the Rooms page and `owners → listings` on My listings.

| Folder | What it's for |
|---|---|
| `base/` | The design system: colors, type, buttons, the logo and site-wide polish |
| `components/` | Pieces that appear on several pages (chat, dialog, map, login, menus) |
| `pages/` | Styles for one page or one section of a page |

## base/ — design system
| File | Purpose |
|---|---|
| `base.css` | The foundation: colors, fonts, buttons, chips, layout, page sections. |
| `polish.css` | The blue / yellow / white palette and small visual fixes. |
| `mobile.css` | Phone and touch-screen fixes, loaded last on every page (form fields, dialogs, Compare, save bar, Namo preview). |
| `brand.css` | Logo (and its opening door), icons, Ask Namo button and chat polish, the Discover card look, hearts and stars. |

## components/ — shared pieces
| File | Purpose |
|---|---|
| `chat.css` | The Namo chat window and its messages. |
| `details.css` | The listing details dialog, its photo gallery, and comments. |
| `maps.css` | The map and the "Nearby places" list in the dialog, and the pin tool. |
| `onboarding.css` | The log-in screen and the preference questionnaire. |
| `ui.css` | Full-screen overlays, the account menu, toasts, and the reduced-motion rules. |

## pages/ — one page or section
| File | Purpose |
|---|---|
| `home.css` | Rooms page basics: navbar, search pill, motion, and the dark Discover page. |
| `hero.css` | The top banner on Rooms: graph-paper grid, intro animation, search dropdowns. |
| `finder.css` | "Find your room": filter panel, results bar, room cards, and the Compare dialog. |
| `owners.css` | "List your place": pricing cards and the add-property form. |
| `discover.css` | The swipe cards on Discover. |
| `listings.css` | The "My listings" owner page. |
| `people.css` | The Landowners page: your account and the landowner / student directory. |
| `messages.css` | The Messages page: conversation list, chat bubbles, offers, tenant groups. |
| `about.css` | The About us page: mission, values, how matching works, the team. |
