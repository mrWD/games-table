# Deployment

## Production: Vercel

<https://games-table-bay.vercel.app>, repository `mrWD/games-table`. On a push to
`main`, Vercel builds and publishes on its own; nothing has to be run by hand.

The `-bay` suffix is not a typo: the short domain `games-table.vercel.app` is taken
by somebody else's project. If the address ever changes, look for it in
`README.md`, `CLAUDE.md` and this file.

Despite its name, `.github/workflows/deploy.yml` **does not deploy anything** — it
is a build check on pushes to `main`. Deployment happens entirely on Vercel's side.

### Environment variables

Just one: `RAWG_API_KEY` in **Settings → Environment Variables**. The key is not
needed anywhere else — not in the repository, not in the bundle.

If the key is missing, the proxy returns 503, the client silently switches to
Steam, and **console games disappear from search**. That is not a hypothesis:
Steam knows no Nintendo games at all. The symptom on the hidden `/#/insights` page
is a zero for RAWG in the "Which source answered" section.

## Checking that the current version is deployed

The bundle hash in production must match the local one:

```bash
curl -s https://games-table-bay.vercel.app/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html
```

**Do not poll production in a loop.** Frequent requests trip the Vercel Security
Checkpoint, and production starts returning 403 for everything, including
`manifest.webmanifest` — it looks like the app is broken, but it clears up on its
own. Prefer checking through a browser rather than a `curl` loop.

The service worker serves the previous build, so before checking in a browser:

```js
for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
for (const k of await caches.keys()) await caches.delete(k)
location.reload()
```

Another verification pitfall: navigating to an address that differs **only in the
hash** does not reload the page. The app keeps its previous in-memory state and a
data set planted in `localStorage` is not picked up — an explicit
`location.reload()` is required.

## Testing the proxy locally without deploying

```bash
echo 'RAWG_API_KEY=<key>' > .env.local               # the file is in .gitignore
node --env-file=.env.local scripts/dev-api.mjs       # proxy on :3001
npm run dev                                          # Vite proxies /api to it
```

Proxying `/api` in `vite.config.ts` is mandatory: without it the dev server serves
`api/games.js` as a static file and the client tries to parse source code as JSON.

Worth running (every line here caught a real defect):

```bash
O='Origin: capacitor://localhost'   # what the iOS app sends; a bare curl is now refused
curl -s -H "$O" "localhost:3001/api/games?source=rawg&path=games&search=zelda" | head -c 200
curl -s -H "$O" "localhost:3001/api/games?source=rawg&path=genres" | head -c 200   # genre slugs
curl -s -o /dev/null -w "%{http_code}\n" -H "$O" "localhost:3001/api/games?source=rawg&path=users/me"
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.example" \
     "localhost:3001/api/games?source=rawg&path=games&search=x"            # 403
# 0 — the key does not leak. Check a *list*: RAWG writes the key into `next`, and a
# detail page (games/3498) has no `next`, which is how this check once missed it.
curl -s -H "$O" "localhost:3001/api/games?source=rawg&path=games&search=zelda" | grep -c "key="
# 0 — adult titles are filtered out of every list (see "Adult titles" below)
curl -s -H "$O" "localhost:3001/api/games?source=rawg&path=games&search=hentai" | grep -o '"name"' | wc -l
```

### Who the proxy answers (2026-10-18)

- **With an Origin:** exactly `capacitor://localhost` (iOS — measured in the simulator
  against this code in production mode: `Origin: capacitor://localhost`,
  `Sec-Fetch-Site: cross-site`, answered 200), `https://localhost` (Android), its own host (which covers preview deployments),
  `games-table-bay.vercel.app` and anything in `ALLOWED_ORIGINS`. Any
  `http://localhost:<port>` only when `VERCEL_ENV` is not `production`.
- **Without one:** only when the browser says `Sec-Fetch-Site: same-origin` — measured:
  that is exactly what the web app's own fetches send, including the ones its service
  worker re-issues. Browsers without Fetch Metadata fall back to a Referer on our host.
- **Rate limit:** 120 requests a minute per address (IPv6 per /64), held in each warm
  instance's memory and answered 429 with `Retry-After`. Not global: parallel instances
  and cold starts each count from zero, and edge-cached answers never reach it.

All of this reads headers a browser sets and a page cannot forge, so it keeps other
websites from spending the quota through their visitors. A script that sends
`Origin: capacitor://localhost` itself is indistinguishable from the app and is
answered; the backstops for that are the edge cache, the upstreams' own limits and
rotating the keys. A global limit would need Vercel Firewall rate-limit rules
(dashboard) or a store keyed by IP — the owner's call.

`VERCEL_ENV=production node --env-file=.env.local scripts/dev-api.mjs` runs the harness
the way production judges origins.

### Adult titles

The app is rated 4+, and all three catalogues answer an ordinary search with explicit
games and their covers (measured: "hentai" → IGDB 20 of 20, Steam 10 of 10, RAWG 1,630).
The proxy drops them from every list it returns, so builds already installed are covered
the moment it deploys: RAWG entries tagged `nsfw`/`hentai`, rated Adults Only, or tagged
`sexual-content`/`nudity` with no ESRB rating at all; IGDB entries with the "Erotic"
theme; and in all three, titles naming it outright. The ESRB condition is what keeps The
Witcher 3 and GTA (tagged `nudity` on RAWG, but rated) — measured on those searches.

## Alternative hosts

Static files plus a single function, so it ports to Netlify or Cloudflare Pages.
There is one requirement: the function must answer at the `/api/games` path — the
client only calls that, and if it does not find it, it will silently fall back to
Steam and lose console games along the way.

## Security rules

`RAWG_API_KEY` must not end up in the repository, in the client bundle or in chat.
Only the host's environment variables and a local `.env.local` from `.gitignore`.

If the key is ever exposed, reissue it in the RAWG dashboard and update the
variable in Vercel.
