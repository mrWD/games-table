# Architecture

## Stack

React 19 + TypeScript + Vite. State is zustand with `persist` wherever it needs to
survive a reload. Routing is `HashRouter`: it works on any static host with no
server-side rules. Styling is hand-written CSS with theme tokens. PWA via
`vite-plugin-pwa`. There are no automated tests.

None of this was chosen from scratch — it was carried over from FilmTable, where
it is already battle-tested.

## Code map

```
api/games.js            serverless proxy to RAWG and Steam (Vercel)
scripts/dev-api.mjs     the same proxy locally, without deploying

src/lib/
  types.ts        domain types
  api.ts          search and game details: RAWG, with a Steam fallback
  watch.ts        building YouTube and Twitch links
  format.ts       dates, hours, platforms

src/store/
  library.ts      the single source of truth about the user (persist)
  theme.ts        theme selection (persist)
  stats.ts        usage counters for the hidden /insights (persist)
  explore.ts      search and curated list state (in memory)
  recommend.ts    taste and recommendations, computed on the device (in memory)
  selectors.ts    derived logic as pure functions

src/components/   icons, UI primitives, game cards
src/pages/        Library, Explore, GameDetail, Profile, Insights
```

## Data model

A single `gamestable-library-v1` key — what belongs to the user and goes into the
backup:

```ts
games: {
  [id]: {
    id: string          // 'rawg:3498' | 'steam:292030'
    title: string
    cover: string | null
    released: string | null
    genres: string[]
    platforms: string[]
    metacritic: number | null
    status: 'backlog' | 'playing' | 'played'
          | 'to-watch' | 'watching' | 'watched' | 'dropped'
    addedAt: number
    startedAt?: number
    finishedAt?: number
    rating?: number     // 1–10, your own rating
    hours?: number
    note?: string
    platform?: string   // what it was played/watched on — one of the values in platforms
  }
}
```

Decisions worth understanding:

**The whole game record is stored, not just an id.** In FilmTable, series were
cached separately because episodes change and need refreshing. A game's metadata
is static: once it is out, that is that. Storing a snapshot is simpler, and the
library stays fully readable offline without a separate cache.

**The source is visible from the id prefix.** `rawg:` or `steam:` — that way
records added from different sources do not collide, and `lookupGame()` knows
where to go for details. The same trick as `tmdb:` and `tt` in FilmTable.

**The platform is stored as a value from the game's own `platforms`, not as a free
string.** That keeps the list in the library row from duplicating: the marked
platform is simply highlighted inside it. Three platforms are shown, so the marked
one moves to the front — otherwise marking Switch on a six-platform game would
hide it behind the very list that is supposed to show it.

**The WATCH tab is filtered with chips.** The other three tabs hold one status
each, while WATCH holds three at once and reads as one long list without a filter.
`ALL` keeps the grouping with headings, the other chips narrow it to a single
status, where section headings are no longer needed.

## Feedback without a backend

The form on Profile does not send anything by itself: it assembles a `mailto:` and
hands it to the device's mail client. Nothing goes out until the person hits send
in their own client, and the text they typed is not stored anywhere. Next to it,
in plain text, are the email address and a LinkedIn link — on a device with no
mail account configured, `mailto:` does nothing.

## Statuses and transitions

Seven statuses across two symmetric tracks (see PLAN). The rules from
`selectors.ts`:

- `startedAt` is set on the first transition into `playing` **or** `watching`, and
  `finishedAt` on a transition into `played` or `watched`. That gives "how much was
  finished this month" without a separate log. Going back to an intent
  (`backlog`, `to-watch`) clears `finishedAt`.
- The WATCH tab shows all three statuses of the watch track, separated into
  sections: watching and playing are different intents and must not be mixed.
- The status switcher is grouped by track, otherwise seven buttons in a row are
  unreadable.
- `dropped` is not shown in the main tabs, but is visible in the profile and
  counted in the statistics. It must not be hidden entirely — otherwise a game
  "disappears" and the person adds it again.

## The proxy

`api/games.js` is a Vercel ESM function (`package.json` has `"type": "module"`;
CommonJS will not run there — a pitfall from FilmTable).

It has two jobs. First: hide the RAWG key. Second: work around Steam's missing
CORS — its endpoints do not send `Access-Control-Allow-Origin` at all, and without
a proxy the app simply cannot call them from the browser.

The path is passed as a **parameter** —
`/api/games?source=rawg&path=games&search=...` — rather than as URL segments. The
reason comes from FilmTable: a catch-all route on Vercel only matched a single
segment, and nested paths returned 404 without ever reaching the function.

