import { useEffect } from 'react'
import { useLibrary } from '../store/library'
import { useTones } from '../store/tone'
import type { Recommendation } from '../store/recommend'

/**
 * Reads the tone of everything on screen, quietly, after the screen is already there.
 *
 * Recommendations appear first, ranked by genre exactly as before, and the order settles
 * a few seconds later once tones are known — rather than making anyone wait for a model
 * that some phones do not have at all. Measured at about 0.6 s a description warm and 1.7
 * s cold, so a library plus a screenful is on the order of half a minute, once, and never
 * again: the answers are cached by id.
 *
 * One at a time on purpose. The device runs a single model, so firing twelve requests
 * together only queues them, and doing it in sequence leaves the interface responsive
 * between them.
 */
export function ToneBackfill({
  items,
  onLearned,
}: {
  items: Recommendation[]
  /** Called once, only if something new was read — the ranking is cached and stale now. */
  onLearned: () => void
}) {
  const games = useLibrary((s) => s.games)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const { ensure } = useTones.getState()
      const before = Object.keys(useTones.getState().tones).length
      // A tracked game usually has no description here: the library drops that field
      // before saving, deliberately, because it costs more than the rest of an entry
      // combined. So a library tone is read on the game's own page, where the
      // description is in hand, and only the three words are kept. The loop stays for
      // the entries still holding one from this session.
      for (const game of Object.values(games)) {
        if (cancelled) return
        if (game.description) await ensure(game.id, game.description, true)
      }
      for (const { game } of items) {
        if (cancelled) return
        if (game.description) await ensure(game.id, game.description, false)
      }
      if (!cancelled && Object.keys(useTones.getState().tones).length > before) onLearned()
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [games, items])

  return null
}
