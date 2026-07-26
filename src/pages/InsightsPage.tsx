import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStats, type SourceName } from '../store/stats'
import { useLibrary } from '../store/library'
import { buildStats } from '../store/selectors'
import { formatDate, formatHours } from '../lib/format'
import { useUi } from '../store/ui'
import { isPersisted } from '../lib/durability'
import { IconBack } from '../components/Icons'

/**
 * Hidden diagnostics page (/insights) — not linked from the navigation.
 * Everything is computed on this device from counters that hold no personal data:
 * no search terms, no titles, no identifiers, and nothing is sent anywhere.
 */

const ROUTE_LABELS: Record<string, string> = {
  '/library': 'Library',
  '/explore': 'Explore',
  '/profile': 'Profile',
  '/game': 'Game details',
  '/insights': 'Insights',
}

interface Environment {
  display: string
  serviceWorker: string
  storageUsedMb: string | null
  storageQuotaMb: string | null
  libraryKb: string
  online: boolean
  storagePersisted: boolean
  language: string
  buildTime: string
}

function kb(text: string): string {
  return `${Math.round(new Blob([text]).size / 1024)} KB`
}

async function readEnvironment(): Promise<Environment> {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => null)
  let used: string | null = null
  let quota: string | null = null
  try {
    const est = await navigator.storage?.estimate()
    if (est?.usage != null) used = (est.usage / 1_048_576).toFixed(1)
    if (est?.quota != null) quota = (est.quota / 1_048_576).toFixed(0)
  } catch {
    /* not supported */
  }
  return {
    display: window.matchMedia('(display-mode: standalone)').matches
      ? 'Installed (standalone)'
      : 'Browser tab',
    serviceWorker: reg?.active?.state ?? 'not registered',
    storageUsedMb: used,
    storageQuotaMb: quota,
    libraryKb: kb(localStorage.getItem('gamestable-library-v1') ?? ''),
    online: navigator.onLine,
    storagePersisted: await isPersisted(),
    language: navigator.language,
    buildTime: __BUILD_TIME__,
  }
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="stat">
      <span className="stat-num">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function Bars({ data }: { data: [string, number][] }) {
  const max = Math.max(1, ...data.map(([, v]) => v))
  return (
    <div className="barlist">
      {data.map(([label, value]) => (
        <div key={label} className="barrow">
          <span className="barrow-label">{label}</span>
          <span className="barrow-track">
            <span className="barrow-fill" style={{ width: `${(value / max) * 100}%` }} />
          </span>
          <span className="barrow-value">{value}</span>
        </div>
      ))}
    </div>
  )
}

/** 13 weeks of activity, newest on the right. */
function ActivityStrip({ days }: { days: string[] }) {
  const set = new Set(days)
  const cells: { key: string; active: boolean }[] = []
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  for (let i = 90; i >= 0; i--) {
    const d = new Date(start.getTime() - i * 86400000)
    const key = d.toISOString().slice(0, 10)
    cells.push({ key, active: set.has(key) })
  }
  return (
    <div className="activity" aria-label="Days the app was opened, last 90 days">
      {cells.map((c) => (
        <span key={c.key} className={`activity-cell${c.active ? ' on' : ''}`} title={c.key} />
      ))}
    </div>
  )
}

