/**
 * Regenerates the store screenshots in docs/store/screenshots/.
 *
 *   npm i --no-save playwright && npx playwright install chromium
 *   node scripts/store-screenshots.mjs                          # every set
 *   node scripts/store-screenshots.mjs ios-6.9 ipad-13 android  # only these folders
 *
 * It starts its own Vite dev server, seeds a library through the app's own modules — the
 * same search, store and notes calls a person's taps would make, so the seed holds
 * exactly what the app would store (see docs/STORE.md) — and photographs each screen at
 * the size each store asks for: iPhone 6.9" at 1320×2868 and iPad 13" at 2064×2752 in
 * the light theme, Android phone at 1080×2400 in the dark one — plus docs/store/site/,
 * the 414×896 light and dark pairs the products page shows. `?from=app` hides the donation button the way the
 * native build does. The status and gesture bars in docs/store/frame/ are composited on
 * top; the safe-area insets are emulated so the layout leaves room for them as it does
 * on the phone.
 *
 * A run is not a person using the app: the daily usage ping is refused before it leaves
 * (src/lib/metrics.ts would otherwise count every fresh browser context as a new install),
 * and its one-time notice is dismissed up front so it does not cover the shots. Every file
 * is saved without an alpha channel, which App Store Connect refuses.
 *
 * The games are chosen so the artwork can be shown: all eight are open-source games whose
 * art ships under a free licence (0 A.D., Minetest and Red Eclipse: CC BY-SA; Battle for
 * Wesnoth: GPL-2.0+; SuperTuxKart: CC BY-SA and GPL media; Mindustry, Xonotic and Veloren:
 * GPL-3.0), and the image RAWG holds for each was checked by eye to be a picture of the
 * game itself rather than someone's key art. Any image not on CLEAN_ART is blurred where
 * it is drawn, so a catalogue that swaps an image later cannot put unchecked art into a
 * store listing.
 *
 * Needs the network and a working /api/games: the dev server proxies it to API_TARGET,
 * the production deployment unless told otherwise.
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright')
const sharp = require('sharp')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs', 'store')
const FRAME = join(ROOT, 'docs', 'store', 'frame')
const PORT = Number(process.env.PORT ?? 5192)
const API_TARGET = process.env.API_TARGET ?? 'https://games-table-bay.vercel.app'
const BASE = `http://localhost:${PORT}`

/** RAWG ids, what the seed does with each, and the image that was checked for it. */
const GAMES = [
  { id: 'rawg:58964', query: 'supertuxkart', status: 'playing', rated: 9, hours: 34, art: 'https://media.rawg.io/media/games/4de/4de345de55a10ad8be74da2e2b1a3bb8.jpg' },
  { id: 'rawg:41857', query: '0 a.d.', status: 'playing', hours: 61, art: 'https://media.rawg.io/media/screenshots/92e/92ef5f76bd4a8a4a1b81a127d3ae61a5_ZtgJvVQ.jpg' },
  { id: 'rawg:79210', query: 'mindustry', status: 'playing', hours: 18, art: 'https://media.rawg.io/media/screenshots/57b/57bf269a152051e20b7e988b5480e73d_HVza9eA.jpg' },
  { id: 'rawg:7452', query: 'battle for wesnoth', status: 'backlog', art: 'https://media.rawg.io/media/screenshots/f05/f05b83b3e490b32f0e207359251c4b66.jpeg' },
  { id: 'rawg:363630', query: 'veloren', status: 'backlog', art: 'https://media.rawg.io/media/screenshots/bb2/bb2769b57dca916c0e1dea1afdcea4b3.jpg' },
  { id: 'rawg:35703', query: 'xonotic', status: 'played', rated: 8, hours: 22, art: 'https://media.rawg.io/media/screenshots/a2d/a2de8556dba1f57eaa40e924fdfed465.jpg' },
  { id: 'rawg:90493', query: 'minetest', status: 'watching', art: 'https://media.rawg.io/media/screenshots/752/75248417bf2886f983e1d4c56aa2f8eb.jpg' },
  { id: 'rawg:40811', query: 'red eclipse', status: 'to-watch', art: 'https://media.rawg.io/media/screenshots/e18/e18321400426b0acbaa2ce563acdbf3d.jpg' },
]
const CLEAN_ART = GAMES.map((g) => g.art)

