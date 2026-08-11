import { useRef } from 'react'
import { buildBackup, isValidBackup, useLibrary } from '../store/library'
import { buildStats, STATUS_LABEL, STATUS_ORDER } from '../store/selectors'
import { useUi } from '../store/ui'
import { useTheme, type ThemeChoice } from '../store/theme'
import { useStats } from '../store/stats'
import { AutoBackup } from '../components/AutoBackup'
import { exportJsonFile, isNativeApp } from 'tables-core'
import { native } from '../lib/native'
import { formatHours } from '../lib/format'
import { IconDownload, IconPad, IconTrash, IconUpload } from '../components/Icons'
import { SupportLinks } from '../components/Support'
import { Feedback } from '../components/Feedback'

const THEMES: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: 'system', label: 'SYSTEM', hint: 'Following your device setting.' },
  { value: 'light', label: 'LIGHT', hint: 'Always light, whatever the device is set to.' },
  { value: 'dark', label: 'DARK', hint: 'Always dark, whatever the device is set to.' },
]

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

/**
 * The library exists only in this browser: clearing site data wipes it, and Safari's
 * tracking prevention can clear it on its own for a site that lives in a tab. A backup is
 * the only defence, so once there is enough to lose, say so — quietly, and not forever.
 */
function BackupNudge({ items }: { items: number }) {
  const lastExportAt = useStats((s) => s.lastExportAt)
  if (items < 15) return null
  const days = lastExportAt ? Math.floor((Date.now() - lastExportAt) / 86400000) : null
  if (days !== null && days < 60) return null
  return (
    <p className="chips-hint">
      {days === null
        ? `${items} entries and no backup yet — export one, it is a single file.`
        : `Last backup was ${days} days ago.`}
    </p>
  )
}

export default function ProfilePage() {
  const games = useLibrary((s) => s.games)
  const importBackup = useLibrary((s) => s.importBackup)
  const resetAll = useLibrary((s) => s.resetAll)
  const showToast = useUi((s) => s.showToast)
  const askConfirm = useUi((s) => s.askConfirm)
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const fileRef = useRef<HTMLInputElement>(null)

  const stats = buildStats(games)

  const doExport = async () => {
    const name = `gamestable-backup-${new Date().toISOString().slice(0, 10)}.json`
    const outcome = await exportJsonFile(buildBackup(), name, native)
    // Closing the share sheet is an answer, not an error; a real failure has to be said
    // out loud, or someone walks away believing they have a backup.
    if (outcome === 'cancelled') return
    if (outcome === 'failed') {
      showToast('Export failed — the backup was not saved')
      return
    }
    useStats.getState().recordExport()
    showToast('Backup exported')
  }

  const doImport = async (file: File) => {
    try {
      const data: unknown = JSON.parse(await file.text())
      if (!isValidBackup(data)) throw new Error('not a GamesTable backup')
      const ok = await askConfirm({
        title: 'Import backup?',
        message: 'Your current library will be replaced by the backup contents.',
        confirmLabel: 'Import',
      })
      if (!ok) return
      importBackup(data)
      showToast('Backup imported')
    } catch (err) {
      console.warn(err)
      showToast('Import failed: not a valid backup file')
    }
  }

  return (
    <div className="page profile">
      <div className="profile-head">
        <div className="avatar">
          <IconPad size={34} strokeWidth={1.6} />
        </div>
        <h1>My games</h1>
        <p className="profile-sub">Stored on this device · no account needed</p>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat-num">{stats.byStatus.played}</span>
          <span className="stat-label">PLAYED</span>
        </div>
        <div className="stat">
          <span className="stat-num">{stats.byStatus.playing}</span>
          <span className="stat-label">PLAYING</span>
        </div>
        <div className="stat">
          <span className="stat-num">{formatHours(stats.hours) || '0h'}</span>
          <span className="stat-label">LOGGED</span>
        </div>
        <div className="stat">
          <span className="stat-num">
            {stats.averageRating ? stats.averageRating.toFixed(1) : '—'}
          </span>
          <span className="stat-label">AVG SCORE</span>
        </div>
      </div>
      <p className="chips-hint">
        {stats.total} games tracked · {stats.finishedThisYear} finished this year
      </p>

      {stats.total > 0 && (
        <>
          <h2 className="h2">By status</h2>
          <Bars data={STATUS_ORDER.map((s) => [STATUS_LABEL[s], stats.byStatus[s]] as [string, number]).filter(([, v]) => v > 0)} />
        </>
      )}

      {stats.topPlatforms.length > 0 && (
        <>
          <h2 className="h2">Platforms</h2>
          <Bars data={stats.topPlatforms} />
        </>
      )}

      {stats.topGenres.length > 0 && (
        <>
          <h2 className="h2">Genres</h2>
          <Bars data={stats.topGenres} />
        </>
      )}

      <h2 className="h2">Appearance</h2>
      <div className="chips">
        {THEMES.map((t) => (
          <button
            key={t.value}
            className={`chip${theme === t.value ? ' active' : ''}`}
            onClick={() => setTheme(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="chips-hint">{THEMES.find((t) => t.value === theme)?.hint}</p>

      <h2 className="h2">Data</h2>
      <BackupNudge items={Object.keys(games).length} />
      <div className="datacard">
        <button className="datarow" onClick={() => void doExport()}>
          <IconDownload size={20} />
          <div>
            <div className="datarow-title">Export backup</div>
            <div className="datarow-sub">
              {/* In the app the file goes to the share sheet, not a download folder. */}
              {isNativeApp()
                ? 'Save your library as a JSON file'
                : 'Download your library as a JSON file'}
            </div>
          </div>
        </button>
        <button className="datarow" onClick={() => fileRef.current?.click()}>
          <IconUpload size={20} />
          <div>
            <div className="datarow-title">Import backup</div>
            <div className="datarow-sub">Restore from a GamesTable backup file</div>
          </div>
        </button>
        <AutoBackup />
        <button
          className="datarow danger"
          onClick={async () => {
            const ok = await askConfirm({
              title: 'Reset everything?',
              message: 'All games and notes on this device will be deleted.',
              confirmLabel: 'Delete all',
              danger: true,
            })
            if (ok) {
              resetAll()
              showToast('Library cleared')
            }
          }}
        >
          <IconTrash size={20} />
          <div>
            <div className="datarow-title">Reset all data</div>
            <div className="datarow-sub">Delete the whole library from this device</div>
          </div>
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void doImport(f)
          e.target.value = ''
        }}
      />

      <h2 className="h2">Feedback &amp; contact</h2>
      <Feedback />

      <h2 className="h2">Support</h2>
      <SupportLinks />

      <h2 className="h2">More from the author</h2>
      <p className="attribution">
        <a href="https://mrwd.github.io/" target="_blank" rel="noreferrer">
          All products &rarr;
        </a>
      </p>

      <p className="attribution">
        GamesTable · a free, fan-made, local-first tracker · not affiliated with RAWG, Valve,
        YouTube or Twitch
      </p>
      <p className="attribution">Game data from RAWG and Steam · build {__BUILD_TIME__}</p>
    </div>
  )
}