A strict allowlist of paths is enforced, the Origin is checked, and responses are
cached at the edge. If there is no key it returns 503 and the client switches to
Steam.

On the client the path is always relative (`/api/games`). In production that is
the same origin, and in development Vite proxies `/api` to the local proxy —
otherwise the dev server serves the `api/games.js` file as a static asset and the
client tries to parse source code as JSON.

## Watch links

`src/lib/watch.ts` builds YouTube and Twitch search-results URLs. No APIs, no
keys and no embedded players: the user lands on the right results page in one tap,
and we do not pull third-party tracking onto the page.

## Recommendations

The "For you" section at the top of Explore. It is computed on the device; the
only things that leave are ordinary catalogue requests through the proxy — what a
person played never leaves the browser.

Taste is assembled from the library: a game's weight comes from its status
(`played` counts loudest, `dropped` goes negative), hours are added through `log2`
— otherwise a single 200-hour playthrough shouts down the entire library — and
your own rating acts as a multiplier. A game's weight is split between its genres,
so a game with five genres does not outweigh a focused one.

The substantive difference from FilmTable: **the platform is half of the taste**.
A Switch owner has no use for a PC exclusive, so platforms both select candidates
from RAWG and take part in the scoring. The result is
`0.5×genres + 0.2×platform + 0.2×quality + 0.1×year proximity`.

Candidates are taken from the RAWG catalogue by genre slug rather than by name:
`RPG` in a URL is `role-playing-games-rpg`. Slugs are now written into the library
along with the game; for records added earlier there is a correction table in
`recommend.ts`.

The reason under a card is computed **separately for each candidate**, and a second
title is only shown if it explains something the first one did not. Both rules were
bought with experience: the first in FilmTable, where the same phrase under every
card read as a placeholder; the second here, where Bloodborne carried "because you
played The Witcher 3 and Stardew Valley" even though the farming sim only matched
on RPG, which The Witcher already covered.

## Storage: how much fits and what is wrong with it

Since 2026-08 the library lives in IndexedDB (`gamestable-kv`, adapter in
`lib/idb-storage.ts`), whose quota is measured in gigabytes, so size is no
longer the pressing constraint. The history still explains the code:
localStorage capped out at **4.94 MB** per origin in Chromium (measured July
2026), even when `navigator.storage.estimate()` reported 10 GB.

The size of a record, measured across twenty real RAWG responses: **507 B** per
game. A thousand games is 480 KB. With the description a
record weighed 1,229 B instead of 407 (Elden Ring, a 778-character description) —
meaning 60% of the library's weight was data that is never displayed anywhere.

What the localStorage era left behind, and what remains true:

- **`description` is still not written to storage.** It is re-fetched every time
  the detail page opens and is never shown in lists; writing it would only
  inflate the library and the backup file. It is stripped via `partialize` and
  kept in memory for the session.
- **Write failures are still caught** — in `idb-storage.ts` now. A failed write
  toasts once and asks for an export instead of silently losing the change.
- **The app offers to install itself to the home screen.** This is not marketing:
  Safari clears script storage for sites that have not been visited in a while, and
  the rule does not apply to installed apps. That is what the prompt's text says.
  This applies to IndexedDB exactly as it did to localStorage — moving between
  them changes quotas, not eviction.

The cost of writing is not a problem: zustand serialises the whole store on every
change, but at 2,000 games (2.5 MB) that is 4.5 ms to serialise and 1.8 ms to
write — imperceptible.

The real risk is not size but loss: storage is wiped along with browser data. That
is why Export/Import is insurance rather than decoration, and the profile reminds
you to back up once there are enough records to miss.

## The hidden /insights page

It is not linked from navigation and opens only at `/#/insights`. It shows this
device's counters: sessions, active days, screens opened, how many times each
source responded, status transitions and watch links opened, plus a technical
panel.

One thing is especially useful here: **if RAWG shows zero, the proxy has no key
and only Steam is responding** — there will be no console games. The diagnosis
comes from numbers rather than complaints.

The counters live in `gamestable-stats-v1` and are not part of the library backup.
Numbers only: no search queries, no titles, no identifiers. Nothing leaves the
device.

The counter calls sit **outside** zustand reducers: inside `set()` they run twice
under StrictMode.

## Themes and PWA

Carried over from FilmTable unchanged: three modes (System / Light / Dark), with
the choice applied by an inline script **before the first paint**, otherwise the
screen flashes white on the dark theme. The service worker caches static assets
and API responses; covers use `CacheFirst`.