/** The store screens: the library, a game, the profile. */
const STORE_SHOTS = [
  { name: '01-library', hash: '#/library' },
  { name: '02-game', hash: `#/game/${GAMES[0].id}` },
  { name: '03-profile', hash: '#/profile' },
]

/** The products page's screens, under the file names it already uses. */
const SITE_SHOTS = [
  { name: 'library', hash: '#/library' },
  { name: 'game', hash: `#/game/${GAMES[0].id}` },
  { name: 'watch', hash: '#/library', act: (page) => page.locator('button', { hasText: /^WATCH$/ }).click() },
  { name: 'for-you', hash: '#/explore' },
  { name: 'search', hash: '#/explore', act: (page) => search(page, 'Search games', 'supertuxkart') },
]

const SETS = [
  // 62/34pt are the iPhone 16 Pro Max insets; the bars come from the simulator.
  { dir: 'screenshots/ios-6.9', width: 440, height: 956, scheme: 'light', insets: { top: 62, bottom: 34 }, status: 'ios-status.png', shots: STORE_SHOTS },
  // 32/20pt put every line where the app itself draws it on the iPad Pro 13" simulator
  // (iPadOS 27), measured against FilmTable running there; the bar is that simulator's, its
  // window title left out. At this width the app shows its wide-screen layout, the phone
  // column centred.
  { dir: 'screenshots/ipad-13', width: 1032, height: 1376, scale: 2, scheme: 'light', insets: { top: 32, bottom: 20 }, status: 'ipad-status.png', shots: STORE_SHOTS },
  { dir: 'screenshots/android', width: 360, height: 800, scheme: 'dark', insets: { top: 24, bottom: 24 }, status: 'android-status.png', nav: 'android-nav.png', shots: STORE_SHOTS },
  { dir: 'site', width: 414, height: 896, scale: 1, scheme: 'light', suffix: '-light', shots: SITE_SHOTS },
  { dir: 'site', width: 414, height: 896, scale: 1, scheme: 'dark', suffix: '-dark', shots: SITE_SHOTS },
]

async function search(page, placeholder, text) {
  await page.getByPlaceholder(placeholder).fill(text)
  // Past the input's debounce, then whatever the search set off.
  await page.waitForTimeout(1500)
}

async function seed(page, games) {
  return page.evaluate(async (games) => {
    const api = await import('/src/lib/api.ts')
    const { useLibrary } = await import('/src/store/library.ts')
    const lib = useLibrary.getState()
    for (const g of games) {
      const game = (await api.searchGames(g.query)).find((x) => x.id === g.id)
      if (!game) throw new Error(`search for ${g.query} did not return ${g.id}`)
      lib.setStatus(game, g.status)
      if (g.rated) lib.rate(g.id, g.rated)
      if (g.hours) lib.setHours(g.id, g.hours)
      if (game.platforms[0]) lib.setPlatform(g.id, game.platforms[0])
    }
  }, games)
}

/**
 * Resolves once no request has been in flight for `quietMs`. Playwright's own
 * 'networkidle' is a load state: after a hash change it has long been reached and
 * returns at once, before the new screen has asked for anything.
 */
