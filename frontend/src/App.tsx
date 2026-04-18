import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useNegotiationSocket } from './hooks/useNegotiationSocket'
import { AppShell } from './components/AppShell'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import MarketDeals from './pages/MarketDeals'
import AuditorDashboard from './pages/AuditorDashboard'
import Landing from './pages/Landing'
import LearnFinance from './pages/LearnFinance'
import StartGame from './pages/StartGame'
import AuditorCreateGame from './pages/auditor/CreateGame'
import AuditorAddPlayers from './pages/auditor/AddPlayers'
import AuditorAssignProfessions from './pages/auditor/AssignProfessions'
import AuditorGameControlPanel from './pages/auditor/GameControlPanel'
import type { AuthUser } from './api/auth'

function ProtectedRoute({ user, allowed, children }: { user: AuthUser | null; allowed: AuthUser['role'][]; children: React.ReactNode }) {
  if (!user) return <Navigate to="/login" replace />
  if (!allowed.includes(user.role)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  // Only connect WS for player-facing live negotiations (not auditor pages).
  // Also limit to routes where it matters to reduce noise.
  const location = useLocation()
  const enableWS =
    !!token &&
    user?.role === 'player' &&
    (location.pathname.startsWith('/market') || location.pathname.startsWith('/dashboard'))
  useNegotiationSocket(token, enableWS)

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/learn" element={<LearnFinance />} />
        <Route
          path="/start-game"
          element={<ProtectedRoute user={user} allowed={['player']} children={<StartGame />} />}
        />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={<ProtectedRoute user={user} allowed={['player', 'auditor', 'admin']} children={<Dashboard />} />}
        />
        <Route
          path="/market"
          element={<ProtectedRoute user={user} allowed={['player', 'auditor', 'admin']} children={<MarketDeals />} />}
        />
        <Route
          path="/auditor"
          element={<ProtectedRoute user={user} allowed={['auditor', 'admin']} children={<AuditorDashboard />} />}
        />
        <Route
          path="/auditor/games/new"
          element={<ProtectedRoute user={user} allowed={['auditor', 'admin']} children={<AuditorCreateGame />} />}
        />
        <Route
          path="/auditor/games/:gameId/players"
          element={<ProtectedRoute user={user} allowed={['auditor', 'admin']} children={<AuditorAddPlayers />} />}
        />
        <Route
          path="/auditor/games/:gameId/professions"
          element={<ProtectedRoute user={user} allowed={['auditor', 'admin']} children={<AuditorAssignProfessions />} />}
        />
        <Route
          path="/auditor/games/:gameId"
          element={<ProtectedRoute user={user} allowed={['auditor', 'admin']} children={<AuditorGameControlPanel />} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}

