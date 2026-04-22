import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser } from '@/api/auth'
import { AuditorLayout } from '@/components/auditor/AuditorLayout'

import AuditorLogin from '@/pages/auditor/AuditorLogin'
import AuditorDashboard from '@/pages/auditor/Dashboard'
import AuditorCreateGame from '@/pages/auditor/CreateGame'
import AuditorAddPlayers from '@/pages/auditor/AddPlayers'
import AssignProfessions from '@/pages/auditor/AssignProfessions'
import GameDashboard from '@/pages/auditor/GameDashboard'
import PlayerDetail from '@/pages/auditor/PlayerDetail'
import LogsPage from '@/pages/auditor/LogsPage'
import TransactionsPage from '@/pages/auditor/TransactionsPage'
import MarketPage from '@/pages/auditor/MarketPage'
import PlayersDirectory from '@/pages/auditor/PlayersDirectory'
import SettingsPage from '@/pages/auditor/SettingsPage'

function RequireAuditor() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  if (!token) return <Navigate to="/login" replace />
  const ok = user?.role === 'auditor' || user?.role === 'admin'
  if (!ok) return <Navigate to="/login" replace />
  return <Outlet />
}

function RootRedirect({ user }: { user: AuthUser | null }) {
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'auditor' || user.role === 'admin') return <Navigate to="/auditor/dashboard" replace />
  return <Navigate to="/login" replace />
}

export default function App() {
  const user = useAuthStore((s) => s.user)

  return (
    <Routes>
      <Route path="/login" element={<AuditorLogin />} />

      <Route element={<RequireAuditor />}>
        <Route element={<AuditorLayout />}>
          <Route path="/auditor" element={<Navigate to="/auditor/dashboard" replace />} />
          <Route path="/auditor/dashboard" element={<AuditorDashboard />} />
          <Route path="/auditor/games" element={<AuditorDashboard />} />
          <Route path="/auditor/games/new" element={<AuditorCreateGame />} />
          <Route path="/auditor/games/:gameId/players" element={<AuditorAddPlayers />} />
          <Route path="/auditor/games/:gameId/professions" element={<AssignProfessions />} />
          <Route path="/auditor/games/:gameId/players/:playerId" element={<PlayerDetail />} />
          <Route path="/auditor/games/:gameId" element={<GameDashboard />} />
          <Route path="/auditor/transactions" element={<TransactionsPage />} />
          <Route path="/auditor/market" element={<MarketPage />} />
          <Route path="/auditor/logs" element={<LogsPage />} />
          <Route path="/auditor/players" element={<PlayersDirectory />} />
          <Route path="/auditor/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="/" element={<RootRedirect user={user} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
