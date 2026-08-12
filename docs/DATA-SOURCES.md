# Data sources

Everything below was verified with requests on 2026-07-26 rather than taken from
documentation. If the behaviour changes, re-check it and fix this file.

## Summary

| Source | What it provides | Key | CORS | Role |
|---|---|---|---|---|
| **RAWG** | all platforms, covers, ratings, dates | required, free | yes | primary catalogue |
| **Steam** | PC games: genres, Metacritic, platforms, covers | not required | **no** | fallback, PC only |
| **IGDB** | consoles, covers, ratings, platforms | required, free | via proxy | second catalogue |
| **Wikidata** | titles and years for any game | not required | yes | rejected again, see below |
| **Wikipedia** | titles, years, descriptions | not required | yes | rejected, almost no covers |
| **Steam featured** | PC storefront lists with covers | not required | **no** | discover fallback |

## The key finding: Steam does not see consoles

This determined the whole architecture. Steam search measurements:

| Query | Results |
|---|---|
| `elden ring` | 5 — ELDEN RING, Nightreign, Shadow of the Erdtree ✅ |
| `witcher` | 10 — the whole series ✅ |
| `zelda` | **0** |
| `mario` | 10, but **not a single Nintendo game** — only unrelated indies |

The reason is obvious: the Steam catalogue has no Nintendo games or other console
exclusives. For a tracker where a person also keeps console games, that is not
enough — "Zelda cannot be found" makes the app useless for half the audience.
Hence RAWG as the primary source.

## RAWG

`https://api.rawg.io/api/games?search=...&key=KEY` — 500k+ games across all
platforms, covers, ratings, release dates, genres, platforms.

Without a key it returns **401 Unauthorized** (verified). The key is free, issued
at rawg.io/apidocs, and the terms are fine for non-commercial use.

The key is stored **only** in the Vercel `RAWG_API_KEY` environment variable and
injected by the proxy. It never reaches the browser — in a public repository that
would be a published key.

## Steam

Two key-free endpoints:

- `https://store.steampowered.com/api/storesearch/?term=QUERY&l=en&cc=US` —
  search, returns `id`, `name`, `tiny_image`. Up to 10 results.
- `https://store.steampowered.com/api/appdetails?appids=ID` — details: genres,
  release date, Metacritic score, platforms (windows/mac/linux), `header_image`.

Verified against The Witcher 3 (appid 292030): genre RPG, Metacritic 93, dated
18 May 2015, cover present.

**Neither one sends `Access-Control-Allow-Origin`** — they cannot be called
directly from the browser. Only through the proxy. That is a measured fact, not a
preference.

Steam images do display fine in an `<img>` tag: images do not need CORS.

## Wikidata

Works without a key and with `Access-Control-Allow-Origin: *`. A SPARQL query on
`wdt:P31 wd:Q7889` (video game) finds the whole Witcher series with release years.

But most games have **no images** (P18): in a sample of eight games, one had a
cover. Not suitable for a cover-driven UI — only as an emergency source of titles
if both RAWG and Steam are unavailable. Not used in v1.

## Rejected after testing

- **CheapShark** — returns 400 on search requests; oriented towards discounts, not
  a catalogue.
- **FreeToGame** — has CORS, but the catalogue is free-to-play only: 347 games. Too
  little for a tracker.
- **SteamSpy** — no CORS, and the data is about sales statistics, not the
  catalogue.
- **IGDB** — the best database after RAWG, but it requires a Twitch OAuth app,
  which is harder than a plain key. A future candidate if RAWG lets us down.

## Watching playthroughs

No API is needed at all. The buttons lead to search URLs:

- `https://www.youtube.com/results?search_query=<game>+longplay+no+commentary`
- `https://www.youtube.com/results?search_query=<game>+game+movie+all+cutscenes`
- `https://www.youtube.com/results?search_query=<game>+walkthrough`
- `https://www.youtube.com/results?search_query=<game>+review`
- `https://www.twitch.tv/search?term=<game>`

The queries are English only: the app's interface is entirely in English, and the
Russian-language preset was removed from it.

The YouTube Data API requires a key and has hard quotas, whereas for the "want to
watch" scenario opening a ready-made results page is enough. As a bonus, nothing
is embedded and nothing is tracked.

## Order of calls

1. **RAWG** — if the proxy is deployed and a key is set.
2. **Steam** — if RAWG is unavailable; works without a key, but PC games only.
3. If both are unavailable — an honest error message, not a blank screen.

As in FilmTable, supplementary requests are wrapped in a timeout so that a slow
source does not hold up the results.


## Re-measured 2026-08-11, while RAWG was down

RAWG's own API answered **522 for 19.5 seconds**, twice in a row, with no proxy and no
key involved — so this was not our key, our quota or our proxy. With RAWG gone, Explore
had nothing at all: both discover sections were RAWG-only. That is what prompted looking
for a third source.

### Steam `featuredcategories` — now used

`https://store.steampowered.com/api/featuredcategories?cc=us&l=en` — no key, 0.27 s,
returns `new_releases` (30), `coming_soon` (10), `top_sellers` (10) and `specials`, each
item carrying `header_image` and `large_capsule_image`. Covers verified to load in the
app (616×353).

**`top_sellers` is deliberately unused.** Measured during a Valve hardware launch it was
four copies of "Steam Machine" plus "Steam Controller" — the list mixes hardware with
games and nothing separates them: `type` is `0` for both a controller and a game. The
release lists were games throughout, and duplicate titles are dropped anyway.

Still PC-only, so the sections say so: they are labelled "New on Steam" and "Coming soon
on Steam" rather than passing a narrower list off as the same thing.

### Wikipedia — rejected

`action=query&generator=search&prop=pageimages` is fast (0.34–0.57 s), keyless, CORS-open
and **does** find console games where Steam cannot: "zelda" returns The Legend of Zelda,
Breath of the Wild, The Wind Waker; "mario" returns Super Mario Bros., Paper Mario.
Descriptions even carry the year ("2017 video game").

But covers were present for **1 of 8**, **2 of 8** and **0 of 8** results. The reason is
structural rather than a gap to work around: game cover art is non-free, so it is not on
Commons and `pageimages` excludes it. Results also mix in characters and films
("Elden Ring (film)", "Link (The Legend of Zelda)").

### Wikidata — re-confirmed as unusable

Same SPARQL shape as 2026-07-26, re-run: 61 distinct Zelda games, **3 with images**, and
the query took **19.6 s** — longer than the 8 s request deadline the client now enforces.
Release years also come back as re-release dates (Ocarina of Time as 2007). Not viable.

### IGDB — added, and it closes the gap

Measured against production on 2026-08-12, through our proxy:

| Query | Results | With cover | On Nintendo platforms | Time |
|---|---|---|---|---|
| `zelda` | 20 | **20** | 16 | **0.11 s** |
| `mario` | 20 | 19 | 12 | 0.48 s |
| `elden ring` | 18 | 18 | 4 | 0.49 s |

Set beside the alternatives measured the same day — Steam returns 0 for `zelda`,
Wikidata managed 3 covers out of 61 in 19.6 s, Wikipedia 1 cover out of 8 — this is the
only source besides RAWG that satisfies principle 3 in CLAUDE.md.

Authentication is a Twitch client-credentials token (`IGDB_CLIENT_ID` /
`IGDB_CLIENT_SECRET` in the Vercel environment, never in the bundle), cached per warm
proxy instance. IGDB speaks its own query language over POST with a text body; the proxy
translates the client's ordinary GET, so that protocol never reaches the browser.
