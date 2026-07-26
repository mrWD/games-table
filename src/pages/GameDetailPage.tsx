import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { GameSummary } from '../lib/types'
import { lookupGame } from '../lib/api'
import { watchLinks } from '../lib/watch'
import { formatDate, formatHours, isYearOnly, shortPlatform, yearOf } from '../lib/format'
import { useLibrary } from '../store/library'
import { useUi } from '../store/ui'
import { useStats } from '../store/stats'
import { StatusPicker } from '../components/cards'
import { Cover, MetaScore } from '../components/ui'
import { IconBack, IconExternal, IconTrash } from '../components/Icons'

export default function GameDetailPage() {
  const { id: rawId } = useParams()
  const id = decodeURIComponent(String(rawId))
  const navigate = useNavigate()
  const location = useLocation()
  const passed = (location.state as { game?: GameSummary } | null)?.game

  const tracked = useLibrary((s) => s.games[id])
  const rate = useLibrary((s) => s.rate)
  const setHours = useLibrary((s) => s.setHours)
  const setNote = useLibrary((s) => s.setNote)
  const remove = useLibrary((s) => s.remove)
  const updateMeta = useLibrary((s) => s.updateMeta)
  const showToast = useUi((s) => s.showToast)
  const askConfirm = useUi((s) => s.askConfirm)

  const [fetched, setFetched] = useState<GameSummary | null>(null)
  const known = tracked ?? passed
  const game: GameSummary | undefined = known
    ? { ...known, ...(fetched ? { description: fetched.description ?? known.description } : {}) }
    : (fetched ?? undefined)

  useEffect(() => {
    // Search results carry no description; fetch details unless we already have them.
    if (known?.description) return
    void lookupGame(id).then((g) => {
      if (!g) return
      setFetched(g)
      if (useLibrary.getState().games[id]) updateMeta(id, g)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!game) {
    return (
      <div className="page detail">
        <button className="floatback" onClick={() => navigate(-1)} aria-label="Back">
          <IconBack size={22} />
        </button>
        <div className="detail-body">
          <div className="skel skel-line w70" />
          <div className="skel skel-line w40" />
        </div>
      </div>
    )
  }

  const meta = [
    yearOf(game.released),
    game.platforms.slice(0, 4).map(shortPlatform).join(', '),
    game.genres.slice(0, 3).join(', '),
  ]
    .filter(Boolean)
    .join(' • ')

  return (
    <div className="page detail">
      <div className="hero">
        <Cover src={game.cover} alt={game.title} className="hero-img" />
        <div className="hero-grad" />
        <button className="floatback" onClick={() => navigate(-1)} aria-label="Back">
          <IconBack size={22} />
        </button>
      </div>

      <div className="detail-body">
        <div className="detail-titlerow">
          <h1 className="detail-title">{game.title}</h1>
          <MetaScore score={game.metacritic} />
        </div>
        {meta && <div className="detail-meta">{meta}</div>}
        {game.released && !isYearOnly(game.released) && (
          <div className="detail-meta dim">Released {formatDate(game.released)}</div>
        )}
        {game.playtimeHours ? (
          <div className="detail-meta dim">
            Typically about {formatHours(game.playtimeHours)} to play
          </div>
        ) : null}

        <h2 className="h2">Status</h2>
        <StatusPicker game={game} current={tracked?.status} />

        {tracked && (
          <>
            <h2 className="h2">Your notes</h2>
            <div className="panel">
              <label className="field">
                <span>Your score</span>
                <div className="ratingrow">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      className={`ratebtn${tracked.rated === n ? ' active' : ''}`}
                      onClick={() => rate(id, tracked.rated === n ? undefined : n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </label>

              <label className="field">
                <span>Hours played</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.5}
                  value={tracked.hours ?? ''}
                  placeholder="—"
                  onChange={(e) =>
                    setHours(id, e.target.value === '' ? undefined : Number(e.target.value))
                  }
                />
              </label>

              <label className="field">
                <span>Note</span>
                <textarea
                  rows={3}
                  value={tracked.note ?? ''}
                  placeholder="Where you stopped, what to remember…"
                  onChange={(e) => setNote(id, e.target.value)}
                />
              </label>
            </div>
          </>
        )}

        <h2 className="h2">Watch instead</h2>
        <p className="hint left">
          Opens a search — no player is embedded and nothing is tracked.
        </p>
        <div className="watchlinks">
          {watchLinks(game.title).map((link) => (
            <a
              key={link.label}
              className={`watchlink ${link.host}`}
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => useStats.getState().recordWatchLink()}
            >
              {link.label}
              <IconExternal size={15} strokeWidth={2} />
            </a>
          ))}
        </div>

        {game.description && <p className="detail-about">{game.description}</p>}

        {tracked && (
          <button
            className="textbtn danger"
            onClick={async () => {
              const ok = await askConfirm({
                title: `Remove ${game.title}?`,
                message: 'The game and your notes will be removed from the library.',
                confirmLabel: 'Remove',
                danger: true,
              })
              if (ok) {
                remove(id)
                showToast(`${game.title} removed`)
                navigate(-1)
              }
            }}
          >
            <IconTrash size={16} /> Remove from library
          </button>
        )}

        <p className="attribution">Game data from RAWG and Steam</p>
      </div>
    </div>
  )
}
