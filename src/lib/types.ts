/**
 * Two parallel tracks — playing and watching — plus dropped.
 *
 * Watching mirrors playing on purpose: a game may not be out yet, or the longplay may
 * be ten hours you get through over a week, so "watching now" is as real a state as
 * "playing now".
 */
export type GameStatus =
  | 'playing'
  | 'backlog'
  | 'played'
  | 'watching'
  | 'to-watch'
  | 'watched'
  | 'dropped'

/** A game as the catalogue describes it, before it belongs to anyone. */
export interface GameSummary {
  /** Prefixed by source: 'rawg:3498' or 'steam:292030'. */
  id: string
  title: string
  cover: string | null
  released: string | null
  genres: string[]
  platforms: string[]
  metacritic: number | null
  rating: number | null
  description?: string
  playtimeHours?: number | null
  /** RAWG slugs and parent-platform ids: the catalogue filters by these, not by names. */
  genreSlugs?: string[]
  platformIds?: number[]
}

/** A game once it is in the library: the catalogue snapshot plus what you did with it. */
export interface TrackedGame extends GameSummary {
  status: GameStatus
  addedAt: number
  startedAt?: number
  finishedAt?: number
  /** Your own score, 1–10. */
  rated?: number
  hours?: number
  note?: string
  /**
   * The platform you actually played or watched on. Held as one of the game's own
   * platform names rather than free text, so the library can pick it out of the list
   * it already shows instead of repeating it.
   */
  platform?: string
}

export interface BackupFile {
  app: 'gamestable'
  version: 1
  exportedAt: string
  games: Record<string, TrackedGame>
}
