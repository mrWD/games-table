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

async function proxy<T>(
  source: 'rawg' | 'steam',
  path: string,
  params: Record<string, string> = {},
): Promise<T | null> {
  // Once the proxy has proven absent there is no point retrying on every keystroke.
  if (source === 'rawg' && rawgDisabled) return null
  const qs = new URLSearchParams({ source, path, ...params }).toString()
  try {
    const res = await fetch(`${API_BASE}/api/games?${qs}`)
    if (res.status === 503 || res.status === 404 || res.status === 403) {
      if (source === 'rawg') rawgDisabled = true
      return null
    }
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    if (source === 'rawg') rawgDisabled = true
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
export async function popularGames(): Promise<GameSummary[]> {
  const data = await proxy<{ results?: RawgGame[] }>('rawg', 'games', {
    ordering: '-added',
    page_size: '12',
  })
  return (data?.results ?? []).map(mapRawg)
}

export async function upcomingGames(): Promise<GameSummary[]> {
  const today = new Date().toISOString().slice(0, 10)
  const inAYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
  const data = await proxy<{ results?: RawgGame[] }>('rawg', 'games', {
    dates: `${today},${inAYear}`,
    ordering: 'released',
    page_size: '12',
  })
  return (data?.results ?? []).map(mapRawg)
}
