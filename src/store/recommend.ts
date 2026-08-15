import { create } from 'zustand'
import { catalogueByGenre } from '../lib/api'
import type { GameStatus, GameSummary, TrackedGame } from '../lib/types'
import { useLibrary } from './library'
import { useTones } from './tone'

/**
 * Content-based recommendations, computed on this device.
 *
 * Two things differ from FilmTable's version, and both matter for games. A game has no
 * episodes, so interest is read from the status it reached and the hours logged rather
 * than from progress. And platform is half of taste here: a Switch owner does not want
 * a PC exclusive, so platforms are both a candidate filter and a scoring term.
 */

/** How loudly each status speaks. Finishing something says the most. */
const STATUS_WEIGHT: Record<GameStatus, number> = {
  played: 3,
  playing: 2.5,
  watched: 1.5,
  watching: 1.5,
  backlog: 0.8,
  'to-watch': 0.6,
  // Dropping is evidence against, milder than finishing is for.
  dropped: -1.5,
}

/**
 * Tone is worth as much as platform and rating, and less than genre.
 *
 * Genre is what the catalogue is organised by and the only thing that fetches candidates
 * at all, so it stays first. Tone answers what genre cannot — "sci-fi" is both The
 * Expanse and Rick and Morty — but it is read off a description by a model rather than
 * stated by the catalogue, so it corrects the order rather than deciding it. Its weight
 * is also self-limiting: a candidate whose tone has not been read yet simply scores zero
 * on it, which is the same as the ranking that shipped before.
 */
const SCORE = { genre: 0.45, tone: 0.15, platform: 0.2, quality: 0.15, year: 0.05 }

const MAX_SEED_GENRES = 4
const RESULT_LIMIT = 12
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/**
 * RAWG filters by slug, and library entries added before slugs were stored have only
 * names. Most normalise mechanically; these do not.
 */
const GENRE_SLUG_FIXUPS: Record<string, string> = {
  rpg: 'role-playing-games-rpg',
  'massively-multiplayer': 'massively-multiplayer',
  'board-games': 'board-games',
}

function genreSlug(name: string): string {
  const mechanical = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return GENRE_SLUG_FIXUPS[mechanical] ?? mechanical
}

export interface Taste {
  genres: Record<string, number>
  /** Weighted the same way as genres, from whatever tones have been read so far. */
  tones: Record<string, number>
  topTones: string[]
  /** Slug per genre name, so candidates can actually be fetched. */
  slugs: Record<string, string>
  topGenres: string[]
  platforms: Record<string, number>
  topPlatformIds: number[]
  seeds: { title: string; genres: string[]; weight: number }[]
  meanYear: number | null
  seedCount: number
}

export interface Recommendation {
  game: GameSummary
  score: number
  reason: string
}

function yearOf(date: string | null | undefined): number | null {
  const m = /^(\d{4})/.exec(date ?? '')
  return m ? Number(m[1]) : null
}

// ---------- taste ----------

