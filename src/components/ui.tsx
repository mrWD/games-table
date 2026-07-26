import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useUi } from '../store/ui'
import { IconLibrary, IconPad, IconSearch, IconUser } from './Icons'

const NAV = [
  { to: '/library', label: 'Library', icon: IconLibrary },
  { to: '/explore', label: 'Explore', icon: IconSearch },
  { to: '/profile', label: 'Profile', icon: IconUser },
]

export function BottomNav() {
  return (
    <nav className="bottomnav">
      <div className="bottomnav-inner">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `navitem${isActive ? ' active' : ''}`}
          >
            <Icon size={24} strokeWidth={1.7} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function TopTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[]
  active: string
  onChange: (t: string) => void
}) {
  return (
    <div className="toptabs">
      {tabs.map((t) => (
        <button key={t} className={`toptab${t === active ? ' active' : ''}`} onClick={() => onChange(t)}>
          {t}
        </button>
      ))}
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="sectionlabel">{children}</div>
}

export function Badge({
  variant = 'plain',
  children,
}: {
  variant?: 'plain' | 'accent' | 'good' | 'dim'
  children: ReactNode
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}

export function Cover({
  src,
  alt,
  className,
}: {
  src?: string | null
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={`cover cover-fallback ${className ?? ''}`}>
        <IconPad size={26} strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <img
      className={`cover ${className ?? ''}`}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

/** Metacritic uses green/yellow/red bands; mirroring them makes the number readable. */
export function MetaScore({ score }: { score: number | null }) {
  if (!score) return null
  const band = score >= 75 ? 'good' : score >= 50 ? 'mixed' : 'bad'
  return <span className={`metascore metascore-${band}`}>{score}</span>
}

export function ToastHost() {
  const toast = useUi((s) => s.toast)
  const dismiss = useUi((s) => s.dismissToast)
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <span className="toast-msg">{toast.message}</span>
      {toast.undo && (
        <button
          className="toast-undo"
          onClick={() => {
            toast.undo?.()
            dismiss()
          }}
        >
          UNDO
        </button>
      )}
    </div>
  )
}

export function ConfirmHost() {
  const req = useUi((s) => s.confirmReq)
  const answer = useUi((s) => s.answerConfirm)
  if (!req) return null
  return (
    <div className="modal-backdrop" onClick={() => answer(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{req.title}</h3>
        <p>{req.message}</p>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => answer(false)}>
            Cancel
          </button>
          <button className={`btn ${req.danger ? 'danger' : ''}`} onClick={() => answer(true)}>
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  actionTo,
}: {
  icon: ReactNode
  title: string
  text: string
  actionLabel?: string
  actionTo?: string
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {actionLabel && actionTo && (
        <Link to={actionTo} className="btn">
          {actionLabel}
        </Link>
      )}
    </div>
  )
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div className="skel-list">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card skel-card">
          <div className="skel skel-cover" />
          <div className="skel-lines">
            <div className="skel skel-line w70" />
            <div className="skel skel-line w40" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
