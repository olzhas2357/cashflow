import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Trash2, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { addPlayers, getGame, listPlayers, removePlayer } from '@/api/auditorPanel'
import type { UserPlayer } from '@/api/auditorPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

export default function AuditorAddPlayers() {
  const token = useAuthStore((s) => s.token)
  const { gameId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const gameQ = useQuery({
    queryKey: ['auditor_game', gameId],
    queryFn: () => getGame(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const playersQ = useQuery({
    queryKey: ['auditor_players', gameId],
    queryFn: () => listPlayers(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const [rawNames, setRawNames] = useState('')
  const [error, setError] = useState<string | null>(null)

  const addM = useMutation({
    mutationFn: () => addPlayers(token!, gameId!, { names: parseNames(rawNames) }),
    onSuccess: () => {
      setRawNames('')
      qc.invalidateQueries({ queryKey: ['auditor_players', gameId] })
      qc.invalidateQueries({ queryKey: ['auditor_games'] })
      qc.invalidateQueries({ queryKey: ['auditor_game_card', gameId] })
    },
    onError: (e: Error) => setError(e.message),
  })

  const removeM = useMutation({
    mutationFn: (playerId: string) => removePlayer(token!, gameId!, playerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auditor_players', gameId] })
      qc.invalidateQueries({ queryKey: ['auditor_games'] })
    },
  })

  const players = playersQ.data ?? []
  const maxPlayers = gameQ.data?.max_players ?? 6
  const atCapacity = players.length >= maxPlayers

  useEffect(() => {
    setError(null)
  }, [rawNames])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="gap-2" asChild>
          <Link to={`/auditor/games/${gameId}`}>
            <ArrowLeft className="h-4 w-4" />
            Game
          </Link>
        </Button>
        <Button onClick={() => navigate(`/auditor/games/${gameId}/professions`)} disabled={players.length === 0}>
          Next: professions
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Players</h1>
        <p className="text-muted-foreground">
          {gameQ.data?.name ?? '…'} — {players.length}/{maxPlayers} seats
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add player</CardTitle>
          <CardDescription>One name per line (or comma-separated). Dummy login accounts are created for each seat.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            placeholder={'Alex\nSam\nJordan'}
            value={rawNames}
            disabled={atCapacity}
            onChange={(e) => setRawNames(e.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => addM.mutate()}
              disabled={addM.isPending || parseNames(rawNames).length === 0 || atCapacity}
            >
              {atCapacity ? 'Table full' : addM.isPending ? 'Adding…' : 'Add players'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setRawNames('')}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
          <CardDescription>Remove a seat before professions if someone drops out.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Profession</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No players yet.
                  </TableCell>
                </TableRow>
              ) : (
                players.map((p: UserPlayer) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      {p.profession_id ? (
                        <Badge variant="success">Assigned</Badge>
                      ) : (
                        <Badge variant="warning">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        disabled={removeM.isPending}
                        onClick={() => {
                          if (confirm(`Remove ${p.name} from this game?`)) removeM.mutate(p.id)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function parseNames(raw: string): string[] {
  return raw
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
}
