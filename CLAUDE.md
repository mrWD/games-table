# GamesTable — project context

Read automatically at the start of every session. This holds what cannot be
derived from the code.

Details: [docs/PLAN.md](docs/PLAN.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) · [docs/DECISIONS.md](docs/DECISIONS.md) ·
[docs/DEPLOY.md](docs/DEPLOY.md)

## What this is

A personal video game tracker: what I am playing, what I want to finish, what I
have finished, and what I just want to watch as a playthrough or a game movie on
YouTube and Twitch. A PWA, data on the device, no accounts.

The younger sibling of [FilmTable](https://github.com/mrWD/film-table) — same
owner (**mrWD**, `lvigtor@gmail.com`), same architecture, same principles. Many
decisions have already been made and proven there: before inventing something,
look at the neighbouring project.

## Principles (do not break without the owner's explicit consent)

1. **The library lives on the device.** IndexedDB for the library (moved from
   `localStorage` in 2026-08, see DECISIONS), localStorage for small prefs; no
   accounts, nothing personal collected. There is exactly as much server code as it takes to hide
   the key and work around the missing CORS — and it stores nothing. The one
   exception is `src/components/Analytics.tsx`: on a `.vercel.app` host it reports
   cookieless screen-view counts to Vercel Web Analytics. It sends a screen name
   and never a title, a search term or an identifier, and it stays inert
   everywhere else.
2. **Watching is a first-class scenario.** The watch track is symmetric to the
   play track: want to watch → watching → watched. Do not collapse it back into a
   single status.
3. **Console games must be findable.** If search stops finding Zelda, something
   is broken: that is exactly the defect that made RAWG the primary source.
4. **Keys live only in environment variables.** `RAWG_API_KEY` lives in the Vercel
   dashboard. Not in the repository, not in the bundle, not in chat.

## How to run

```bash
npm install
npm run dev                       # :5173
npm run build && npm run preview  # :4173

# with RAWG: needs .env.local with RAWG_API_KEY (in .gitignore)
node --env-file=.env.local scripts/dev-api.mjs   # proxy on :3001
npm run dev                                      # Vite proxies /api to it
```

## How to verify

There are no automated tests; verification is manual through the browser panel at
a width of 375px. The mandatory minimum after any noticeable change:

- search for `zelda`, `mario`, `elden ring` — console games must be found;
- move a game through all seven statuses, each one landing in its own tab and
  section;
- the WATCH tab: the `ALL / WATCHING / WANT TO WATCH / WATCHED` chips filter, and
  with `ALL` the section headings come back;
- marking a platform on the game page — in the library row it is highlighted **in
  the existing list** rather than appended separately, and it moves to the front;
- the "For you" section in Explore: the reasons under the cards must **differ**,
  the same phrase under all of them is a known defect that has been fixed twice;
- the feedback form in the profile assembles a `mailto:` with a subject and body;
- the YouTube and Twitch links from the game page open the right results, and
  **every label is in English** — the Russian-language preset was removed
  deliberately;
- both themes and **horizontal overflow** (`scrollWidth` against `clientWidth`,
  must be 0 — that is exactly how this bug was caught in FilmTable);
- the hidden `/#/insights` page and the donation fan at the bottom left;
- a clean console.

Pitfalls of the verification itself (all three have already cost time):

- navigating to an address that differs **only in the hash** does not reload the
  page — the in-memory state stays as it was, and a data set planted in
  `localStorage` will not be picked up;
- the service worker serves the previous build: unregister service workers and
  clear `caches` before verifying;
- **do not poll production in a `curl` loop** — the Vercel Security Checkpoint
  kicks in and production starts returning 403 for everything, including the
  manifest. It looks like breakage, but it clears up on its own.

## Status

Published at <https://games-table-bay.vercel.app>, repository `mrWD/games-table`.
Deployment is automatic on a push to `main`. The short domain
`games-table.vercel.app` was taken by somebody else's project, hence the `-bay`
suffix.

The RAWG key is set in the Vercel environment variables — console games are found
("zelda" returns 203 results, including Nintendo).

The interface is **entirely in English**: the owner asked for this explicitly
after noticing the single Russian label in the watch links. The documentation in
`docs/` and this file are in English too.

Contacts inside the app (Profile → Feedback & contact): `lvigtor@gmail.com` and
<https://www.linkedin.com/in/viktor-lavrov>. The form does not send anything by
itself — it assembles a `mailto:` and hands it to the mail client; there is no
backend for it and none may be added.

There is no analytics here at all — unlike FilmTable, which has Vercel Web
Analytics.

## Open questions

- Vercel Web Analytics is not wired into GamesTable; the owner has not asked for
  it.
- There is no import from third-party trackers.
- The text of a LinkedIn post about the project is written but not published.

## Tone with the owner

In Russian. He values verified facts over assumptions: before claiming anything
about an API's behaviour, make the request and show the numbers. Large changes go
into a separate branch so they can be reviewed before merging.