export function buildTaste(games: Record<string, TrackedGame>): Taste {
  const genres: Record<string, number> = {}
  const tones: Record<string, number> = {}
  const toneCache = useTones.getState().tones
  const slugs: Record<string, string> = {}
  const platforms: Record<string, number> = {}
  const platformIdWeight = new Map<number, number>()
  const seeds: Taste['seeds'] = []
  let yearSum = 0
  let yearWeight = 0

  for (const g of Object.values(games)) {
    let weight = STATUS_WEIGHT[g.status] ?? 0
    // Hours are the strongest honest signal a game can give, but they must not let one
    // 200-hour playthrough drown out everything else.
    if (weight > 0 && g.hours) weight += Math.min(2, Math.log2(1 + g.hours) / 2)
    if (weight > 0 && g.rated) weight *= g.rated >= 8 ? 1.3 : g.rated <= 4 ? 0.5 : 1
    if (weight === 0 || g.genres.length === 0) continue

    // Spread across genres so a five-genre title cannot outvote a focused one.
    const per = weight / g.genres.length
    g.genres.forEach((name, i) => {
      genres[name] = (genres[name] ?? 0) + per
      slugs[name] ??= g.genreSlugs?.[i] ?? genreSlug(name)
    })
    // Only titles whose tone has actually been read contribute; the rest simply are not
    // in the vector yet, which is the same as the app before any of this.
    const mine = toneCache[g.id] ?? []
    for (const t of mine) tones[t] = (tones[t] ?? 0) + weight / mine.length
    for (const p of g.platforms) platforms[p] = (platforms[p] ?? 0) + weight
    for (const id of g.platformIds ?? []) {
      platformIdWeight.set(id, (platformIdWeight.get(id) ?? 0) + weight)
    }

    if (weight > 0) {
      seeds.push({ title: g.title, genres: g.genres, weight })
      const y = yearOf(g.released)
      if (y) {
        yearSum += y * weight
        yearWeight += weight
      }
    }
  }

  // A disliked genre cancels evidence rather than flipping the vector negative.
  for (const key of Object.keys(genres)) if (genres[key] <= 0) delete genres[key]
  for (const key of Object.keys(platforms)) if (platforms[key] <= 0) delete platforms[key]

  return {
    genres,
    slugs,
    topGenres: Object.entries(genres)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name),
    tones,
    topTones: Object.entries(tones)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name),
    platforms,
    topPlatformIds: [...platformIdWeight.entries()]
      .filter(([, w]) => w > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id),
    seeds,
    meanYear: yearWeight > 0 ? yearSum / yearWeight : null,
    seedCount: seeds.length,
  }
}

// ---------- scoring ----------

function cosine(taste: Record<string, number>, candidate: string[]): number {
  if (candidate.length === 0) return 0
  let dot = 0
  for (const g of candidate) dot += taste[g] ?? 0
  const tasteNorm = Math.sqrt(Object.values(taste).reduce((acc, v) => acc + v ** 2, 0))
  const candNorm = Math.sqrt(candidate.length)
  if (tasteNorm === 0 || candNorm === 0) return 0
  return dot / (tasteNorm * candNorm)
}

function platformAffinity(taste: Taste, candidate: GameSummary): number {
  const owned = Object.keys(taste.platforms)
  if (owned.length === 0 || candidate.platforms.length === 0) return 0.5
  return candidate.platforms.some((p) => owned.includes(p)) ? 1 : 0
}

function qualityScore(game: GameSummary): number {
  if (game.metacritic) return Math.min(1, Math.max(0, (game.metacritic - 50) / 45))
  if (game.rating) return Math.min(1, Math.max(0, (game.rating - 2) / 3))
  return 0.4
}

function yearAffinity(game: GameSummary, meanYear: number | null): number {
  const y = yearOf(game.released)
  if (!y || !meanYear) return 0.5
  return Math.exp(-Math.abs(y - meanYear) / 12)
}

/**
 * Names the library titles this candidate actually resembles. Using the globally
 * heaviest titles instead prints the same sentence under every row, which reads as
 * boilerplate — a lesson already paid for in FilmTable.
 *
 * A second title is named only when it explains something the first one does not.
 * Bloodborne shares Action and RPG with The Witcher 3, and RPG with Stardew Valley;
 * naming both made it sound like a farming game got you here, when Stardew added
 * nothing the first title had not already covered.
 */
function reasonFor(candidate: GameSummary, taste: Taste, tones: string[] = []): string {
  // Tone leads when there is one, because "dark and tense, like The Witcher 3" says
  // something a genre list cannot. It is only ever mentioned where the reader's own
  // library shares it, so it explains the ranking rather than describing the game.
  const shared = tones.filter((t) => (taste.tones[t] ?? 0) > 0).slice(0, 2)
  const mood = shared.length ? `${shared.join(' and ')} — ` : ''
  return mood + plainReason(candidate, taste)
}

