import { isNativeApp } from 'tables-core'
import type { GameSummary } from './types'
import { stats } from '../store/stats'

/**
 * Both catalogues are reached through our own /api/games proxy — RAWG because its key
 * must stay server-side, Steam because its endpoints send no CORS headers at all.
 * RAWG leads (it has console games); Steam covers PC when RAWG is unavailable.
 */

/**
 * On the web the proxy is same-origin: on Vercel the function lives at /api/games, and
 * in dev Vite proxies /api to the local harness (see vite.config.ts).
 *
 * The native app has no origin to be same as — it is served from capacitor://localhost —
 * so it must call the deployment by its full address. `VITE_API_BASE` still wins when
 * set, but the fallback is deliberate rather than empty: a build that quietly shipped to
 * a store with no base would have no search at all, and forgetting one environment
 * variable is not a failure worth risking that on.
 *
 * The proxy needs no change to allow this. Its origin check parses `capacitor://localhost`
 * to the host `localhost`, which its loopback rule already permits.
 */
const PRODUCTION_API = 'https://games-table-bay.vercel.app'

const API_BASE = (
  (import.meta.env.VITE_API_BASE as string | undefined) ?? (isNativeApp() ? PRODUCTION_API : '')
).replace(/\/$/, '')

/** Set once the proxy proves absent, so we stop retrying on every keystroke. */
let rawgDisabled = false

/**
 * A deadline, because this proxy is the app's only source.
 *
 * Measured against production while RAWG's own API was down: a failing request took
 * 19.5 seconds to come back, and Explore sat on loading skeletons for all of it — the
 * app read as hung rather than unlucky. FilmTable and BooksTable never had this
 * problem; their supplementary sources are wrapped in short timeouts and a primary
 * source answers regardless. Here every catalogue call goes through the proxy, so the
 * deadline belongs here.
 *
 * Eight seconds: clear of a slow mobile round trip, still inside the span of someone's
 * attention.
 */
const REQUEST_TIMEOUT_MS = 8000

async function proxy<T>(
  source: 'rawg' | 'steam' | 'igdb',
  path: string,
  params: Record<string, string> = {},
): Promise<T | null> {
  // Once the proxy has proven absent there is no point retrying on every keystroke.
  if (source === 'rawg' && rawgDisabled) return null
  const qs = new URLSearchParams({ source, path, ...params }).toString()
  try {
    const res = await fetch(`${API_BASE}/api/games?${qs}`, {
      signal: AbortSignal.timeout?.(REQUEST_TIMEOUT_MS),
    })
    if (res.status === 503 || res.status === 404 || res.status === 403) {
      if (source === 'rawg') rawgDisabled = true
      return null
    }
    if (!res.ok) return null
    return (await res.json()) as T
  } catch (err) {
    // A timeout says "too slow right now", not "not there". Treating the two alike
    // would let one slow moment disable RAWG — and with it every console game — for
    // the rest of the session.
    const name = err instanceof Error ? err.name : ''
    const timedOut = name === 'TimeoutError' || name === 'AbortError'
    if (source === 'rawg' && !timedOut) rawgDisabled = true
    return null
  }
}

// ---------- RAWG ----------

interface RawgGame {
  id: number
  name: string
  background_image?: string | null
  released?: string | null
  metacritic?: number | null
  rating?: number | null
  playtime?: number | null
  description_raw?: string
  genres?: { name: string; slug?: string }[]
  platforms?: { platform: { name: string; id?: number } }[]
  parent_platforms?: { platform: { name: string; id?: number } }[]
}

function mapRawg(g: RawgGame): GameSummary {
  return {
    id: `rawg:${g.id}`,
    title: g.name,
    cover: g.background_image ?? null,
    released: g.released ?? null,
    genres: (g.genres ?? []).map((x) => x.name),
    platforms: (g.parent_platforms ?? g.platforms ?? []).map((x) => x.platform.name),
    metacritic: g.metacritic ?? null,
    rating: g.rating ?? null,
    description: g.description_raw,
    playtimeHours: g.playtime ?? null,
    genreSlugs: (g.genres ?? []).map((x) => x.slug).filter((x): x is string => Boolean(x)),
    platformIds: (g.parent_platforms ?? [])
      .map((x) => x.platform.id)
      .filter((x): x is number => typeof x === 'number'),
  }
}

