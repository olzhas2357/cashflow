import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { listGames, type GameSession } from '../api/auditorPanel'
import { GlassCard, GradientButton } from '../components/ui'
import { motion } from 'framer-motion'

export default function AuditorDashboard() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()

  const gamesQ = useQuery({
    queryKey: ['auditor_games'],
    queryFn: () => listGames(token!),
    enabled: !!token,
  })

  const games = gamesQ.data ?? []

  const hasGames = games.length > 0
  const auditorLabel = useMemo(() => (user?.player_id ? user.player_id.slice(0, 8) : 'Auditor'), [user?.player_id])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Auditor Control Panel</h1>
        <div className="text-sm text-slate-600">Signed in as: {auditorLabel}</div>
      </div>

      <div className="flex flex-wrap gap-3">
        <GradientButton onClick={() => navigate('/auditor/games/new')}>Create New Game</GradientButton>
        {hasGames ? (
          <div className="text-sm text-slate-500 pt-2">{games.length} session(s) loaded.</div>
        ) : (
          <div className="text-sm text-slate-500 pt-2">No sessions yet. Create the first one.</div>
        )}
      </div>

      {gamesQ.isLoading ? (
        <div>Loading active games...</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {games.map((g: GameSession) => (
            <motion.div
              key={g.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <GlassCard className="flex h-full flex-col justify-between gap-4">
                <div>
                  <div className="text-sm text-slate-500">Session</div>
                  <div className="mt-1 text-lg font-semibold">{g.name}</div>
                  <div className="mt-2 text-sm text-slate-600">Players: up to {g.max_players}</div>
                </div>
                <div className="flex gap-2">
                  <GradientButton className="w-full" onClick={() => navigate(`/auditor/games/${g.id}`)}>
                    Open Control Panel
                  </GradientButton>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

