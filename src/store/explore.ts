import { create } from 'zustand'
import { popularGames, searchGames, upcomingGames } from '../lib/api'
import type { GameSummary } from '../lib/types'

interface ExploreState {
  query: string
  results: GameSummary[]
  searching: boolean
  failed: boolean

  popular: GameSummary[]
  upcoming: GameSummary[]
  discoverLoading: boolean

  setQuery: (q: string) => void
  runSearch: (q: string) => Promise<void>
  loadDiscover: () => Promise<void>
}

let seq = 0

export const useExplore = create<ExploreState>((set, get) => ({
  query: '',
  results: [],
  searching: false,
  failed: false,

  popular: [],
  upcoming: [],
  discoverLoading: false,

  setQuery: (query) => set({ query }),

  runSearch: async (q) => {
    const mine = ++seq
    const term = q.trim()
    if (!term) {
      set({ results: [], searching: false, failed: false })
      return
    }
    set({ searching: true, failed: false })
    try {
      const results = await searchGames(term)
      // A slower earlier search must not overwrite a newer one.
      if (mine === seq) set({ results, searching: false, failed: results.length === 0 })
    } catch (err) {
      console.warn('search failed', err)
      if (mine === seq) set({ searching: false, failed: true })
    }
  },

  loadDiscover: async () => {
    if (get().popular.length > 0 || get().discoverLoading) return
    set({ discoverLoading: true })
    const [popular, upcoming] = await Promise.all([
      popularGames().catch(() => [] as GameSummary[]),
      upcomingGames().catch(() => [] as GameSummary[]),
    ])
    set({ popular, upcoming, discoverLoading: false })
  },
}))
