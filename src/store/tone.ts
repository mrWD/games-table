import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { pickTone } from '../lib/tone'

/**
 * How a game feels, read off its own description by the on-device model.
 *
 * The recommender knows genres, and "sci-fi" covers both The Expanse and Rick and Morty.
 * Tone is the axis it was missing, and the only way to get it without a backend is to
 * read the description the app already downloaded — which is transformation of given
 * text, the one thing a 3B model is reliable at. Measured on four real descriptions,
 * three runs each: the strongest tag was identical every time (Breaking Bad dark and
 * tense, Ted Lasso funny, Hollow Knight epic) and the third tag wandered. So a library
 * title is read twice and only what both runs agree on is kept.
 *
 * Derived data, so it lives in a cache and not the library: it is not in the backup, and
 * deleting it costs a few seconds rather than anything a person typed.
 */

/** Kept small on purpose — a long list invites the model to spread its answers. */
export const TONES = [
  'slow', 'fast', 'dark', 'bleak', 'cosy', 'warm', 'funny', 'grim', 'tense',
  'hopeful', 'violent', 'gentle', 'lonely', 'epic', 'intimate', 'weird',
  'grindy', 'relaxing',
] as const

interface ToneState {
  /** Game id to the tags agreed on. An empty array means "asked, nothing agreed". */
  tones: Record<string, string[]>
  /** In flight, so two screens asking at once do not both pay for it. */
  pending: Record<string, true>
  ensure: (id: string, description: string, confident: boolean) => Promise<void>
  clear: () => void
}

export const useTones = create<ToneState>()(
  persist(
    (set, get) => ({
      tones: {},
      pending: {},

      ensure: async (id, description, confident) => {
        if (get().tones[id] || get().pending[id]) return
        if (!description || description.trim().length < 40) return
        set((s) => ({ pending: { ...s.pending, [id]: true } }))
        try {
          // Twice for a library title, whose tone shapes every recommendation; once for a
          // candidate, where a stray third tag moves one row and has to match the reader's
          // own tones to move it at all. Measured at ~0.6s a call warm, so the cheaper
          // path is what makes reading a screenful of candidates practical.
          const first = await pickTone(description)
          if (first === null) return
          const agreed = confident
            ? ((await pickTone(description)) ?? []).filter((t) => first.includes(t))
            : first
          set((s) => ({ tones: { ...s.tones, [id]: agreed } }))
        } finally {
          set((s) => {
            const pending = { ...s.pending }
            delete pending[id]
            return { pending }
          })
        }
      },

      clear: () => set({ tones: {} }),
    }),
    {
      name: 'gamestable-tones',
      // Nothing in flight survives a reload, and stale "pending" would block a retry.
      partialize: (s) => ({ tones: s.tones }),
    },
  ),
)
