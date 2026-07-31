# Decisions

Why things are built this way. Separately: the lessons inherited from FilmTable —
there is no need to learn them again.

## RAWG primary, Steam fallback

The opposite seemed natural: Steam needs no key, so the app would work out of the
box. Testing ruled that out — Steam has **no console games**: "zelda" returns zero
results and "mario" finds not a single Nintendo game (measurements in
DATA-SOURCES).

A tracker that cannot find half of what people play is useless. So the primary
source is RAWG with a free key, and Steam remains the fallback for PC games when
the proxy is unavailable. The same trade-off as FilmTable made with TMDB:
completeness beats ease of setup.

## The proxy is mandatory, not optional

In FilmTable the proxy was an improvement: keyless sources worked from the browser
on their own. Not here — **Steam sends no CORS at all**, and the RAWG key cannot
live in the client. So without a serverless function the app cannot get data by
any route.

A consequence worth remembering: local development without the proxy running shows
empty search results. That is not a bug.

## Seven statuses: two symmetric tracks

The owner named four: playing, want to play, played, want to watch. The watch track
came out stunted — and he noticed: a game may not be out yet, and a ten-hour game
movie is not something you finish in one evening. So "watching" is arranged exactly
like "playing":

- **`watching`** — watching right now, a full state rather than a gap between "want
  to" and "watched".
- **`watched`** — otherwise the "want to watch" list never empties.
- **`dropped`** — otherwise abandoned games hang in "playing" forever and lie in
  the statistics. In FilmTable the equivalent "Stop watching" also proved useful as
  a negative signal for recommendations.

Seven buttons in a row are unreadable, so the switcher is grouped: Play / Watch /
Other.

## Watching through links, not through an API

The YouTube Data API requires a key and has hard quotas, and an embedded player
drags in third-party cookies. For the "I want to watch a playthrough" scenario,
opening a ready-made search results page is enough — one line of code, zero keys,
zero tracking. It works for Twitch too.

## A game snapshot instead of a cache

In FilmTable, series live in a separate cache with a TTL because new episodes come
out. A game's metadata does not change, so the whole record is stored in the
library. Simpler, and the library reads fully offline.

## Lessons from FilmTable — do not repeat them

- **Vercel and `"type": "module"`.** The function must be ESM (`export default`).
- **Catch-all routes on Vercel** only match a single segment. Pass the path to the
  external API as a `?path=` parameter, not as URL segments.
- **CSS Grid and overflow.** Grid items have `min-width: auto`, so a long title
  stretches the column and the whole page. Set `min-width: 0`. Check overflow **at
  a width of 375px** — the bug is invisible in a wide window.
- **Side effects in zustand reducers** run twice under StrictMode. Keep them
  outside `set()`.
- **Buttons inside clickable cards** need both `stopPropagation` and
  `preventDefault`.
- **The service worker hides a fresh deploy.** After a release the browser serves
  the old build from the precache: unregister the worker and clear `caches` before
  checking production.
- **Vite serves `api/*.js` as a static file.** Without `server.proxy`, a relative
  `/api/games` request returns 200 with the function's source code and the client
  fails while parsing JSON.
- **Dates and time zones.** `new Date('24 Feb, 2022').toISOString()` gives
  February 23rd for everyone east of UTC, while `new Date('2022-02-24')` is UTC
  midnight, which renders as the previous day west of UTC. Build and parse dates
  from local parts.
- **Screenshots taken during loading** show empty tiles — that is lazy image
  loading, not breakage. Check `naturalWidth`.
- **Polling production frequently with curl** trips Vercel's bot protection, and it
  starts returning 403 to automation. Poll rarely.

## Open

- ~~The RAWG key~~ — set on 2026-07-26, console games are found. The Steam fallback
  stays in case RAWG is ever cut off.
- Game recommendations (by genre and platform, as in FilmTable) — after v1.
- Completion times: HowLongToBeat has no public API, so hours are entered manually.
  If a source turns up, an estimate could be pre-filled.
