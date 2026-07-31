# GamesTable — the plan

A personal game tracker: what you have finished, what you want to finish, what
you are playing right now, and what you just want to watch on YouTube or Twitch
without playing it. The same approach as in
[FilmTable](https://github.com/mrWD/film-table): no accounts, data on the device.

## How this differs from a TV-series tracker

Not cosmetically but substantively — and the whole design follows from it:

**A game has no episodes.** In FilmTable the core is "the next unwatched episode"
and everything is built around it. A game has no natural units of progress, so the
central action is different: **moving a game between statuses** and, optionally,
hours and a rating.

**Watching rather than playing is a full-fledged scenario.** A game movie or a
playthrough on YouTube is its own way of "finishing" a game, not a second-rate
one. That is why "want to watch" is just as much a status as "want to play", with
its own tab and its own links.

**The game catalogue is wider than one platform.** Console exclusives must not be
invisible (see DATA-SOURCES: Steam simply does not have them).

## Statuses

Two symmetric tracks — playing and watching — plus "dropped".

| Track | Statuses |
|---|---|
| **Playing** | `backlog` want to play → `playing` playing → `played` played |
| **Watching** | `to-watch` want to watch → `watching` watching → `watched` watched |
| **Other** | `dropped` dropped |

The symmetry is not decorative. A game may not be out yet — then a playthrough is
only something you plan to watch. And a ten-hour game movie is not something you
get through in one evening, so "watching now" is just as real a state as "playing
now".

`dropped` is necessary, otherwise abandoned games hang in "playing" forever and
lie in the statistics.

## Screens

1. **Library** — PLAYING / BACKLOG / PLAYED / WATCH tabs; the WATCH tab is split
   into "watching", "want to watch" and "watched" sections. A card shows: cover,
   title, year, platforms, Metacritic score, plus your rating and hours if they
   are set. The action on a card is a quick status change.
2. **Explore** — game search, plus curated lists: popular, recent releases,
   upcoming.
3. **Game** — cover, metadata, status buttons, personal rating (1–10), hours, a
   note, and **watch links**: YouTube (longplay, walkthrough, review) and Twitch.
4. **Profile** — statistics (games played, hours, by platform and genre), backup
   export/import, theme, and supporting the project.

## How watching on YouTube and Twitch works

No API and no keys: the buttons lead to ready-made search URLs —
`youtube.com/results?search_query=<game>+longplay` (as well as "walkthrough" and
"review") and `twitch.tv/search?term=<game>`. There is no need to embed a player
or call the YouTube Data API: for the "want to watch" scenario, landing on the
right results page in one tap is enough.

## Data

The library lives in `localStorage`, as in FilmTable, with JSON export and import.
Nothing personal leaves the device.

```ts
TrackedGame {
  id: string            // 'rawg:3498' | 'steam:292030' — the prefix shows the source
  title, cover, released, genres[], platforms[], metacritic
  status: 'backlog' | 'playing' | 'played'
        | 'to-watch' | 'watching' | 'watched' | 'dropped'
  addedAt, startedAt?, finishedAt?
  rating?: number       // 1–10, your own rating
  hours?: number        // hours, entered manually
  note?: string
}
```

## Sources

Details and measurements are in [DATA-SOURCES.md](DATA-SOURCES.md). In short: the
primary catalogue is **RAWG** (free key, all platforms), the key-free fallback is
**Steam** (PC only). Both go through a thin serverless proxy, because Steam sends
no CORS headers and the RAWG key cannot live in the browser.

## Stack

The same one that proved itself in FilmTable: React + TypeScript + Vite, zustand
with persist, HashRouter, vite-plugin-pwa, hand-written CSS with theme tokens.
Deployed on Vercel: static files and the proxy function under one domain.

## What goes into v1

The library with seven statuses, search, a game page with watch links, a profile
with statistics and backups, light and dark themes, PWA. Recommendations and
curated lists come after the basics work.
