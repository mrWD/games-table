import { useState } from 'react'
import { useLibrary } from '../store/library'
import { gamesByStatus, STATUS_LABEL, TAB_STATUSES, type Tab } from '../store/selectors'
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
  const games = useLibrary((s) => s.games)

  const statuses = TAB_STATUSES[tab]
  const sections = statuses.map((status) => ({ status, list: gamesByStatus(games, status) }))
  const isEmpty = sections.every((s) => s.list.length === 0)

  return (
    <div className="page">
      <TopTabs tabs={TABS} active={tab} onChange={(t) => setTab(t as Tab)} />
      {isEmpty ? (
        <EmptyState
          icon={<IconPad size={44} strokeWidth={1.4} />}
          title={EMPTY_COPY[tab].title}
          text={EMPTY_COPY[tab].text}
          actionLabel="Find games"
          actionTo="/explore"
        />
      ) : (
        sections.map(({ status, list }) =>
          list.length === 0 ? null : (
            <section key={status}>
              {/* The WATCH tab holds two intents, so its sections stay labelled. */}
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
