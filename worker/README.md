# worker/ — the site's only server (Cloudflare Worker)

The website itself is static (GitHub Pages). This small Cloudflare Worker is the one
piece that runs on a server, so secret keys never reach the browser. Live at
`https://dormnamo-nearby.dormnamo.workers.dev`.

| File | Purpose |
|---|---|
| `nearby.mjs` | Entry point. `GET /nearby` finds nearby places with Google Places, checks which sites may call it, and sends `/namo` to `namo.mjs`. |
| `namo.mjs` | `POST /namo`: asks Google Gemini (free tier) to reword Namo's answers, then fact-checks the reply with `js/namo/namo-guard.js`. |
| `cache.mjs` | A time-limited cache so the same nearby lookup isn't paid for twice. |
| `wrangler.toml` | Worker settings: name, allowed sites (`ALLOWED_ORIGINS`), Gemini model and daily limits. |
| `.dev.vars` | Your local secrets for `npm run worker:dev`. Gitignored, never uploaded. |

**Commands**
- Deploy: `npm run worker:deploy`
- Run locally: `npm run worker:dev` (uses `.dev.vars`)
- Set a secret: `npx wrangler secret put GEMINI_API_KEY --config worker/wrangler.toml`, then paste the key when asked
