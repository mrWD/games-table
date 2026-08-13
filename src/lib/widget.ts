import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from 'tables-core'
import type { GameStatus, TrackedGame } from './types'
import { useLibrary } from '../store/library'

/**
 * Feeding the home-screen widgets.
 *
 * The widgets run outside the app and cannot read its storage, so what they show is a
 * snapshot the app pushes into a shared App Group. It is built from the same library the
 * shelves read, so the two cannot drift apart.
 *
 * Nothing is sent anywhere. The App Group is on-device storage shared between two of our
 * own processes; the library still never leaves the phone.
 */

interface WidgetBridgePlugin {
  write(options: { json: string }): Promise<void>
  cachePoster(options: { name: string; url: string }): Promise<void>
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge')

interface Entry {
  id: string
  title: string
  status: string
  platform?: string
  hours?: number
  score?: number
  cover?: string
}

/** Five rows fit a large widget and two a medium one; more would only be written. */
const LIMIT = 5

/**
 * The widget says the status in the app's own words. Both tracks appear together — a
 * game being watched as a longplay is as much "in progress" as one being played, which
 * is the whole point of the second track.
 */
const LABEL: Record<GameStatus, string> = {
  playing: 'Playing',
  watching: 'Watching',
  backlog: 'Want to play',
  'to-watch': 'Want to watch',
  played: 'Played',
  watched: 'Watched',
  dropped: 'Dropped',
}

/** Stable, filesystem-safe name: ids carry a source prefix and a colon. */
function coverName(gameId: string): string {
  return `game-${gameId.replace(/[^\w.-]/g, '-')}.jpg`
}

function toEntry(game: TrackedGame): Entry {
  return {
    id: game.id,
    title: game.title,
    status: LABEL[game.status] ?? game.status,
    platform: game.platform ?? game.platforms?.[0],
    hours: game.hours,
    score: game.metacritic ?? undefined,
    cover: game.cover ? coverName(game.id) : undefined,
  }
}

export async function refreshWidgets(): Promise<void> {
  if (!isNativeApp()) return
  try {
    const { games } = useLibrary.getState()
    const all = Object.values(games)

    // Most recently started first: the widget answers "what am I in the middle of".
    const playing: Entry[] = all
      .filter((g) => g.status === 'playing' || g.status === 'watching')
      .sort((a, b) => (b.startedAt ?? b.addedAt) - (a.startedAt ?? a.addedAt))
      .slice(0, LIMIT)
      .map(toEntry)

    // Oldest first: a backlog sorted newest-first buries the game that has been waiting
    // two years under whatever was added yesterday — and that game is the point of a
    // backlog.
    const backlog: Entry[] = all
      .filter((g) => g.status === 'backlog' || g.status === 'to-watch')
      .sort((a, b) => a.addedAt - b.addedAt)
      .slice(0, LIMIT)
      .map(toEntry)

    await WidgetBridge.write({
      json: JSON.stringify({ playing, backlog, updatedAt: Date.now() }),
    })

    // Covers go over after the snapshot: the widget should get its text immediately and
    // fill in pictures as they land, rather than wait for both.
    for (const game of [...playing, ...backlog]) {
      const url = games[game.id]?.cover
      if (!game.cover || !url) continue
      await WidgetBridge.cachePoster({ name: coverName(game.id), url }).catch(() => {})
    }
  } catch (err) {
    // A widget that fails to update is not a reason for anything in the app to break,
    // but staying silent about it cost an hour once — so it says so where the device log
    // can see it.
    console.error('[widget] refresh failed', err)
  }
}