/** Genre-filtered catalogue used to gather recommendation candidates. */
export async function catalogueByGenre(
  genreSlug: string,
  opts: { platformIds?: number[]; ordering?: string; pageSize?: number } = {},
): Promise<GameSummary[]> {
  const params: Record<string, string> = {
    genres: genreSlug,
    ordering: opts.ordering ?? '-metacritic',
    page_size: String(opts.pageSize ?? 40),
  }
  if (opts.platformIds?.length) params.parent_platforms = opts.platformIds.join(',')
  const data = await proxy<{ results?: RawgGame[] }>('rawg', 'games', params)
  return (data?.results ?? []).map(mapRawg)
}

// ---------- Steam ----------

interface SteamSearchItem {
  id: number
  name: string
  tiny_image?: string
}

interface SteamAppDetails {
  name?: string
  header_image?: string
  short_description?: string
  release_date?: { date?: string }
  genres?: { description: string }[]
  metacritic?: { score?: number }
  platforms?: Record<string, boolean>
}

/**
 * Steam gives free text like "24 Feb, 2022". Parse it properly rather than
 * synthesising a January date — printing a release day that never happened is worse
 * than printing only the year.
 */
function steamReleased(date: string | undefined): string | null {
  if (!date) return null
  const parsed = new Date(date)
  if (!Number.isNaN(parsed.getTime())) {
    // Build the date from local parts: toISOString() would shift it a day back for
    // anyone east of UTC, turning "24 Feb" into "23 Feb".
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`
  }
  const year = /(\d{4})/.exec(date)
  return year ? year[1] : null
}

function steamPlatforms(p: Record<string, boolean> | undefined): string[] {
  if (!p) return []
  return Object.entries(p)
    .filter(([, on]) => on)
    .map(([name]) => name.charAt(0).toUpperCase() + name.slice(1))
}

// ---------- public API ----------

export async function searchGames(query: string): Promise<GameSummary[]> {
  const term = query.trim()
  if (!term) return []

  const viaRawg = await proxy<{ results?: RawgGame[] }>('rawg', 'games', {
    search: term,
    page_size: '20',
  })
  if (viaRawg?.results?.length) {
    stats.source('rawg')
    return viaRawg.results.map(mapRawg)
  }

  // IGDB before Steam, and the order is the whole point: it covers consoles, so
  // "zelda" and "mario" still return Nintendo titles when RAWG cannot answer. Steam
  // returns nothing for either (measured — see DATA-SOURCES).
  const viaIgdb = await proxy<IgdbGame[]>('igdb', 'games', { search: term, limit: '20' })
  if (viaIgdb?.length) {
    stats.source('igdb')
    return viaIgdb.map(mapIgdb)
  }

  // Steam only knows PC titles, so this is a narrower answer, not an equal one.
  const viaSteam = await proxy<{ items?: SteamSearchItem[] }>('steam', 'storesearch', {
    term,
    l: 'en',
    cc: 'US',
  })
  if (viaSteam?.items?.length) stats.source('steam')
  return (viaSteam?.items ?? []).map((i) => ({
    id: `steam:${i.id}`,
    title: i.name,
    cover: i.tiny_image ?? null,
    released: null,
    genres: [],
    platforms: ['PC'],
    metacritic: null,
    rating: null,
  }))
}

export async function lookupGame(id: string): Promise<GameSummary | null> {
  if (id.startsWith('rawg:')) {
    const data = await proxy<RawgGame>('rawg', `games/${id.slice(5)}`)
    return data ? mapRawg(data) : null
  }
  if (id.startsWith('steam:')) {
    const appid = id.slice(6)
    const data = await proxy<Record<string, { success: boolean; data?: SteamAppDetails }>>(
      'steam',
      'appdetails',
      { appids: appid },
    )
    const app = data?.[appid]
    if (!app?.success || !app.data) return null
    const d = app.data
    return {
      id,
      title: d.name ?? '',
      cover: d.header_image ?? null,
      released: steamReleased(d.release_date?.date),
      genres: (d.genres ?? []).map((g) => g.description),
      platforms: steamPlatforms(d.platforms),
      metacritic: d.metacritic?.score ?? null,
      rating: null,
      description: d.short_description,
    }
  }
  return null
}

/** Explore shelves: popular now and what is coming next. */
/**
 * IGDB — the second catalogue, and the only one besides RAWG that has both console
 * games and cover art. Steam has neither for consoles; the keyless sources measured in
 * DATA-SOURCES have the games but not the art, because cover art is copyrighted.
 *
 * Ids are prefixed `igdb:` so an entry saved from here stays distinguishable from the
 * same game saved via RAWG or Steam.
 */
interface IgdbGame {
  id: number
  name?: string
  cover?: { image_id?: string }
  first_release_date?: number
  genres?: { name: string }[]
  platforms?: { name: string }[]
  total_rating?: number
  aggregated_rating?: number
  summary?: string
}

function mapIgdb(g: IgdbGame): GameSummary {
  return {
    id: `igdb:${g.id}`,
    title: g.name ?? '',
    // t_cover_big is 264×374 — the size the cards actually render.
    cover: g.cover?.image_id
      ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
      : null,
    released: g.first_release_date
      ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10)
      : null,
    genres: (g.genres ?? []).map((x) => x.name).slice(0, 3),
    platforms: (g.platforms ?? []).map((x) => x.name).slice(0, 6),
    // IGDB's aggregated_rating is the critic score, which is what the badge means
    // elsewhere in this app; total_rating mixes in user votes, so it is not the same
    // number and is deliberately not shown as one.
    metacritic: g.aggregated_rating ? Math.round(g.aggregated_rating) : null,
    rating: g.total_rating ? Math.round(g.total_rating) / 20 : null,
    description: g.summary,
  }
}

interface SteamFeaturedItem {
  id: number
  name?: string
  header_image?: string
  large_capsule_image?: string
}

interface SteamFeatured {
  new_releases?: { items?: SteamFeaturedItem[] }
  coming_soon?: { items?: SteamFeaturedItem[] }
}

/**
 * Steam's own storefront lists, used when RAWG cannot answer.
 *
 * Fetched once per session and shared: both discover sections come out of the same
 * payload, and asking twice for it would double the wait for no new information.
 */
let featuredOnce: Promise<SteamFeatured | null> | null = null
function steamFeatured(): Promise<SteamFeatured | null> {
  featuredOnce ??= proxy<SteamFeatured>('steam', 'featuredcategories', { cc: 'us', l: 'en' })
  return featuredOnce
}

/**
 * `top_sellers` is deliberately not used. Measured during a Valve hardware launch it
 * returned four copies of "Steam Machine" and a controller — the list mixes hardware
 * with games and nothing in the payload separates them (`type` is 0 for both). The
 * release lists are games in practice, and duplicates are dropped by title anyway.
 */
function mapFeatured(items: SteamFeaturedItem[] | undefined): GameSummary[] {
  const seen = new Set<string>()
  const out: GameSummary[] = []
  for (const item of items ?? []) {
    const title = item.name?.trim()
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: `steam:${item.id}`,
      title,
      cover: item.large_capsule_image ?? item.header_image ?? null,
      released: null,
      genres: [],
      platforms: ['PC'],
      metacritic: null,
      rating: null,
    })
    if (out.length === 12) break
  }
  return out
}

/**
 * The two discover sections say where they came from, because the answers are not
 * equivalent: RAWG covers every platform, Steam only PC. The screen names its source
 * rather than passing a narrower list off as the same thing.
 */
export type DiscoverSource = 'rawg' | 'igdb' | 'steam'
export interface Discover {
  games: GameSummary[]
  source: DiscoverSource
}

export async function popularGames(): Promise<Discover> {
  const data = await proxy<{ results?: RawgGame[] }>('rawg', 'games', {
    ordering: '-added',
    page_size: '12',
  })
  if (data?.results?.length) return { games: data.results.map(mapRawg), source: 'rawg' }
  const viaIgdb = await proxy<IgdbGame[]>('igdb', 'games', { limit: '12' })
  if (viaIgdb?.length) return { games: viaIgdb.map(mapIgdb), source: 'igdb' }
  const featured = await steamFeatured()
  return { games: mapFeatured(featured?.new_releases?.items), source: 'steam' }
}

export async function upcomingGames(): Promise<Discover> {
  const today = new Date().toISOString().slice(0, 10)
  const inAYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
  const data = await proxy<{ results?: RawgGame[] }>('rawg', 'games', {
    dates: `${today},${inAYear}`,
    ordering: 'released',
    page_size: '12',
  })
  if (data?.results?.length) return { games: data.results.map(mapRawg), source: 'rawg' }
  const viaIgdb = await proxy<IgdbGame[]>('igdb', 'games', { upcoming: '1', limit: '12' })
  if (viaIgdb?.length) return { games: viaIgdb.map(mapIgdb), source: 'igdb' }
  const featured = await steamFeatured()
  return { games: mapFeatured(featured?.coming_soon?.items), source: 'steam' }
}