export default function InsightsPage() {
  const navigate = useNavigate()
  const s = useStats()
  const reset = useStats((x) => x.reset)
  const games = useLibrary((x) => x.games)
  const askConfirm = useUi((x) => x.askConfirm)
  const showToast = useUi((x) => x.showToast)
  const [env, setEnv] = useState<Environment | null>(null)

  useEffect(() => {
    void readEnvironment().then(setEnv)
  }, [])

  const library = buildStats(games)
  const daysKnown = s.firstVisit
    ? Math.max(1, Math.round((Date.now() - s.firstVisit) / 86400000))
    : 0
  const stickiness = daysKnown > 0 ? Math.round((s.activeDays.length / daysKnown) * 100) : 0

  const routes = Object.entries(s.routeViews).sort((a, b) => b[1] - a[1])
  const sources = (['rawg', 'steam'] as SourceName[])
    .map((name) => [name.toUpperCase(), s.sourceHits[name] ?? 0] as [string, number])
    .filter(([, v]) => v > 0)
  const errors = (['rawg', 'steam'] as SourceName[])
    .map((name) => [name.toUpperCase(), s.sourceErrors[name] ?? 0] as [string, number])
    .filter(([, v]) => v > 0)

  return (
    <div className="page insights">
      <div className="insights-head">
        <button className="iconbtn" onClick={() => navigate(-1)} aria-label="Back">
          <IconBack size={22} />
        </button>
        <h1>Insights</h1>
      </div>
      <p className="chips-hint">
        Counted on this device only. No search terms, no titles, no identifiers — nothing is
        sent anywhere.
      </p>

      <h2 className="h2">Usage</h2>
      <div className="stats">
        <Stat value={s.sessions} label="SESSIONS" />
        <Stat value={s.activeDays.length} label="ACTIVE DAYS" />
        <Stat value={`${stickiness}%`} label="OF DAYS USED" />
        <Stat value={s.searches} label="SEARCHES" />
      </div>
      {s.firstVisit && (
        <p className="chips-hint">
          First opened {formatDate(new Date(s.firstVisit).toISOString().slice(0, 10))}
        </p>
      )}
      {s.activeDays.length > 0 && <ActivityStrip days={s.activeDays} />}

      <h2 className="h2">Engagement</h2>
      <div className="stats">
        <Stat value={s.statusChanges} label="STATUS MOVES" />
        <Stat value={s.watchLinksOpened} label="WATCH LINKS" />
        <Stat value={library.total} label="GAMES TRACKED" />
        <Stat value={formatHours(library.hours) || '0h'} label="HOURS LOGGED" />
      </div>
      <p className="chips-hint">
        {library.byStatus.played} played · {library.byStatus.watched} watched ·{' '}
        {library.byStatus.backlog + library.byStatus['to-watch']} queued ·{' '}
        {library.byStatus.dropped} dropped
      </p>

      {routes.length > 0 && (
        <>
          <h2 className="h2">Screens opened</h2>
          <Bars data={routes.map(([r, v]) => [ROUTE_LABELS[r] ?? r, v])} />
        </>
      )}

      {(sources.length > 0 || errors.length > 0) && (
        <>
          <h2 className="h2">Which source answered</h2>
          {sources.length > 0 && <Bars data={sources} />}
          {errors.length > 0 && (
            <>
              <p className="chips-hint">Failures (fell back to another source)</p>
              <Bars data={errors} />
            </>
          )}
          <p className="chips-hint">
            RAWG at zero means the proxy has no key and only Steam is answering — console
            games will be missing.
          </p>
        </>
      )}

      <h2 className="h2">Environment</h2>
      {env && (
        <div className="datacard">
          {[
            ['Mode', env.display],
            ['Service worker', env.serviceWorker],
            ['Network', env.online ? 'online' : 'offline'],
            [
              'Storage',
              env.storagePersisted
                ? 'persistent — the browser will not evict it on its own'
                : 'best effort — may be evicted; installing the app helps',
            ],
            [
              'Storage used',
              env.storageUsedMb ? `${env.storageUsedMb} MB of ${env.storageQuotaMb} MB` : 'n/a',
            ],
            ['Library size', env.libraryKb],
            ['Language', env.language],
            ['Build', env.buildTime],
          ].map(([k, v]) => (
            <div className="datarow" key={k}>
              <div>
                <div className="datarow-title">{k}</div>
                <div className="datarow-sub">{v}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        className="textbtn danger"
        onClick={async () => {
          const ok = await askConfirm({
            title: 'Reset these counters?',
            message: 'Usage counters go back to zero. Your library is not affected.',
            confirmLabel: 'Reset',
            danger: true,
          })
          if (ok) {
            reset()
            showToast('Counters reset')
          }
        }}
      >
        Reset counters
      </button>
      <p className="attribution">
        Hidden page · reachable at /#/insights · not linked from the navigation
      </p>
    </div>
  )
}
