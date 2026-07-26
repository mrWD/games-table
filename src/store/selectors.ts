import type { GameStatus, TrackedGame } from '../lib/types'

export const STATUS_LABEL: Record<GameStatus, string> = {
  playing: 'Playing',
  backlog: 'Want to play',
  played: 'Played',
  watching: 'Watching',
  'to-watch': 'Want to watch',
  watched: 'Watched',
  dropped: 'Dropped',
}

/** The picker groups the two tracks so seven options stay readable. */
export const STATUS_GROUPS: { label: string; statuses: GameStatus[] }[] = [
  { label: 'Play', statuses: ['backlog', 'playing', 'played'] },
  { label: 'Watch', statuses: ['to-watch', 'watching', 'watched'] },
  { label: 'Other', statuses: ['dropped'] },
]

/** Order used wherever statuses are offered as choices. */
export const STATUS_ORDER: GameStatus[] = [
  'backlog',
  'playing',
  'played',
  'to-watch',
  'watching',
  'watched',
  'dropped',
]

export type Tab = 'PLAYING' | 'BACKLOG' | 'PLAYED' | 'WATCH'

/**
 * Watching and playing are different intents, so the WATCH tab keeps them apart in
 * sections rather than merging them into one list.
 */
export const TAB_STATUSES: Record<Tab, GameStatus[]> = {
  PLAYING: ['playing'],
  BACKLOG: ['backlog'],
  PLAYED: ['played'],
  WATCH: ['watching', 'to-watch', 'watched'],
}

/**
 * The other three tabs are one status each; WATCH holds three at once, which reads as
 * one long list. 'ALL' keeps the grouped view, the rest narrow it to a single status.
 */
export type WatchFilter = 'ALL' | 'watching' | 'to-watch' | 'watched'

export const WATCH_FILTERS: WatchFilter[] = ['ALL', 'watching', 'to-watch', 'watched']

export function watchFilterLabel(filter: WatchFilter): string {
  return filter === 'ALL' ? 'All' : STATUS_LABEL[filter]
}

function recency(g: TrackedGame): number {
  return g.finishedAt ?? g.startedAt ?? g.addedAt
}

export function gamesByStatus(
  games: Record<string, TrackedGame>,
  status: GameStatus,
): TrackedGame[] {
  return Object.values(games)
    .filter((g) => g.status === status)
    .sort((a, b) => recency(b) - recency(a))
}

export interface Stats {
  total: number
  byStatus: Record<GameStatus, number>
  hours: number
  rated: number
  averageRating: number | null
  topPlatforms: [string, number][]
  topGenres: [string, number][]
  finishedThisYear: number
}

function tally(values: string[][]): [string, number][] {
  const counts = new Map<string, number>()
  for (const list of values) {
    for (const v of list) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

export function buildStats(games: Record<string, TrackedGame>): Stats {
  const all = Object.values(games)
  const byStatus = {
    playing: 0,
    backlog: 0,
    played: 0,
    watching: 0,
    'to-watch': 0,
    watched: 0,
    dropped: 0,
  } as Record<GameStatus, number>

  let hours = 0
  let ratingSum = 0
  let rated = 0
  const year = new Date().getFullYear()
  let finishedThisYear = 0

  for (const g of all) {
    byStatus[g.status] += 1
    if (g.hours) hours += g.hours
    if (g.rated) {
      ratingSum += g.rated
      rated += 1
    }
    if (g.finishedAt && new Date(g.finishedAt).getFullYear() === year) finishedThisYear += 1
  }

  return {
    total: all.length,
    byStatus,
    hours,
    rated,
    averageRating: rated > 0 ? ratingSum / rated : null,
    topPlatforms: tally(all.map((g) => g.platforms)).slice(0, 6),
    topGenres: tally(all.map((g) => g.genres)).slice(0, 6),
    finishedThisYear,
  }
}
