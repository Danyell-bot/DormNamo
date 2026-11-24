# DormNamo brand assets

Everything here comes from what the DormNamo website itself uses: the logo, the wordmark, the line icons,
the Namo assistant mark, the colours and the two typefaces. Use it for ads, motion graphics and slides.

SVG files are vectors (scale to any size, recolour freely). PNG files have transparent backgrounds unless
noted. The wordmark is converted to outlines, so the logo files do not need the font installed.

## Folders

| Folder | What is inside |
| --- | --- |
| `logo/svg`, `logo/png` | The door mark, logo lockups, app icon and favicon (PNG: mark 1024 px, horizontal logo 2400 px, stacked 1200 px) |
| `icons/svg` | 41 line icons in Ink Navy (24 × 24, 2 px stroke, round caps) |
| `icons/svg-white` | The same icons in white, for dark backgrounds |
| `icons/png` | The same icons as 512 px PNGs in Ink Navy |
| `icons/_overview.png` | Contact sheet with every icon's name and meaning |
| `characters` | Namo, the room assistant (gold tile and round versions) and the test bot avatar |
| `colors` | `palette.png` / `palette.svg` swatch sheet, `colors.json`, `colors.css`, `dormnamo.gpl` (GIMP, Inkscape and Krita palette) |
| `fonts` | Figtree and Bricolage Grotesque: static weights (`static/`) and variable fonts (`variable/`), their licences, and `_type-specimen.png` |

## Logo

The mark is an arched **double door**: DormNamo as the door to your home away from home.

| File | Use on |
| --- | --- |
| `dormnamo-logo-horizontal-blue` | White or light backgrounds (the main logo) |
| `dormnamo-logo-horizontal-navy` | Light backgrounds where blue would clash |
| `dormnamo-logo-horizontal-white` | Blue, navy or photo backgrounds |
| `dormnamo-logo-horizontal-white-gold` | Night Navy backgrounds ("Namo" in gold, as on the site's dark theme) |
| `dormnamo-logo-stacked-*` | Square or vertical layouts (end cards, social posts) |
| `dormnamo-mark-*` | The door mark alone (blue, navy, white, gold) |
| `dormnamo-app-icon` | White mark on a DormNamo Blue rounded tile |
| `favicon` | The browser-tab icon exactly as the site ships it |

- Keep clear space around the logo of at least the width of one door leaf.
- Do not stretch, rotate, outline or recolour the logo outside the palette below.
- The door knobs are cut-outs (transparent), so the background shows through them.

### Animating the door (2D)

`logo/svg/dormnamo-mark-animation-layers.svg` has three named layers, ready to import into Illustrator,
After Effects (via Illustrator), Figma, Rive, Lottie tools or Animate:

| Layer | Animation |
| --- | --- |
| `door-light` | Gold (#FFC83D) light behind the doors; it shows as the doors open |
| `leaf-left` | Anchor at the left hinge (x 3, y 16.5 in the 28 × 32 artboard). Scale X 100% → 30%, skew Y 0° → −9° |
| `leaf-right` | Anchor at the right hinge (x 25, y 16.5). Scale X 100% → 30%, skew Y 0° → +9° |

On the website this runs in **0.5 s** with the ease `cubic-bezier(0.3, 1.25, 0.5, 1)` (a soft overshoot),
and the mark lifts 1 px with a gold glow. `dormnamo-mark-open` is the finished open frame.

## Colours

| Name | Hex | RGB | Use |
| --- | --- | --- | --- |
| DormNamo Blue | `#0A47A9` | 10, 71, 169 | Logo, primary buttons, links |
| Ink Navy | `#0A2F73` | 10, 47, 115 | Headlines and body text |
| Gold | `#FFC83D` | 255, 200, 61 | Accent: Like, match badge, calls to action |
| White | `#FFFFFF` | 255, 255, 255 | Backgrounds, cards |
| Muted Blue | `#3D63A0` | 61, 99, 160 | Secondary text, captions |
| Line Blue | `#D6E2F5` | 214, 226, 245 | Borders, dividers |
| Mist | `#EEF4FD` | 238, 244, 253 | Soft fills, chips |
| Haze | `#F7FAFF` | 247, 250, 255 | Section backgrounds |
| Gold Ink | `#5A4100` | 90, 65, 0 | Text on gold |
| Night Navy | `#071836` | 7, 24, 54 | Dark backgrounds |
| Like Green | `#16A34A` | 22, 163, 74 | Swipe up / like |
| Pass Red | `#DC2626` | 220, 38, 38 | Swipe down / pass |
| Heart Red | `#E5484D` | 229, 72, 77 | Saved hearts |

Mostly white and blue, with gold as the one accent. Text on gold is Gold Ink, never white.

## Type

| Typeface | Weights used | For |
| --- | --- | --- |
| **Bricolage Grotesque** | SemiBold 600, Bold 700, ExtraBold 800 | Logo wordmark (ExtraBold, −2.5% letter spacing), headlines |
| **Figtree** | Regular 400 to ExtraBold 800 | Body text, buttons, labels, numbers |

Both are free under the SIL Open Font License (the `OFL-*.txt` files): they can be used in ads and videos
and shared with your animator. Install the `static/` files for animation software; the `variable/` files
cover every weight in one file for apps that support variable fonts.

## Icons

Line icons on a 24 × 24 grid with a 2 px round stroke. Recolour by changing the `stroke` colour in the SVG.
The site never uses emoji in its interface, so use these icons instead.

## Motion style (from the website)

- Minimal and calm: smooth slides and fades. No bouncing, spinning or particle bursts.
- Standard ease: `cubic-bezier(0.22, 0.61, 0.36, 1)`, 0.3–0.36 s for UI moves.
- Discover swipe: up = like (green hue), down = pass (red hue), sideways = browse. The card in focus is sharp;
  the ones behind it are smaller, slightly tilted, blurred and faded toward white.

## Not included

The two area photos on the site (`img/area/`) are not DormNamo's own: they are Wikimedia Commons photos under
CC BY-SA 4.0 (Tibanga Avenue by Patrickroque01, MSU-IIT gymnasium by Exec8). They can be used in an ad only
with that credit and licence shown, and the ad then has to be shared under the same licence. Listing photos
belong to the landowners who uploaded them.
