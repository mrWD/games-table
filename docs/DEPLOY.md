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
curl -s "localhost:3001/api/games?source=rawg&path=games&search=zelda" | head -c 200
curl -s "localhost:3001/api/games?source=rawg&path=genres" | head -c 200   # genre slugs
curl -s -o /dev/null -w "%{http_code}\n" "localhost:3001/api/games?source=rawg&path=users/me"
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://evil.example" \
     "localhost:3001/api/games?source=rawg&path=games&search=x"            # 403
curl -s "localhost:3001/api/games?source=rawg&path=games/3498" | grep -c "key="  # 0 — the key does not leak
```

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
