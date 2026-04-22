import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { listGames, listPlayers } from '@/api/auditorPanel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function PlayersDirectory() {
  const token = useAuthStore((s) => s.token)

  const gamesQ = useQuery({
    queryKey: ['auditor_games'],
    queryFn: () => listGames(token!),
    enabled: !!token,
  })

  const games = gamesQ.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Players</h1>
        <p className="text-muted-foreground">Everyone currently seated across your sessions.</p>
      </div>

      <div className="space-y-6">
        {games.map((g) => (
          <GamePlayers key={g.id} gameId={g.id} name={g.name} token={token!} />
        ))}
        {games.length === 0 && <p className="text-muted-foreground">No games.</p>}
      </div>
    </div>
  )
}

function GamePlayers({ gameId, name, token }: { gameId: string; name: string; token: string }) {
  const q = useQuery({
    queryKey: ['auditor_players', gameId],
    queryFn: () => listPlayers(token, gameId),
    enabled: !!token && !!gameId,
  })
  const players = q.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>
          <Link className="text-primary hover:underline" to={`/auditor/games/${gameId}`}>
            Open session
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {players.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <Link className="font-medium text-primary hover:underline" to={`/auditor/games/${gameId}/players/${p.id}`}>
                  {p.name}
                </Link>
                <div className="font-mono text-sm text-muted-foreground">{money(p.cash)} cash</div>
              </div>
              {p.profession_id ? <Badge variant="success">Ready</Badge> : <Badge variant="warning">No profession</Badge>}
            </li>
          ))}
          {players.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">No players.</li>}
        </ul>
      </CardContent>
    </Card>
  )
}
