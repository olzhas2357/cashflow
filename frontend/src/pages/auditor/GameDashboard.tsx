import type { ElementType } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Baby,
  Banknote,
  Building2,
  Coins,
  Gift,
  HeartHandshake,
  LineChart,
  UserMinus,
  ArrowLeftRight,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import {
  approveTransaction,
  createMarketSell,
  financeOverview,
  gameAssets,
  gameLogs,
  getGame,
  listBigDeals,
  listDoodads,
  listMarketEvents,
  listPendingTransactions,
  listSmallDeals,
  postEventBaby,
  postEventBigDeal,
  postEventCharity,
  postEventDoodad,
  postEventDownsized,
  postEventPayday,
  postEventSmallDeal,
  rejectTransaction,
  type GameAsset,
  type PlayerFinanceDTO,
} from '@/api/auditorPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const SMALL_CATS = [
  { value: 'small_deal_assets', label: 'Stock' },
  { value: 'small_deal_real_estate', label: 'Real estate' },
  { value: 'small_deal_business', label: 'Business' },
  { value: 'small_deal_deposite_certificate', label: 'Deposit certificate' },
  { value: 'small_deal_assets_news', label: 'Stock news' },
  { value: 'small_deal_real_estate_news', label: 'RE news' },
] as const

export default function GameDashboard() {
  const token = useAuthStore((s) => s.token)
  const { gameId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const gameQ = useQuery({
    queryKey: ['auditor_game', gameId],
    queryFn: () => getGame(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const financeQ = useQuery({
    queryKey: ['auditor_finance', gameId],
    queryFn: () => financeOverview(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const logsQ = useQuery({
    queryKey: ['auditor_logs', gameId],
    queryFn: () => gameLogs(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const pendingQ = useQuery({
    queryKey: ['auditor_pending_txs', gameId],
    queryFn: () => listPendingTransactions(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const assetsQ = useQuery({
    queryKey: ['auditor_assets', gameId],
    queryFn: () => gameAssets(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const smallQ = useQuery({
    queryKey: ['auditor_small_deals'],
    queryFn: () => listSmallDeals(token!),
    enabled: !!token,
  })
  const bigQ = useQuery({
    queryKey: ['auditor_big_deals'],
    queryFn: () => listBigDeals(token!),
    enabled: !!token,
  })
  const doodadsQ = useQuery({
    queryKey: ['auditor_doodads'],
    queryFn: () => listDoodads(token!),
    enabled: !!token,
  })
  const marketQ = useQuery({
    queryKey: ['auditor_market_events'],
    queryFn: () => listMarketEvents(token!),
    enabled: !!token,
  })
  const finance = financeQ.data ?? []
  const players = finance.map((f) => f.player)

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['auditor_finance', gameId] })
    await qc.invalidateQueries({ queryKey: ['auditor_logs', gameId] })
    await qc.invalidateQueries({ queryKey: ['auditor_pending_txs', gameId] })
    await qc.invalidateQueries({ queryKey: ['auditor_assets', gameId] })
  }

  const [targetId, setTargetId] = useState('')
  useEffect(() => {
    if (!targetId && players[0]?.id) setTargetId(players[0].id)
  }, [players, targetId])

  const [dlg, setDlg] = useState<
    'none' | 'small' | 'big' | 'doodad' | 'payday' | 'baby' | 'charity' | 'downsized' | 'market' | 'tx' | 'player_finance'
  >('none')
  const [financePlayerId, setFinancePlayerId] = useState('')

  const [smallCat, setSmallCat] = useState<string>(SMALL_CATS[0].value)
  const [smallDealId, setSmallDealId] = useState('')
  const [bigDealId, setBigDealId] = useState('')
  const [doodadId, setDoodadId] = useState('')

  const smallDeals = smallQ.data ?? []
  const filteredSmall = useMemo(() => smallDeals.filter((d) => d.category === smallCat), [smallDeals, smallCat])
  useEffect(() => {
    const active = gameQ.data?.active_small_deal
    if (!active) return
    if (active.category) {
      setSmallCat(active.category)
    }
    setSmallDealId(active.id)
  }, [gameQ.data?.active_small_deal?.id])
  useEffect(() => {
    if (filteredSmall[0]?.id) setSmallDealId(filteredSmall[0].id)
    else setSmallDealId('')
  }, [filteredSmall, smallCat])

  const bigDeals = bigQ.data ?? []
  useEffect(() => {
    if (bigDeals[0]?.id) setBigDealId(bigDeals[0].id)
  }, [bigDeals])

  const doodads = doodadsQ.data ?? []
  useEffect(() => {
    if (doodads[0]?.id) setDoodadId(doodads[0].id)
  }, [doodads])

  const [sellerId, setSellerId] = useState('')
  const [buyerId, setBuyerId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [sellPrice, setSellPrice] = useState(0)

  const assets = assetsQ.data ?? []
  useEffect(() => {
    if (!sellerId && players[0]?.id) setSellerId(players[0].id)
    if (!buyerId && players[1]?.id) setBuyerId(players[1].id)
    if (!buyerId && players[0]?.id && players.length === 1) setBuyerId(players[0].id)
  }, [players, sellerId, buyerId])

  const owned = useMemo(() => assets.filter((a: GameAsset) => a.owner_id === sellerId), [assets, sellerId])
  useEffect(() => {
    const first = owned[0]?.id ?? ''
    if (!owned.find((a) => a.id === assetId)) setAssetId(first)
  }, [owned, assetId])

  const paydayM = useMutation({
    mutationFn: () => postEventPayday(token!, gameId!, targetId),
    onSuccess: refresh,
  })
  const babyM = useMutation({
    mutationFn: () => postEventBaby(token!, gameId!, targetId),
    onSuccess: refresh,
  })
  const charityM = useMutation({
    mutationFn: () => postEventCharity(token!, gameId!, targetId),
    onSuccess: refresh,
  })
  const downsizedM = useMutation({
    mutationFn: () => postEventDownsized(token!, gameId!, targetId),
    onSuccess: refresh,
  })
  const smallM = useMutation({
    mutationFn: () => postEventSmallDeal(token!, gameId!, targetId, smallDealId),
    onSuccess: refresh,
  })
  const bigM = useMutation({
    mutationFn: () => postEventBigDeal(token!, gameId!, targetId, bigDealId),
    onSuccess: refresh,
  })
  const doodadM = useMutation({
    mutationFn: () => postEventDoodad(token!, gameId!, targetId, doodadId),
    onSuccess: refresh,
  })
  const sellM = useMutation({
    mutationFn: () =>
      createMarketSell(token!, gameId!, { seller_id: sellerId, buyer_id: buyerId, asset_id: assetId, price: sellPrice }),
    onSuccess: refresh,
  })

  const approveM = useMutation({
    mutationFn: (txId: string) => approveTransaction(token!, gameId!, txId),
    onSuccess: refresh,
  })
  const rejectM = useMutation({
    mutationFn: (txId: string) => rejectTransaction(token!, gameId!, txId),
    onSuccess: refresh,
  })

  const recent = (logsQ.data ?? []).slice(-12).reverse()
  const pending = pendingQ.data ?? []

  const selectedDoodad = doodads.find((d) => d.id === doodadId)
  const doodadCost =
    selectedDoodad?.doodad_type === 'child_payment'
      ? (selectedDoodad.cost_per_child ?? 0) * (players.find((p) => p.id === targetId)?.children_count ?? 0)
      : (selectedDoodad?.cost ?? 0)

  const selectedFinance = useMemo(
    () => finance.find((f) => f.player.id === financePlayerId) ?? null,
    [finance, financePlayerId],
  )

  return (
    <div className="space-y-6 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-8">
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{gameQ.data?.name ?? 'Game'}</h1>
            <p className="text-sm text-muted-foreground">Session control — Rat Race finances & auditor events.</p>
            {gameQ.data?.active_small_deal ? (
              <p className="mt-1 text-xs text-primary">
                Active small deal: {gameQ.data.active_small_deal.title || gameQ.data.active_small_deal.name}
              </p>
            ) : null}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/auditor/games/${gameId}/players`}>Manage players</Link>
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Players</CardTitle>
            <CardDescription>Monthly snapshot — click a row for the full statement.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Profession</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                  <TableHead className="text-right">Passive</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Cashflow</TableHead>
                  <TableHead className="text-right">Children</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {finance.map((row: PlayerFinanceDTO) => (
                  <TableRow
                    key={row.player.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setFinancePlayerId(row.player.id)
                      setDlg('player_finance')
                    }}
                  >
                    <TableCell className="font-medium text-primary underline-offset-4 hover:underline">
                      {row.player.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.profession_name || '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">{money(row.player.cash)}</TableCell>
                    <TableCell className="text-right font-mono">{money(row.player.passive_income)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-400/90">{money(row.total_expenses)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-400/90">{money(row.cashflow)}</TableCell>
                    <TableCell className="text-right">{row.player.children_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {finance.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No players in this session.</p>}
            {finance.length > 0 && (
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/auditor/games/${gameId}/players/${finance[0].player.id}`)}
                >
                  Open full player page
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pending transactions</CardTitle>
              <CardDescription>Player-to-player asset sales awaiting approval.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending deals.</p>
              ) : (
                pending.map((p) => {
                  const tx = p.transaction
                  const asset = tx.market_offer?.asset
                  return (
                    <div key={tx.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="font-medium">{asset?.name ?? 'Asset'}</div>
                      <div className="text-muted-foreground">
                        Price {money(tx.offer_price)} · Buyer cash after {money(p.buyer_cash_after)}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={() => approveM.mutate(tx.id)}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => rejectM.mutate(tx.id)}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent activity</CardTitle>
              <CardDescription>Latest financial log lines.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[220px] pr-3">
                <ul className="space-y-2 text-sm">
                  {recent.map((log) => (
                    <li key={log.id} className="flex flex-wrap justify-between gap-2 border-b border-border/60 pb-2">
                      <span className="text-muted-foreground">{log.player_name}</span>
                      <Badge variant="outline">{log.type}</Badge>
                      <span className="font-mono">{money(log.amount)}</span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      <aside className="space-y-3 lg:sticky lg:top-4">
        <Card className="border-primary/20 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Target player</CardTitle>
            <CardDescription>Used for most quick events.</CardDescription>
          </CardHeader>
          <CardContent>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        <div className="rounded-xl border border-border bg-muted/20 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Auditor actions</div>
          <div className="grid grid-cols-2 gap-2">
            <ActionBtn icon={Coins} label="Small deal" onClick={() => setDlg('small')} />
            <ActionBtn icon={Building2} label="Big deal" onClick={() => setDlg('big')} />
            <ActionBtn icon={Gift} label="Doodad" onClick={() => setDlg('doodad')} />
            <ActionBtn icon={Banknote} label="Payday" onClick={() => setDlg('payday')} />
            <ActionBtn icon={Baby} label="Baby" onClick={() => setDlg('baby')} />
            <ActionBtn icon={HeartHandshake} label="Charity" onClick={() => setDlg('charity')} />
            <ActionBtn icon={UserMinus} label="Downsized" onClick={() => setDlg('downsized')} />
            <ActionBtn icon={LineChart} label="Market" onClick={() => setDlg('market')} />
            <ActionBtn icon={ArrowLeftRight} label="Transaction" onClick={() => setDlg('tx')} className="col-span-2" />
          </div>
        </div>
      </aside>

      <Dialog open={dlg === 'small'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Small deal</DialogTitle>
            <DialogDescription>Pick a card from the small deal deck (≤ typical Cashflow small-deal range).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={smallCat}
                onChange={(e) => setSmallCat(e.target.value)}
              >
                {SMALL_CATS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Card</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={smallDealId}
                onChange={(e) => setSmallDealId(e.target.value)}
              >
                {filteredSmall.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title || d.name} — {money(d.down_payment)} down
                  </option>
                ))}
              </select>
            </div>
            {filteredSmall[0] && (
              <p className="text-xs text-muted-foreground">{filteredSmall.find((x) => x.id === smallDealId)?.description}</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDlg('none')}>
              Pass
            </Button>
            <Button onClick={() => smallM.mutate()} disabled={!smallDealId || smallM.isPending}>
              Buy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === 'big'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Big deal</DialogTitle>
            <DialogDescription>Large acquisition — confirm buyer and card.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Deal</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={bigDealId}
              onChange={(e) => setBigDealId(e.target.value)}
            >
              {bigDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title || d.name} — {money(d.down_payment)} down / {money(d.cashflow)} CF
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button onClick={() => bigM.mutate()} disabled={!bigDealId || bigM.isPending}>
              Confirm purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === 'doodad'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Doodad</DialogTitle>
            <DialogDescription>Lifestyle expense — cash (or per-child) is deducted when you confirm.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Doodad</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={doodadId}
              onChange={(e) => setDoodadId(e.target.value)}
            >
              {doodads.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {selectedDoodad && (
              <div className="rounded-md bg-muted/40 p-3 font-mono text-sm">
                <div className="text-muted-foreground">{selectedDoodad.doodad_type}</div>
                <div className="text-lg font-semibold text-foreground">{money(doodadCost || selectedDoodad.cost)}</div>
                <p className="text-xs text-muted-foreground">{selectedDoodad.description}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => doodadM.mutate()} disabled={doodadM.isPending}>
              Charge player
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === 'payday'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payday</DialogTitle>
            <DialogDescription>Apply salary + passive − expenses for {players.find((p) => p.id === targetId)?.name}.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => paydayM.mutate()} disabled={paydayM.isPending}>
              Run payday
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === 'baby'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Baby</DialogTitle>
            <DialogDescription>Adds a child and increases child expense when profession is set.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => babyM.mutate()} disabled={babyM.isPending}>
              Add baby
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === 'charity'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Charity</DialogTitle>
            <DialogDescription>10% of total income — backend applies charity turn rules.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => charityM.mutate()} disabled={charityM.isPending}>
              Apply charity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === 'downsized'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Downsized</DialogTitle>
            <DialogDescription>Job loss / downsizing event for selected player.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={() => downsizedM.mutate()} disabled={downsizedM.isPending}>
              Apply downsized
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === 'market'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Market events</DialogTitle>
            <DialogDescription>
              Reference cards from the market deck. Selling to another player uses “Transaction”. Below: who holds assets in
              this game.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-medium">Deck (sample)</div>
              <ScrollArea className="h-[200px] rounded-md border border-border p-2 text-xs">
                {(marketQ.data ?? []).slice(0, 40).map((ev) => (
                  <div key={ev.id} className="border-b border-border/50 py-2">
                    <div className="font-medium">{ev.name}</div>
                    <div className="text-muted-foreground">{ev.description.slice(0, 120)}…</div>
                  </div>
                ))}
              </ScrollArea>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">Assets on table</div>
              <ul className="space-y-1 text-sm">
                {assets.map((a: GameAsset) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span>{a.name}</span>
                    <span className="text-muted-foreground">{players.find((p) => p.id === a.owner_id)?.name ?? 'Unowned'}</span>
                  </li>
                ))}
                {assets.length === 0 && <li className="text-muted-foreground">No assets yet.</li>}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg('none')}>
              Close
            </Button>
            <Button
              onClick={() => {
                setDlg('tx')
              }}
            >
              New sale…
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === 'tx'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Player transaction</DialogTitle>
            <DialogDescription>Create a pending sale — approve it in the queue when ready.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label>Seller</Label>
                <select
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Buyer</Label>
                <select
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={buyerId}
                  onChange={(e) => setBuyerId(e.target.value)}
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>Asset</Label>
              <select
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
              >
                {owned.map((a: GameAsset) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Price</Label>
              <Input type="number" className="mt-1 font-mono" value={sellPrice || ''} onChange={(e) => setSellPrice(Number(e.target.value))} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => sellM.mutate()}
              disabled={!assetId || !sellPrice || sellM.isPending || sellerId === buyerId}
            >
              Create pending deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === 'player_finance'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedFinance?.player.name ?? 'Player'} financial breakdown</DialogTitle>
            <DialogDescription>Cashflow 101 formula with base and child expense split.</DialogDescription>
          </DialogHeader>
          {selectedFinance ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Profession</span><span>{selectedFinance.profession_name || '—'}</span></div>
              <div className="flex justify-between font-mono"><span className="text-muted-foreground">Salary</span><span>{money(selectedFinance.player.salary)}</span></div>
              <div className="flex justify-between font-mono"><span className="text-muted-foreground">Passive Income</span><span>{money(selectedFinance.player.passive_income)}</span></div>
              <div className="flex justify-between font-mono"><span className="text-muted-foreground">Base Expenses</span><span>{money(selectedFinance.base_expenses)}</span></div>
              <div className="flex justify-between font-mono"><span className="text-muted-foreground">Child Expense Each</span><span>{money(selectedFinance.child_expense_each)}</span></div>
              <div className="flex justify-between font-mono"><span className="text-muted-foreground">Children Total Expense</span><span>{money(selectedFinance.children_expense_total)}</span></div>
              <div className="flex justify-between font-mono"><span className="text-muted-foreground">Total Expenses</span><span>{money(selectedFinance.total_expenses)}</span></div>
              <div className="mt-2 flex justify-between rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-base">
                <span>Monthly Cashflow</span>
                <span className="text-emerald-400/90">{money(selectedFinance.monthly_cashflow ?? selectedFinance.cashflow)}</span>
              </div>
              {gameQ.data?.active_small_deal ? (
                <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
                  Active deal in session: {gameQ.data.active_small_deal.title || gameQ.data.active_small_deal.name}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No player selected.</p>
          )}
          <DialogFooter>
            {selectedFinance && (
              <Button variant="outline" onClick={() => navigate(`/auditor/games/${gameId}/players/${selectedFinance.player.id}`)}>
                Open full details
              </Button>
            )}
            <Button onClick={() => setDlg('none')}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: ElementType
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <Button variant="secondary" className={`h-auto flex-col gap-1 py-3 text-xs ${className ?? ''}`} onClick={onClick}>
      <Icon className="h-5 w-5" />
      {label}
    </Button>
  )
}
