# Store listing — working draft

Everything an app-store form asks for, prepared once. The texts are drafts in the
app's own voice; edit freely, but keep the claims true.

## Identity

| | |
|---|---|
| App name | GamesTable |
| Bundle / application id | `com.mrwd.gamestable` |
| Category (App Store) | Entertainment |
| Category (Google Play) | Entertainment |
| Website | <https://games-table-bay.vercel.app> |
| Privacy policy | <https://games-table-bay.vercel.app/privacy.html> |
| Support contact | lvigtor@gmail.com |

## Subtitle / short description

> Track games you play or watch

Play "short description" (80 chars max):

> A local-first tracker for the games you play, plan, finish — or watch as longplays. No account.

## Full description

GamesTable keeps track of your games — playing, backlog, finished — and, as a
first-class track, the ones you'd rather watch: playthroughs and game movies.

• Seven statuses across two symmetric tracks: play and watch
• Hours, ratings, platforms and notes per game
• One-tap links to playthroughs on YouTube and Twitch
• Explore with personal, per-game reasons for every recommendation
• No account, no sign-up, no tracking; the app works offline
• Your library exports to a single JSON file, and imports back

Catalogue data comes from RAWG and Steam.

## Data safety / privacy questionnaires

The honest answers, same on both stores:

- **Data collected: none.** The library never leaves the device; there are no
  accounts and no server for user data.
- **Data shared: none.** Catalogue queries go to the sources named in the privacy
  page as a technical necessity, not as data sharing for any purpose of ours.
- **Analytics in the app: none.** The cookieless web analytics run only on the
  website; the component is inert in the native app.
- Google Play Data safety: "No data collected", "No data shared". Apple privacy
  label: "Data Not Collected".

## What only the owner can do

- [ ] Google Play Console account ($25 once) and Apple Developer Program ($99/yr)
- [ ] App signing: Play App Signing on Android; Xcode automatic signing on iOS
- [ ] Screenshots (phone, 2–8 per store; take from the emulator/simulator at
      release quality, both themes)
- [ ] Release builds: `npm run build && npx cap sync`, then Android
      `./gradlew bundleRelease` (.aab) and iOS Archive in Xcode
- [ ] Content rating questionnaire (both stores; the app has no user content)
- RAWG terms ask for attribution — it is in the description.
