import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { gameLogs, listGames, listPlayers } from '@/api/auditorPanel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function LogsPage() {
  const token = useAuthStore((s) => s.token)
  const [gameId, setGameId] = useState<string>('')
  const [playerFilter, setPlayerFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const gamesQ = useQuery({
    queryKey: ['auditor_games'],
    queryFn: () => listGames(token!),
    enabled: !!token,
  })

  const games = gamesQ.data ?? []
  const firstId = games[0]?.id ?? ''
  const activeGame = gameId || firstId

  const playersQ = useQuery({
    queryKey: ['auditor_players', activeGame],
    queryFn: () => listPlayers(token!, activeGame),
    enabled: !!token && !!activeGame,
  })

  const logsQ = useQuery({
    queryKey: ['auditor_logs', activeGame],
    queryFn: () => gameLogs(token!, activeGame),
    enabled: !!token && !!activeGame,
  })

  const filtered = useMemo(() => {
    let rows = logsQ.data ?? []
    if (playerFilter) rows = rows.filter((l) => l.player_id === playerFilter)
    if (typeFilter) rows = rows.filter((l) => l.type.toLowerCase().includes(typeFilter.toLowerCase()))
    if (from) {
      const t = new Date(from).getTime()
      rows = rows.filter((l) => new Date(l.created_at).getTime() >= t)
    }
    if (to) {
      const t = new Date(to).getTime()
      rows = rows.filter((l) => new Date(l.created_at).getTime() <= t)
    }
    return rows.slice().reverse()
  }, [logsQ.data, playerFilter, typeFilter, from, to])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Financial logs</h1>
        <p className="text-muted-foreground">Chronological ledger — filter by session, player, and type.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Select a game session first.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label>Game</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={activeGame}
              onChange={(e) => setGameId(e.target.value)}
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Player</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={playerFilter}
              onChange={(e) => setPlayerFilter(e.target.value)}
            >
              <option value="">All</option>
              {(playersQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Event type contains</Label>
            <Input value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} placeholder="payday, doodad…" />
          </div>
          <div className="space-y-1">
            <Label>From</Label>
            <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>To</Label>
            <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entries ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {new Date(l.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{l.player_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{l.type}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{money(l.amount)}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-muted-foreground">{l.description ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No rows match.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
