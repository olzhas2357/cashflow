import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { useHostAuthStore } from '@/store/hostAuthStore'
import type { AuthUser } from '@/api/auth'
import { AuditorLayout } from '@/components/auditor/AuditorLayout'
import { PlayLayout } from '@/components/play/PlayLayout'

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
import SmallDealsPage from '@/pages/auditor/SmallDealsPage'
import BigDealsPage from '@/pages/auditor/BigDealsPage'
import MarketEventsPage from '@/pages/auditor/MarketEventsPage'
import PlayersDirectory from '@/pages/auditor/PlayersDirectory'
import SettingsPage from '@/pages/auditor/SettingsPage'

import LandingPage from '@/pages/LandingPage'
import JoinGame from '@/pages/play/JoinGame'
import OnboardingScreen from '@/pages/play/OnboardingScreen'
import Lobby from '@/pages/play/Lobby'
import Board from '@/pages/play/Board'
import MyAssets from '@/pages/play/MyAssets'

import RoomRegister from '@/pages/room/Register'
import RoomLogin from '@/pages/room/Login'
import RoomDashboard from '@/pages/room/Dashboard'
import RoomJoin from '@/pages/room/Join'
import Room from '@/pages/room/Room'

function RequireAuditor() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  if (!token) return <Navigate to="/login" replace />
  const ok = user?.role === 'auditor' || user?.role === 'admin'
  if (!ok) return <Navigate to="/login" replace />
  return <Outlet />
}

function RequirePlayer() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const gameId = usePlayStore((s) => s.gameId)
  if (!token || user?.role !== 'player') return <Navigate to="/login" replace />
  if (!gameId) return <Navigate to="/play/join" replace />
  return <Outlet />
}

function RequireHost() {
  const token = useHostAuthStore((s) => s.token)
  if (!token) return <Navigate to="/host/login" replace />
  return <Outlet />
}

function RootRedirect({ user }: { user: AuthUser | null }) {
  if (!user) return <LandingPage />
  if (user.role === 'auditor' || user.role === 'admin') return <Navigate to="/auditor/dashboard" replace />
  if (user.role === 'player') return <Navigate to="/play/lobby" replace />
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
          <Route path="/auditor/market/small-deals" element={<SmallDealsPage />} />
          <Route path="/market/small-deals" element={<SmallDealsPage />} />
          <Route path="/auditor/market/big-deals" element={<BigDealsPage />} />
          <Route path="/market/big-deals" element={<BigDealsPage />} />
          <Route path="/auditor/market/events" element={<MarketEventsPage />} />
          <Route path="/market/events" element={<MarketEventsPage />} />
          <Route path="/auditor/logs" element={<LogsPage />} />
          <Route path="/auditor/players" element={<PlayersDirectory />} />
          <Route path="/auditor/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="/play/join" element={<JoinGame />} />
      <Route element={<RequirePlayer />}>
        <Route path="/play/onboarding" element={<OnboardingScreen />} />
        <Route element={<PlayLayout />}>
          <Route path="/play/lobby" element={<Lobby />} />
          <Route path="/play/board" element={<Board />} />
          <Route path="/play/assets" element={<MyAssets />} />
        </Route>
      </Route>

      {/* Stage-1 room/host test flow (design/Task-Testing.md) — separate
          from the auditor/player flows above. /login is already taken by
          AuditorLogin, so this flow lives under /host/*. */}
      <Route path="/host/register" element={<RoomRegister />} />
      <Route path="/host/login" element={<RoomLogin />} />
      <Route element={<RequireHost />}>
        <Route path="/host/dashboard" element={<RoomDashboard />} />
      </Route>
      <Route path="/room/:code" element={<Room />} />
      <Route path="/join/:code" element={<RoomJoin />} />

      <Route path="/" element={<RootRedirect user={user} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
