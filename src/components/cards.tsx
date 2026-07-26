import { Link } from 'react-router-dom'
import type { GameStatus, GameSummary, TrackedGame } from '../lib/types'
import { formatHours, shortPlatform, yearOf } from '../lib/format'
import { useLibrary } from '../store/library'
import { useUi } from '../store/ui'
import { STATUS_GROUPS, STATUS_LABEL } from '../store/selectors'
import { Badge, Cover, MetaScore } from './ui'
import { IconCheck, IconPlus } from './Icons'

function subtitle(game: GameSummary): string {
  return [yearOf(game.released), game.platforms.slice(0, 3).map(shortPlatform).join(', ')]
    .filter(Boolean)
    .join(' • ')
}

/** Row used in the library: cover, meta, and whatever the player recorded. */
export function GameRow({ game }: { game: TrackedGame }) {
  const marks = [
    game.rated ? `★ ${game.rated}/10` : '',
    formatHours(game.hours),
  ].filter(Boolean)

  return (
    <Link className="card gamecard" to={`/game/${encodeURIComponent(game.id)}`}>
      <Cover src={game.cover} alt={game.title} className="gamecard-cover" />
      <div className="gamecard-body">
        <div className="gametitle">{game.title}</div>
        <div className="gamesub">{subtitle(game)}</div>
        {game.genres.length > 0 && (
          <div className="gamesub dim">{game.genres.slice(0, 2).join(', ')}</div>
        )}
        {marks.length > 0 && <div className="gamemarks">{marks.join(' · ')}</div>}
      </div>
      <div className="gamecard-right">
        <MetaScore score={game.metacritic} />
      </div>
    </Link>
  )
}

/** Search result: same shape, but the action adds it instead of opening it. */
export function GameResultRow({ game, reason }: { game: GameSummary; reason?: string }) {
  const inLib = useLibrary((s) => s.games[game.id])
  return (
    <Link className="card gamecard" to={`/game/${encodeURIComponent(game.id)}`} state={{ game }}>
      <Cover src={game.cover} alt={game.title} className="gamecard-cover" />
      <div className="gamecard-body">
        <div className="gametitle">{game.title}</div>
        <div className="gamesub">{subtitle(game)}</div>
        {inLib ? (
          <div className="gamemarks">
            <Badge variant="accent">{STATUS_LABEL[inLib.status]}</Badge>
          </div>
        ) : reason ? (
          <div className="reason">{reason}</div>
        ) : null}
      </div>
      <div className="gamecard-right">
        <MetaScore score={game.metacritic} />
        {inLib ? (
          <span className="addmark added" aria-label="In your library">
            <IconCheck size={18} strokeWidth={2.6} />
          </span>
        ) : (
          <span className="addmark" aria-hidden="true">
            <IconPlus size={18} strokeWidth={2.4} />
          </span>
        )}
      </div>
    </Link>
  )
}

/**
 * The app's central control: a game is not "checked in" like an episode, it moves
 * between statuses, so the picker is the primary action rather than a settings detail.
 */
export function StatusPicker({
  game,
  current,
}: {
  game: GameSummary
  current: GameStatus | undefined
}) {
  const setStatus = useLibrary((s) => s.setStatus)
  const changeStatus = useLibrary((s) => s.changeStatus)
  const showToast = useUi((s) => s.showToast)

  const pick = (status: (typeof STATUS_GROUPS)[number]['statuses'][number]) => {
    const previous = current
    if (current) changeStatus(game.id, status)
    else setStatus(game, status)
    showToast(
      `${game.title} → ${STATUS_LABEL[status]}`,
      previous ? () => changeStatus(game.id, previous) : undefined,
    )
  }

  return (
    <div className="statusgroups">
      {STATUS_GROUPS.map((group) => (
        <div key={group.label} className="statusgroup">
          <span className="statusgroup-label">{group.label}</span>
          <div className="statuspicker">
            {group.statuses.map((status) => {
              const active = current === status
              return (
                <button
                  key={status}
                  className={`statuschip${active ? ' active' : ''}`}
                  aria-pressed={active}
                  onClick={() => pick(status)}
                >
                  {STATUS_LABEL[status]}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