function plainReason(candidate: GameSummary, taste: Taste): string {
  const ranked = taste.seeds
    .map((seed) => {
      const shared = seed.genres.filter((g) => candidate.genres.includes(g))
      if (shared.length === 0) return null
      const union = new Set([...seed.genres, ...candidate.genres]).size
      return { title: seed.title, shared, score: (shared.length / union) * Math.sqrt(seed.weight) }
    })
    .filter((x): x is { title: string; shared: string[]; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)

  const titles: string[] = []
  const explained = new Set<string>()
  for (const { title, shared } of ranked) {
    if (titles.includes(title)) continue
    if (titles.length > 0 && shared.every((g) => explained.has(g))) continue
    titles.push(title)
    for (const g of shared) explained.add(g)
    if (titles.length === 2) break
  }
  if (titles.length === 0) {
    const shared = candidate.genres.filter((g) => (taste.genres[g] ?? 0) > 0)
    return shared.length ? `Matches your taste for ${shared.slice(0, 2).join(' and ')}` : ''
  }
  return `Because you played ${titles.join(' and ')}`
}

// ---------- candidates ----------

async function buildRecommendations(taste: Taste): Promise<Recommendation[]> {
  const seedGenres = taste.topGenres.slice(0, MAX_SEED_GENRES)
  if (seedGenres.length === 0) return []

  const pools = await Promise.all(
    seedGenres.map((name) =>
      catalogueByGenre(taste.slugs[name] ?? genreSlug(name), {
        platformIds: taste.topPlatformIds,
        ordering: '-metacritic',
        pageSize: 40,
      }).catch(() => [] as GameSummary[]),
    ),
  )

  const toneCache = useTones.getState().tones
  const owned = new Set(Object.keys(useLibrary.getState().games))
  const ownedTitles = new Set(
    Object.values(useLibrary.getState().games).map((g) => g.title.toLowerCase()),
  )

  const best = new Map<string, Recommendation>()
  for (const pool of pools) {
    for (const game of pool) {
      if (owned.has(game.id) || ownedTitles.has(game.title.toLowerCase())) continue
      const tones = toneCache[game.id] ?? []
      const score =
        SCORE.genre * cosine(taste.genres, game.genres) +
        SCORE.tone * cosine(taste.tones, tones) +
        SCORE.platform * platformAffinity(taste, game) +
        SCORE.quality * qualityScore(game) +
        SCORE.year * yearAffinity(game, taste.meanYear)
      const previous = best.get(game.id)
      if (!previous || score > previous.score) {
        best.set(game.id, { game, score, reason: reasonFor(game, taste, tones) })
      }
    }
  }

  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, RESULT_LIMIT)
}

// ---------- store ----------

/** Any library change should invalidate the cached picks. */
function librarySignature(): string {
  return Object.values(useLibrary.getState().games)
    .map((g) => `${g.id}:${g.status}:${g.hours ?? ''}:${g.rated ?? ''}`)
    .sort()
    .join(',')
}

interface RecommendState {
  items: Recommendation[]
  loading: boolean
  error: boolean
  taste: Taste | null
  signature: string
  fetchedAt: number
  load: (opts?: { force?: boolean }) => Promise<void>
}

export const useRecommend = create<RecommendState>((set, get) => ({
  items: [],
  loading: false,
  error: false,
  taste: null,
  signature: '',
  fetchedAt: 0,

  load: async (opts = {}) => {
    const state = get()
    if (state.loading) return
    const signature = librarySignature()
    const fresh = Date.now() - state.fetchedAt < CACHE_TTL_MS
    if (!opts.force && fresh && signature === state.signature && state.items.length > 0) return

    const taste = buildTaste(useLibrary.getState().games)
    if (taste.topGenres.length === 0) {
      set({ items: [], taste, signature, fetchedAt: Date.now(), error: false })
      return
    }

    set({ loading: true, error: false })
    try {
      const items = await buildRecommendations(taste)
      set({ items, taste, signature, fetchedAt: Date.now(), loading: false })
    } catch (err) {
      console.warn('recommendations failed', err)
      set({ loading: false, error: true })
    }
  },
}))
