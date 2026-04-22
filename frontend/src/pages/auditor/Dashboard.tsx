import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Users, Calendar, Plus } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { listGames, listPlayers } from '@/api/auditorPanel'
import type { GameSession } from '@/api/auditorPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function formatDate(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export default function AuditorDashboard() {
  const token = useAuthStore((s) => s.token)

  const gamesQ = useQuery({
    queryKey: ['auditor_games'],
    queryFn: () => listGames(token!),
    enabled: !!token,
  })

  const games = gamesQ.data ?? []

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Active Cashflow sessions you manage as auditor.</p>
        </div>
        <Button asChild>
          <Link to="/auditor/games/new" className="gap-2">
            <Plus className="h-4 w-4" />
            Create game
          </Link>
        </Button>
      </div>

      {gamesQ.isLoading && <p className="text-muted-foreground">Loading games…</p>}
      {gamesQ.isError && <p className="text-destructive">Could not load games.</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {games.map((g) => (
          <GameCard key={g.id} game={g} token={token!} />
        ))}
      </div>

      {!gamesQ.isLoading && games.length === 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>No games yet</CardTitle>
            <CardDescription>Create a session, add players, then assign professions from the board deck.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/auditor/games/new">Create your first game</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function GameCard({ game, token }: { game: GameSession; token: string }) {
  const detailQ = useQuery({
    queryKey: ['auditor_game_card', game.id],
    queryFn: async () => {
      const players = await listPlayers(token, game.id)
      const count = players.length
      let status: { label: string; variant: 'success' | 'warning' | 'muted' }
      if (count === 0) status = { label: 'Setup', variant: 'warning' }
      else if (!players.every((p) => p.profession_id)) status = { label: 'Assign professions', variant: 'warning' }
      else status = { label: 'In progress', variant: 'success' }
      return { count, status }
    },
    enabled: !!token,
  })

  const count = detailQ.data?.count ?? 0
  const st = detailQ.data?.status ?? { label: '…', variant: 'muted' as const }

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg leading-tight">{game.name}</CardTitle>
          <Badge variant={st.variant === 'success' ? 'success' : st.variant === 'warning' ? 'warning' : 'muted'}>{st.label}</Badge>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {count} / {game.max_players} players
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatDate(game.created_at)}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2 pt-0">
        <Button asChild variant="secondary" size="sm" className="flex-1">
          <Link to={`/auditor/games/${game.id}`}>Open</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/auditor/games/${game.id}/players`}>Players</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
