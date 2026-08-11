import { create } from 'zustand'
import { popularGames, searchGames, upcomingGames, type DiscoverSource } from '../lib/api'
import type { GameSummary } from '../lib/types'
import { stats } from './stats'

interface ExploreState {
  query: string
  results: GameSummary[]
  searching: boolean
  failed: boolean

  popular: GameSummary[]
  upcoming: GameSummary[]
  discoverLoading: boolean
  discoverSource: DiscoverSource

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
  discoverSource: 'rawg',

  setQuery: (query) => set({ query }),

  runSearch: async (q) => {
    const mine = ++seq
    const term = q.trim()
    if (!term) {
      set({ results: [], searching: false, failed: false })
      return
    }
    set({ searching: true, failed: false })
    stats.search()
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
    const empty = { games: [] as GameSummary[], source: 'rawg' as DiscoverSource }
    const [popular, upcoming] = await Promise.all([
      popularGames().catch(() => empty),
      upcomingGames().catch(() => empty),
    ])
    set({
      popular: popular.games,
      upcoming: upcoming.games,
      // Either section can fall back on its own; the screen labels itself from
      // whichever actually produced games.
      discoverSource: popular.games.length ? popular.source : upcoming.source,
      discoverLoading: false,
    })
  },
}))
