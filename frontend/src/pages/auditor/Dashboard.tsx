import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Users, Calendar, Plus, Copy, Check, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { listGames, listPlayers, deleteGame, deleteAllGames } from '@/api/auditorPanel'
import type { GameSession } from '@/api/auditorPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function JoinCodeRow({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — ignore, code is still visible to read/type manually
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-2">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Join code</div>
        <div className="font-mono text-lg font-bold tracking-widest text-primary">{code}</div>
      </div>
      <Button type="button" size="icon" variant="ghost" onClick={copy} title="Copy join code">
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  )
}

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
  const qc = useQueryClient()

  const gamesQ = useQuery({
    queryKey: ['auditor_games'],
    queryFn: () => listGames(token!),
    enabled: !!token,
  })

  const games = gamesQ.data ?? []

  const deleteAllMut = useMutation({
    mutationFn: () => deleteAllGames(token!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auditor_games'] }),
  })

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Active Cashflow sessions you manage as auditor.</p>
        </div>
        <div className="flex gap-2">
          {games.length > 0 && (
            <Button
              variant="outline"
              className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={deleteAllMut.isPending}
              onClick={() => {
                if (
                  confirm(
                    `Delete all ${games.length} game(s)? This permanently removes every game you manage, along with their players, assets, and history.`,
                  )
                ) {
                  deleteAllMut.mutate()
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete all
            </Button>
          )}
          <Button asChild>
            <Link to="/auditor/games/new" className="gap-2">
              <Plus className="h-4 w-4" />
              Create game
            </Link>
          </Button>
        </div>
      </div>

      {deleteAllMut.isError && (
        <p className="text-sm text-destructive">
          {deleteAllMut.error instanceof Error ? deleteAllMut.error.message : 'Could not delete all games.'}
        </p>
      )}
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
  const qc = useQueryClient()
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

  const deleteMut = useMutation({
    mutationFn: () => deleteGame(token, game.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auditor_games'] }),
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
      <CardContent className="pb-0 pt-0">
        <JoinCodeRow code={game.join_code} />
      </CardContent>
      <CardContent className="flex gap-2 pt-2">
        <Button asChild variant="secondary" size="sm" className="flex-1">
          <Link to={`/auditor/games/${game.id}`}>Open</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/auditor/games/${game.id}/players`}>Players</Link>
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
          title="Delete game"
          disabled={deleteMut.isPending}
          onClick={() => {
            if (confirm(`Delete "${game.name}"? This permanently removes all its players, assets, and history.`)) {
              deleteMut.mutate()
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
      {deleteMut.isError && (
        <CardContent className="pt-0">
          <p className="text-xs text-destructive">
            {deleteMut.error instanceof Error ? deleteMut.error.message : 'Could not delete game.'}
          </p>
        </CardContent>
      )}
    </Card>
  )
}
