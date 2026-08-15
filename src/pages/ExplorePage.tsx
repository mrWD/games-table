import { useEffect, useRef } from 'react'
import { useExplore } from '../store/explore'
import { useRecommend } from '../store/recommend'
import { GameResultRow } from '../components/cards'
import { SectionLabel, SkeletonRows } from '../components/ui'
import { IconSearch, IconX } from '../components/Icons'
import { ToneBackfill } from '../components/ToneBackfill'

/**
 * What to say when the catalogue answers nothing.
 *
 * There are two different situations behind that, and only one of them is the
 * reader's business. Running `npm run dev` without the proxy is a developer's own
 * doing, and the fix is a command. Everywhere else — the deployed site, and the
 * installed app on someone's phone — the proxy is running and the outage is upstream
 * at RAWG or Steam; telling that person to "start it locally, or deploy it" is advice
 * they cannot act on and reads as the app being broken.
 *
 * `import.meta.env.DEV` is exactly the line between the two: true only under the dev
 * server, false in every build that ships.
 */
const CATALOGUE_DOWN = import.meta.env.DEV
  ? 'Catalogue unavailable. Both sources are reached through a small proxy — start it locally, or deploy it, and search will work.'
  : 'The games catalogue is not answering right now. This is on their side, not yours — your library is untouched. Try again later.'

function ForYou() {
  const { items, loading, error, taste, load } = useRecommend()

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // An empty library has nothing to reason from — the shelves below answer better.
  if (!loading && items.length === 0 && (taste?.topGenres.length ?? 0) === 0) return null

  return (
    <section>
      <div className="h2-row">
        <h2 className="h2">For you</h2>
        <button className="textbtn" onClick={() => void load({ force: true })} disabled={loading}>
          Refresh
        </button>
      </div>
      {taste && taste.topGenres.length > 0 && (
        <p className="chips-hint">
          Based on {taste.seedCount} game{taste.seedCount === 1 ? '' : 's'} in your library ·{' '}
          {taste.topGenres.slice(0, 3).join(', ')}
          {taste.topTones.length > 0 && ` · you lean ${taste.topTones.join(', ')}`}
        </p>
      )}
      {loading && items.length === 0 && <SkeletonRows count={3} />}
      {error && items.length === 0 && (
        <p className="hint">Could not build recommendations right now.</p>
      )}
      {items.map((r) => (
        <GameResultRow key={r.game.id} game={r.game} reason={r.reason} />
      ))}
      <ToneBackfill items={items} onLearned={() => void load({ force: true })} />
    </section>
  )
}

export default function ExplorePage() {
  const { query, results, searching, failed, popular, upcoming, discoverLoading, discoverSource, setQuery, runSearch, loadDiscover } =
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
              {failed ? CATALOGUE_DOWN : `No games found for “${query.trim()}”.`}
            </p>
          )}
        </>
      ) : (
        <>
          <ForYou />
          {discoverLoading && popular.length === 0 && <SkeletonRows count={3} />}
          {popular.length > 0 && (
            <section>
              <SectionLabel>{discoverSource === 'steam' ? 'New on Steam' : 'Popular now'}</SectionLabel>
              {popular.map((game) => (
                <GameResultRow key={game.id} game={game} />
              ))}
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <SectionLabel>
                {discoverSource === 'steam' ? 'Coming soon on Steam' : 'Coming soon'}
              </SectionLabel>
              {upcoming.map((game) => (
                <GameResultRow key={game.id} game={game} />
              ))}
            </section>
          )}
          {!discoverLoading && popular.length === 0 && upcoming.length === 0 && (
            <p className="hint">{CATALOGUE_DOWN}</p>
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
