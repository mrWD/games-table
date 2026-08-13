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

## IndexedDB instead of localStorage (2026-08)

Same decision as FilmTable's, made at the same time and with the owner's
explicit consent: the library moved to IndexedDB (`gamestable-kv`, adapter now
`createDeviceStorage` in `tables-core`) to shed the ~5 MB ceiling and to be on the storage a
native wrapper migrates from when the app goes to the stores. The old
localStorage value is copied once on first read and left frozen, so a rollback
finds the library as of the migration moment. Hydration became asynchronous —
`main.tsx` holds the first render until it settles. Small prefs (`theme`,
`stats`) stay in localStorage; `theme` must be readable synchronously or the
first paint flashes the wrong theme. Exporting a backup on iOS goes through the
share sheet because File System Access does not exist there.

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

## Wrapped for the stores with Capacitor (2026-08)

The same Vite build, inside a native shell: `webDir` is the ordinary `dist`, so
a release is `npm run build` plus `npx cap sync`. `HashRouter` already suited the
`capacitor://localhost` origin, so routing needed nothing.

The library moved again, from IndexedDB to a JSON file in private app storage
(`createDeviceStorage` in `tables-core`). A WebView's IndexedDB is *site data* to
the OS: iOS may reclaim it under storage pressure and "Offload App" discards it,
while a file in the app container survives both and rides along in the device
backup. Same one-way copy as before — read once, write the file, leave the old
value frozen.

Two findings from the pilot, both already paid for:

- **Every browser test for installedness answers "no" inside the WebView**, so
  the app offered to add itself to the home screen while already installed.
  `isNativeApp()` in `tables-core` is the fix.
- **The status bar icons follow the system, not this app's theme.** Measured on
  targetSdk 36: the web view is inset by 24 CSS px top and bottom,
  `env(safe-area-inset-*)` reads 0, and those strips are painted with the window
  background — which comes from the `DayNight` theme and so follows the system.
  Driving the icons from the app's theme puts white icons on a white strip the
  moment someone picks Dark on a light phone. Known cost: with the theme
  overridden against the system, those strips keep the system's colour.

The native build reaches `/api/games` by absolute URL — there is no origin for it
to be same as, and unlike FilmTable every catalogue call goes through the proxy,
so without this there would be no search at all. `VITE_API_BASE` still wins; the
fallback to the production address keeps a store build from shipping searchless.
The proxy needed no change: verified against production, a request carrying
`Origin: capacitor://localhost` is answered 200, because the origin parses to the
host `localhost` and the loopback rule already permits it.

## Discover falls back to Steam's storefront (2026-08-11)

RAWG went down and Explore had nothing to show: both discover sections were RAWG-only,
so the whole screen collapsed to one apologetic sentence. Search was fine — it already
falls back to Steam — which made the asymmetry obvious.

Steam's `featuredcategories` now fills those sections when RAWG returns nothing. It
needs no key, answers in 0.27 s and carries cover art. The sections rename themselves to
"New on Steam" and "Coming soon on Steam", because a PC-only list is a **narrower**
answer, not an equal one, and the screen should not imply otherwise.

`top_sellers` is not used even though it sounds like the better match for "Popular now":
measured during a Valve hardware launch it returned four "Steam Machine" entries and a
controller, and nothing in the payload separates hardware from games.

This does not restore console games — Steam has none, which is the finding this whole
architecture is built on. It restores a populated screen and PC discovery. The real fix
for consoles is a second keyed catalogue (IGDB); see DATA-SOURCES.

Note for deploying: the proxy allowlist gained `featuredcategories`, so the fallback only
works once `api/games.js` is deployed. Until then the app behaves exactly as before.

## Home-screen widgets (iOS)

The first part of the app that is **not** shared React: a widget runs in its own
process and cannot render a WebView. iOS needs a WidgetKit extension in Swift, so
`ios/App/GamesTableWidget/` holds the SwiftUI, and `ios/App/App/WidgetBridge.swift` is a
small in-app Capacitor plugin that hands it data.

The two processes meet in an **App Group** (`group.com.mrwd.gamestable`): the app writes a snapshot
there as JSON, the widget only reads. `src/lib/widget.ts` builds that snapshot from
the same store the screens read, so the widget cannot drift into disagreeing with
the app. Covers are copied in as files because WidgetKit cannot fetch images.

Nothing leaves the device — an App Group is on-device storage shared between two of
our own processes.

Things that cost a rebuild each, all of which look like "nothing happens":

- **`capacitorDidLoad()` does not exist** in this Capacitor version. The override
  compiles, never runs, and the plugin reports "not implemented on ios".
  Registration goes in `viewDidLoad`; check the shipped framework header before
  trusting a hook name.
- **`SceneDelegate` builds the root controller in code**, so editing the
  storyboard's custom class changes nothing.
- **The team must be set in the project**, not only on the `xcodebuild` command
  line. Without it Xcode's Signing & Capabilities editor refuses to load the
  capability list at all, and App Groups cannot even be searched for. With it,
  `-allowProvisioningUpdates` registers new groups on its own.
- **Entitlements are absent from a simulator build made with code signing off**,
  and `codesign -d` shows nothing for simulator builds even when they are present.
  Ask for the App Group container instead of reading the binary.

The Xcode target is added by `scripts/add-widget-target.rb`, which is idempotent —
run it again and it repairs the project rather than duplicating the target.
