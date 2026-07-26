import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import LibraryPage from './pages/LibraryPage'
import ExplorePage from './pages/ExplorePage'
import GameDetailPage from './pages/GameDetailPage'
import ProfilePage from './pages/ProfilePage'
import InsightsPage from './pages/InsightsPage'
import { BottomNav, ConfirmHost, ScrollToTop, ToastHost } from './components/ui'
import { watchSystemTheme } from './store/theme'
import { beginSessionOnce, useStats } from './store/stats'
import { SupportFab } from './components/Support'

function Shell() {
  const location = useLocation()
  const isDetail = location.pathname.startsWith('/game/')

  useEffect(() => {
    beginSessionOnce()
    return watchSystemTheme()
  }, [])

  useEffect(() => {
    // Group per-title routes so the counter stays a handful of screens.
    const path = location.pathname
    useStats.getState().recordRoute(path.startsWith('/game/') ? '/game' : path)
  }, [location.pathname])

  return (
    <div className={`app${isDetail ? ' on-detail' : ''}`}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/game/:id" element={<GameDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="*" element={<Navigate to="/library" replace />} />
      </Routes>
      <BottomNav />
      <SupportFab />
      <ToastHost />
      <ConfirmHost />
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
