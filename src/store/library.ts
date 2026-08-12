import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { BackupFile, GameStatus, GameSummary, TrackedGame } from '../lib/types'
import { successFeedback, tapFeedback } from '../lib/native-ui'
import { deviceStorage } from '../lib/storage'
import { useStats } from './stats'

/**
 * The whole user library. Unlike FilmTable's shows there is no separate metadata cache:
 * a game's details never change once it ships, so the catalogue snapshot is stored with
 * the entry and the library stays fully readable offline.
 */

interface LibraryState {
  games: Record<string, TrackedGame>

  setStatus: (game: GameSummary, status: GameStatus) => void
  changeStatus: (id: string, status: GameStatus) => void
  remove: (id: string) => void
  rate: (id: string, rated: number | undefined) => void
  setHours: (id: string, hours: number | undefined) => void
  setNote: (id: string, note: string) => void
  setPlatform: (id: string, platform: string | undefined) => void
  updateMeta: (id: string, patch: Partial<GameSummary>) => void

  importBackup: (b: BackupFile) => void
  resetAll: () => void
}

/** Timestamps let the profile answer "what did I finish this month" without a journal. */
function withTimestamps(game: TrackedGame, status: GameStatus, now: number): TrackedGame {
  const next = { ...game, status }
  if ((status === 'playing' || status === 'watching') && !next.startedAt) next.startedAt = now
  if ((status === 'played' || status === 'watched') && !next.finishedAt) next.finishedAt = now
  // Moving back to an intention means it is not finished any more.
  if (status === 'backlog' || status === 'to-watch') delete next.finishedAt
  return next
}

/** Drops the one field that costs more than everything else in an entry combined. */
function withoutDescriptions(
  games: Record<string, TrackedGame>,
): Record<string, TrackedGame> {
  const out: Record<string, TrackedGame> = {}
  for (const [id, game] of Object.entries(games)) {
    if (game.description === undefined) {
      out[id] = game
      continue
    }
    const { description: _drop, ...rest } = game
    out[id] = rest as TrackedGame
  }
  return out
}

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      games: {},

      setStatus: (game, status) => {
        // Outside the updater on purpose: StrictMode runs it twice.
        useStats.getState().recordStatusChange()
        // Reaching an end state is the moment worth feeling; the rest is a tick.
        if (status === 'played' || status === 'watched') successFeedback()
        else tapFeedback()
        set((s) => {
          const now = Date.now()
          const existing = s.games[game.id]
          const base: TrackedGame = existing
            ? { ...existing, ...game, id: existing.id }
            : { ...game, status, addedAt: now }
          return { games: { ...s.games, [game.id]: withTimestamps(base, status, now) } }
        })
      },

      changeStatus: (id, status) => {
        useStats.getState().recordStatusChange()
        if (status === 'played' || status === 'watched') successFeedback()
        else tapFeedback()
        set((s) => {
          const g = s.games[id]
          if (!g) return s
          return { games: { ...s.games, [id]: withTimestamps(g, status, Date.now()) } }
        })
      },

      remove: (id) =>
        set((s) => {
          const games = { ...s.games }
          delete games[id]
          return { games }
        }),

      rate: (id, rated) =>
        set((s) => {
          const g = s.games[id]
          if (!g) return s
          const next = { ...g }
          if (rated == null) delete next.rated
          else next.rated = rated
          return { games: { ...s.games, [id]: next } }
        }),

      setHours: (id, hours) =>
        set((s) => {
          const g = s.games[id]
          if (!g) return s
          const next = { ...g }
          if (hours == null || Number.isNaN(hours)) delete next.hours
          else next.hours = hours
          return { games: { ...s.games, [id]: next } }
        }),

      setNote: (id, note) =>
        set((s) => {
          const g = s.games[id]
          if (!g) return s
          return { games: { ...s.games, [id]: { ...g, note } } }
        }),

      setPlatform: (id, platform) =>
        set((s) => {
          const g = s.games[id]
          if (!g) return s
          const next = { ...g }
          if (platform == null) delete next.platform
          else next.platform = platform
          return { games: { ...s.games, [id]: next } }
        }),

      /** Search results are lighter than the detail endpoint; fill the gaps later. */
      updateMeta: (id, patch) =>
        set((s) => {
          const g = s.games[id]
          if (!g) return s
          return { games: { ...s.games, [id]: { ...g, ...patch, id: g.id } } }
        }),

      importBackup: (b) => set({ games: b.games ?? {} }),
      resetAll: () => set({ games: {} }),
    }),
    {
      name: 'gamestable-library-v1',
      version: 1,
      // IndexedDB in a browser, a file in private app storage natively — and one
      // migration each way behind it (see lib/storage.ts). Hydration is async either
      // way, so main.tsx holds the first render until it settles.
      storage: createJSONStorage(() => deviceStorage),
      // Descriptions are re-fetched whenever a detail page opens and are never shown in a
      // list, yet storing them tripled a game entry — 407 bytes to 1229 for Elden Ring.
      // Keep them in memory for the session; never write them.
      partialize: (s) => ({ games: withoutDescriptions(s.games) }),
    },
  ),
)

export function buildBackup(): BackupFile {
  return {
    app: 'gamestable',
    version: 1,
    exportedAt: new Date().toISOString(),
    games: useLibrary.getState().games,
  }
}

export function isValidBackup(data: unknown): data is BackupFile {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Partial<BackupFile>
  return d.app === 'gamestable' && d.version === 1 && typeof d.games === 'object'
}
