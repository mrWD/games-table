import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BackupFile, GameStatus, GameSummary, TrackedGame } from '../lib/types'
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

export const useLibrary = create<LibraryState>()(
  persist(
    (set) => ({
      games: {},

      setStatus: (game, status) => {
        // Outside the updater on purpose: StrictMode runs it twice.
        useStats.getState().recordStatusChange()
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
    { name: 'gamestable-library-v1', version: 1 },
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
