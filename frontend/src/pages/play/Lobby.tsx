import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { getLobby, setReady, listProfessions } from '@/api/play'
import { usePlayGameSocket } from '@/hooks/usePlayGameSocket'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, Circle } from 'lucide-react'

export default function Lobby() {
  const navigate = useNavigate()
  const token = useAuthStore((s) => s.token)
  const myPlayerId = useAuthStore((s) => s.user?.player_id)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()
  const [professionId, setProfessionId] = useState('')

  const lobbyQ = useQuery({
    queryKey: ['play_lobby', gameId],
    queryFn: () => getLobby(token!, gameId!),
    enabled: !!token && !!gameId,
    refetchInterval: 4000,
  })

  const professionsQ = useQuery({
    queryKey: ['play_professions'],
    queryFn: () => listProfessions(token!),
    enabled: !!token,
  })

  const readyMut = useMutation({
    mutationFn: () => setReady(token!, gameId!, professionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
  })

  usePlayGameSocket(token, gameId, {
    PLAYER_JOINED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    PLAYER_READY: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    GAME_STARTED: () => navigate('/play/board', { replace: true }),
  })

  useEffect(() => {
    if (lobbyQ.data?.game.status === 'in_progress') {
      navigate('/play/board', { replace: true })
    }
  }, [lobbyQ.data?.game.status, navigate])

  const me = lobbyQ.data?.players.find((p) => p.id === myPlayerId)
  const isReady = me?.ready ?? false

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lobby</h1>
        <p className="text-sm text-muted-foreground">
          Join code: <span className="font-mono font-semibold text-foreground">{lobbyQ.data?.game.join_code}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Players</CardTitle>
          <CardDescription>
            {lobbyQ.data?.players.length ?? 0} / {lobbyQ.data?.game.max_players ?? '—'} joined
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {lobbyQ.data?.players.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span>{p.name}</span>
              {p.ready ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Ready
                </Badge>
              ) : (
                <Badge variant="muted" className="gap-1">
                  <Circle className="h-3 w-3" /> Not ready
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {!isReady && (
        <Card>
          <CardHeader>
            <CardTitle>Choose your profession</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={professionId} onValueChange={setProfessionId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a profession" />
              </SelectTrigger>
              <SelectContent>
                {professionsQ.data?.map((prof) => (
                  <SelectItem key={prof.id} value={prof.id}>
                    {prof.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!professionId || readyMut.isPending}
              onClick={() => readyMut.mutate()}
              className="w-full"
            >
              {readyMut.isPending ? 'Marking ready…' : 'Ready'}
            </Button>
            {readyMut.isError && (
              <p className="text-sm text-destructive">
                {readyMut.error instanceof Error ? readyMut.error.message : 'Could not set ready.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isReady && <p className="text-sm text-muted-foreground">Waiting for the auditor to start the game…</p>}
    </div>
  )
}
