import { useEffect, useRef } from 'react'
import { useExplore } from '../store/explore'
import { GameResultRow } from '../components/cards'
import { SectionLabel, SkeletonRows } from '../components/ui'
import { IconSearch, IconX } from '../components/Icons'

export default function ExplorePage() {
  const { query, results, searching, failed, popular, upcoming, discoverLoading, setQuery, runSearch, loadDiscover } =
    useExplore()
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadDiscover()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onInput = (value: string) => {
    setQuery(value)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => void runSearch(value), 350)
  }

  const hasQuery = query.trim().length > 0

  return (
    <div className="page">
      <div className="searchwrap">
        <div className="searchbar">
          <IconSearch size={20} strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search games"
            onChange={(e) => onInput(e.target.value)}
            autoCorrect="off"
            autoCapitalize="off"
          />
          {hasQuery && (
            <button
              className="searchclear"
              aria-label="Clear search"
              onClick={() => {
                setQuery('')
                void runSearch('')
                inputRef.current?.focus()
              }}
            >
              <IconX size={16} strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>

      {hasQuery ? (
        <>
          {searching && <SkeletonRows count={4} />}
          {!searching &&
            results.map((game) => <GameResultRow key={game.id} game={game} />)}
          {!searching && results.length === 0 && (
            <p className="hint">
              {failed
                ? 'Nothing found. If this keeps happening, the catalogue proxy may be unreachable.'
                : `No games found for “${query.trim()}”.`}
            </p>
          )}
        </>
      ) : (
        <>
          {discoverLoading && popular.length === 0 && <SkeletonRows count={3} />}
          {popular.length > 0 && (
            <section>
              <SectionLabel>Popular now</SectionLabel>
              {popular.map((game) => (
                <GameResultRow key={game.id} game={game} />
              ))}
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <SectionLabel>Coming soon</SectionLabel>
              {upcoming.map((game) => (
                <GameResultRow key={game.id} game={game} />
              ))}
            </section>
          )}
          {!discoverLoading && popular.length === 0 && upcoming.length === 0 && (
            <p className="hint">
              Catalogue unavailable. Both sources are reached through a small proxy — start it
              locally, or deploy it, and search will work.
            </p>
          )}
          <p className="attribution">
            Game data from{' '}
            <a href="https://rawg.io" target="_blank" rel="noreferrer">
              RAWG
            </a>{' '}
            and Steam
          </p>
        </>
      )}
    </div>
  )
}
