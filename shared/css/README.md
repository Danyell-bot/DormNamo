# shared/css/ — styles every page uses

Each page links these stylesheets **in a fixed order** (see the `<link>` tags at the
top of each HTML page). When two rules are equally specific, the one loaded later wins,
so keep the order when adding a file. Current order:
`base → home → chat → ui → discover → maps → details → polish → hero → brand → onboarding`,
then the page's own sheet from its folder (`home/`, `my-listings/`, `people/`, `messages/`, `about/`) (`owners` + `finder` on Rooms, `owners` + `listings` on My listings,
`people`, `messages` or `about`), and `mobile` last on every page.

| Folder | What it's for |
|---|---|
| `base/` | The design system: colors, type, buttons, the logo and site-wide polish |
| `components/` | Pieces that appear on several pages (chat, dialog, map, login, menus, the Rooms banner and search, owner forms) |

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
| `home.css` | Site basics loaded on every page: navbar, search pill, motion. |
| `hero.css` | The Rooms banner, its intro animation, and the styled search dropdowns (used by other pages too). |
| `discover.css` | Discover card styles (loaded on every page). |
| `owners.css` | "List your place": pricing cards and the add-property form (Rooms and My listings). |

