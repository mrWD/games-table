import { useState } from 'react'
import { useLibrary } from '../store/library'
import {
  gamesByStatus,
  STATUS_LABEL,
  TAB_STATUSES,
  WATCH_FILTERS,
  watchFilterLabel,
  type Tab,
  type WatchFilter,
} from '../store/selectors'
import { GameRow } from '../components/cards'
import { EmptyState, SectionLabel, TopTabs } from '../components/ui'
import { IconPad } from '../components/Icons'

const TABS: Tab[] = ['PLAYING', 'BACKLOG', 'PLAYED', 'WATCH']

const EMPTY_COPY: Record<Tab, { title: string; text: string }> = {
  PLAYING: { title: 'Nothing in progress', text: 'Games you start will show up here.' },
  BACKLOG: { title: 'Backlog is empty', text: 'Add games you plan to get to.' },
  PLAYED: { title: 'Nothing finished yet', text: 'Games you complete land here.' },
  WATCH: {
    title: 'Nothing to watch',
    text: 'Games you would rather watch than play — a longplay or a game movie — go here.',
  },
}

export default function LibraryPage() {
  const [tab, setTab] = useState<Tab>('PLAYING')
  const [watchFilter, setWatchFilter] = useState<WatchFilter>('ALL')
  const games = useLibrary((s) => s.games)

  const tabStatuses = TAB_STATUSES[tab]
  const statuses = tab === 'WATCH' && watchFilter !== 'ALL' ? [watchFilter] : tabStatuses

  const sections = statuses.map((status) => ({ status, list: gamesByStatus(games, status) }))
  const isEmpty = sections.every((s) => s.list.length === 0)
  // A filter hiding everything is not the same as an empty tab, and should not send the
  // user off to find games when the tab already has some.
  const tabHasGames = tabStatuses.some((status) => gamesByStatus(games, status).length > 0)

  return (
    <div className="page">
      <TopTabs tabs={TABS} active={tab} onChange={(t) => setTab(t as Tab)} />

      {tab === 'WATCH' && tabHasGames && (
        <div className="chips watchfilter">
          {WATCH_FILTERS.map((f) => (
            <button
              key={f}
              className={`chip${watchFilter === f ? ' active' : ''}`}
              aria-pressed={watchFilter === f}
              onClick={() => setWatchFilter(f)}
            >
              {watchFilterLabel(f).toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {isEmpty ? (
        tabHasGames ? (
          <p className="hint">No games with this status yet.</p>
        ) : (
          <EmptyState
            icon={<IconPad size={44} strokeWidth={1.4} />}
            title={EMPTY_COPY[tab].title}
            text={EMPTY_COPY[tab].text}
            actionLabel="Find games"
            actionTo="/explore"
          />
        )
      ) : (
        sections.map(({ status, list }) =>
          list.length === 0 ? null : (
            <section key={status}>
              {/* Labels earn their place only when more than one status is on screen. */}
              {statuses.length > 1 && <SectionLabel>{STATUS_LABEL[status]}</SectionLabel>}
              {list.map((game) => (
                <GameRow key={game.id} game={game} />
              ))}
            </section>
          ),
        )
      )}
    </div>
  )
}