function trackNetwork(page) {
  let inflight = 0
  let lastChange = Date.now()
  const bump = (d) => {
    inflight += d
    lastChange = Date.now()
  }
  page.on('request', () => bump(1))
  page.on('requestfinished', () => bump(-1))
  page.on('requestfailed', () => bump(-1))
  return async (quietMs = 1000, maxMs = 120_000) => {
    const until = Date.now() + maxMs
    while (Date.now() < until && (inflight > 0 || Date.now() - lastChange < quietMs)) {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
}

async function shoot(page, set, { name, hash, act }) {
  await page.evaluate((h) => (window.location.hash = h), hash)
  await page.settle()
  if (act) {
    await act(page)
    await page.settle()
  }
  // Recommendations and search fill in after the network settles; skeletons mean not yet.
  const started = Date.now()
  const settled = await page
    .waitForFunction(() => !document.querySelector('.skel'), null, { timeout: 180_000 })
    .then(() => true, () => false)
  if (!settled || Date.now() - started > 5000) {
    console.log(`${name}: ${settled ? 'settled' : 'still loading'} after ${Math.round((Date.now() - started) / 1000)}s`)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  // Only what is on screen: lazy images further down never load, by design.
  await page.waitForFunction(() =>
    [...document.images]
      .filter((i) => i.getBoundingClientRect().top < window.innerHeight)
      .every((i) => i.complete),
  )
  await page.waitForTimeout(600)
  const shot = await page.screenshot({ type: 'png' })

  const file = join(OUT, set.dir, `${name}${set.suffix ?? ''}.png`)
  await mkdir(dirname(file), { recursive: true })
  if (!set.status) {
    await sharp(shot).removeAlpha().png().toFile(file)
    console.log(file)
    return
  }
  const layers = []
  const bar = sharp(join(FRAME, set.status))
  // The bars were lifted as black glyphs; the dark theme wants them white.
  layers.push({ input: await (set.scheme === 'dark' ? bar.negate({ alpha: false }) : bar).toBuffer(), top: 0, left: 0 })
  if (set.nav) {
    const nav = sharp(join(FRAME, set.nav))
    const { height } = await nav.metadata()
    layers.push({
      input: await (set.scheme === 'dark' ? nav.negate({ alpha: false }) : nav).toBuffer(),
      top: set.height * (set.scale ?? 3) - height,
      left: 0,
    })
  }
  // Composited first, flattened after: sharp composites last, so a removeAlpha() in the same
  // chain would run before the bars bring their alpha back in.
  const framed = await sharp(shot).composite(layers).png().toBuffer()
  await sharp(framed).removeAlpha().png().toFile(file)
  console.log(file)
}

async function main() {
  const only = process.argv.slice(2)
  const sets = only.length ? SETS.filter((s) => only.some((o) => s.dir.endsWith(o))) : SETS
  if (!sets.length) throw new Error(`no set matches ${only.join(' ')}`)

  const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, API_TARGET },
  })
  await new Promise((resolve, reject) => {
    vite.stdout.on('data', (d) => String(d).includes('Local:') && resolve())
    vite.on('exit', (code) => reject(new Error(`vite exited ${code}`)))
  })

  const browser = await chromium.launch()
  try {
    for (const set of sets) {
      const context = await browser.newContext({
        viewport: { width: set.width, height: set.height },
        deviceScaleFactor: set.scale ?? 3,
        isMobile: true,
        hasTouch: true,
        colorScheme: set.scheme,
      })
      const page = await context.newPage()
      page.settle = trackNetwork(page)
      if (set.insets) {
        const cdp = await context.newCDPSession(page)
        await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: 0, right: 0, ...set.insets } })
      }
      await context.route(/\/api\/ping\b/, (route) => route.abort())
      await context.addInitScript(() => localStorage.setItem('gamestable-metrics-notice-dismissed', '1'))
      await page.goto(`${BASE}/?from=app#/`)
      await page.settle()
      await seed(page, GAMES)
      await page.addStyleTag({
        content:
          'img { filter: blur(14px) saturate(1.2); transform: scale(1.12); }\n' +
          CLEAN_ART.map((src) => `img[src="${src}"]`).join(',\n') +
          ' { filter: none; transform: none; }',
      })

      for (const shot of set.shots) await shoot(page, set, shot)
      await context.close()
    }
  } finally {
    await browser.close()
    vite.kill()
  }
}

await main()
