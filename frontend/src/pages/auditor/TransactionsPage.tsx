import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { approveTransaction, listGames, listPendingTransactions, rejectTransaction } from '@/api/auditorPanel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function TransactionsPage() {
  const token = useAuthStore((s) => s.token)
  const qc = useQueryClient()
  const [gameId, setGameId] = useState('')

  const gamesQ = useQuery({
    queryKey: ['auditor_games'],
    queryFn: () => listGames(token!),
    enabled: !!token,
  })
  const games = gamesQ.data ?? []
  const gid = gameId || games[0]?.id || ''

  const pendingQ = useQuery({
    queryKey: ['auditor_pending_txs', gid],
    queryFn: () => listPendingTransactions(token!, gid),
    enabled: !!token && !!gid,
  })

  const approveM = useMutation({
    mutationFn: (txId: string) => approveTransaction(token!, gid, txId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auditor_pending_txs', gid] }),
  })
  const rejectM = useMutation({
    mutationFn: (txId: string) => rejectTransaction(token!, gid, txId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auditor_pending_txs', gid] }),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-muted-foreground">Approve or reject pending player-to-player sales.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>Open the game dashboard for full context.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label>Game</Label>
            <select
              className="flex h-10 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm"
              value={gid}
              onChange={(e) => setGameId(e.target.value)}
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          {gid && (
            <Button variant="outline" asChild>
              <Link to={`/auditor/games/${gid}`}>Open game</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(pendingQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No pending transactions.</p>}
          {(pendingQ.data ?? []).map((p) => {
            const tx = p.transaction
            const asset = tx.market_offer?.asset
            return (
              <div key={tx.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{asset?.name ?? 'Asset'}</div>
                  <Badge>{money(tx.offer_price)}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Buyer liquidity after: {money(p.buyer_cash_after)} · Seller receives cash impact per rules on approve.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => approveM.mutate(tx.id)} disabled={approveM.isPending}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => rejectM.mutate(tx.id)} disabled={rejectM.isPending}>
                    Reject
                  </Button>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
