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

1. **The library lives on the device.** IndexedDB in a browser, a JSON file in
   private app storage when running natively, localStorage for small prefs (see
   DECISIONS). No accounts, nothing personal collected. There is exactly as much server code as it takes to hide
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

## App Store / TestFlight (as of 2026-08-29)

The app record exists: **GamesTable**, Apple ID `6806613778`, bundle
`com.mrwd.gamestable`. Created by hand in App Store Connect — the public API
cannot create an app record, only read and update one.

**Version 1.0, build 2 is uploaded and shows "Ready to Submit".** Build 1 was rejected
on upload; see the traps below.

Filled in and saved:

- Category **Entertainment**, taken from `docs/STORE.md`
- Age rating **4+** — the seven-step questionnaire answered "none" or "no" throughout,
  which is accurate: the app carries no content of its own, has no web view, and nothing
  a person writes in it leaves the device
- Content Rights: **yes, it shows third-party content and the rights are in place**. The
  honest answer — the app displays covers, artwork and descriptions from its sources
  under their terms, and the attribution those terms require is on screen. Answering
  "no" would have contradicted the app's own attribution line
- **Test Information is not filled yet** — FilmTable has the wording to copy.

**What is not done: open testing.** A public TestFlight link needs an *external* group,
and App Store Connect currently offers only "Create New Internal Group" — there is no
External Testing section in the sidebar at all. Everything known to gate it has been
checked and is in order: the Program License Agreement is accepted, the Free Apps
Agreement is Active, and the App Information above is complete. The Free Apps Agreement
was activated on the same day, so the most likely explanation is that the interface has
not caught up. If External Testing is still missing after that, the cause is something
else and worth looking for with those four already ruled out.

### Traps that cost time, in the order they bit

- **A widget extension without `CFBundleDisplayName` is rejected on upload**, error
  90360, and only after the whole binary has gone up. All three apps had the same
  omission.
- **The archive is signed for development; only the export carries the distribution
  signature.** `scripts/release-ios.sh` printed "Apple Development" for a perfectly
  good build because it read the archive. It now unpacks the `.ipa` and reads that.
- **The build number must rise every upload.** A repeat is refused after the transfer,
  not before.
- **`altool` times out on Apple's own endpoints** more often than not; the upload
  itself usually succeeds on a retry. One "failure" was only the report being cut off
  — the build was already there.
- **App icons must be flat squares.** These were drawn with an 18.4% corner radius on
  the light background, so the corners held `#f2f2f2`. Masking exactly on that radius
  left a pale halo — the boundary pixels are anti-aliased and half of what they hold is
  background — and a four-pixel inset just moved the halo onto the mask's own edge. The
  mask now sits twelve pixels inside. `scripts/full-bleed-icon.mjs` in film-table does
  it.

### Releasing

```bash
scripts/release-ios.sh 3      # the argument is the build number
```

Builds, signs, and checks the signature on the exported `.ipa`. Uploading is a separate
step and needs an App Store Connect API key — see `docs/RELEASE-IOS.md`. The key lives
in `~/.appstoreconnect/private_keys/` and nowhere in this repository.

## On-device AI (as of 2026-08-29)

`AIBridge` and `TranslateBridge` were ported from FilmTable, so the model and Apple's
Translation framework are both available here. Translation matters more in this app: the
catalogue writes in English only.

**Tone tags** (`store/tone.ts`, `lib/tone.ts`) are the local addition. The recommender
knew genres, and "sci-fi" is both The Expanse and Rick and Morty; tone is read off the
description the app already downloaded and weighs alongside genre. Measured before
building, three runs over four real descriptions: the leading tag was identical every
time and the third wandered, so a library title is read twice and only what both runs
agree on is kept.

A tracked game usually has no description to read — the library drops that field before
saving because it costs more than the rest of an entry combined. The tone is therefore
read on the game's own page, at the one moment the description is in hand, and only the
three words are stored.

## Open questions

- Vercel Web Analytics is not wired into GamesTable; the owner has not asked for
  it.
- There is no import from third-party trackers.
- The text of a LinkedIn post about the project is written but not published.

## Tone with the owner

In Russian. He values verified facts over assumptions: before claiming anything
about an API's behaviour, make the request and show the numbers. Large changes go
into a separate branch so they can be reviewed before merging.
