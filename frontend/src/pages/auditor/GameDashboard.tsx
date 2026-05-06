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
  Wallet,
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
  closeGameMarket,
  gameMarketState,
  listMarketEvents,
  listPendingTransactions,
  listSmallDeals,
  listMarketAuctionOffers,
  marketAuctionBid,
  marketAuctionList,
  marketExternalSell,
  openGameMarket,
  openSmallDeal,
  postEventBaby,
  postEventBigDeal,
  postEventCharity,
  postEventDoodad,
  postEventDownsized,
  postEventLoan,
  postEventRepayLoan,
  postEventPayday,
  postEventSmallDeal,
  postEventStockSellBank,
  rejectTransaction,
  transactionPlayerConfirm,
  type GameAsset,
  type MarketEvent,
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

/** Совпадает с backend MarketNPCOfferSupported — только эти карты можно «открыть» как NPC-покупателя. */
function marketEventNpcSupported(ev: MarketEvent): boolean {
  return (
    (ev.event_type === 'REAL_ESTATE_BUYER' || ev.event_type === 'BUSINESS_BUYER') && ev.offer_price > 0
  )
}

const SMALL_CATS = [
  { value: 'stock', label: 'Stock' },
  { value: 'real_estate', label: 'Real estate' },
  { value: 'business', label: 'Business' },
  { value: 'deposit', label: 'Deposit certificate' },
  { value: 'stock_news', label: 'Stock news' },
] as const

const LEGACY_SMALL_CAT_MAP: Record<string, string[]> = {
  stock: ['small_deal_assets'],
  real_estate: ['small_deal_real_estate'],
  business: ['small_deal_business'],
  deposit: ['small_deal_deposite_certificate'],
  stock_news: ['small_deal_assets_news'],
}

const BIG_CATS = [
  { value: 'real_estate', label: 'Real estate' },
  { value: 'business', label: 'Business' },
  { value: 'expense', label: 'RE expenses / news' },
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
    staleTime: 0,
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
  const allMarketEvents = useMemo(() => {
    const raw = marketQ.data ?? []
    return [...raw].sort((a, b) => {
      const byType = a.event_type.localeCompare(b.event_type)
      if (byType !== 0) return byType
      return a.name.localeCompare(b.name)
    })
  }, [marketQ.data])

  const npcBuyerSupportedEvents = useMemo(
    () => allMarketEvents.filter(marketEventNpcSupported),
    [allMarketEvents],
  )
  const finance = financeQ.data ?? []
  const players = finance.map((f) => f.player)

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['auditor_finance', gameId] })
    await qc.invalidateQueries({ queryKey: ['auditor_logs', gameId] })
    await qc.invalidateQueries({ queryKey: ['auditor_pending_txs', gameId] })
    await qc.invalidateQueries({ queryKey: ['auditor_assets', gameId] })
    await qc.invalidateQueries({ queryKey: ['auditor_game', gameId] })
    await qc.invalidateQueries({ queryKey: ['market_state', gameId] })
    await qc.invalidateQueries({ queryKey: ['market_auction_offers', gameId] })
  }

  const [targetId, setTargetId] = useState('')
  useEffect(() => {
    if (!targetId && players[0]?.id) setTargetId(players[0].id)
  }, [players, targetId])

  const [dlg, setDlg] = useState<
    | 'none'
    | 'small'
    | 'big'
    | 'doodad'
    | 'payday'
    | 'baby'
    | 'charity'
    | 'downsized'
    | 'loan'
    | 'repay_loan'
    | 'market'
    | 'tx'
    | 'player_finance'
  >('none')
  const [npcMarketEventId, setNpcMarketEventId] = useState('')

  const selectedMarketCatalogEvent = useMemo(
    () => allMarketEvents.find((e) => e.id === npcMarketEventId) ?? null,
    [allMarketEvents, npcMarketEventId],
  )
  const selectedMarketNpcSupported =
    selectedMarketCatalogEvent != null && marketEventNpcSupported(selectedMarketCatalogEvent)

  const marketStateQ = useQuery({
    queryKey: ['market_state', gameId],
    queryFn: () => gameMarketState(token!, gameId!),
    enabled: dlg === 'market' && !!token && !!gameId,
  })

  const auctionOffersQ = useQuery({
    queryKey: ['market_auction_offers', gameId],
    queryFn: () => listMarketAuctionOffers(token!, gameId!),
    enabled: dlg === 'market' && !!token && !!gameId,
  })

  useEffect(() => {
    if (npcMarketEventId) return
    setNpcMarketEventId(npcBuyerSupportedEvents[0]?.id ?? allMarketEvents[0]?.id ?? '')
  }, [npcMarketEventId, npcBuyerSupportedEvents, allMarketEvents])

  useEffect(() => {
    if (dlg !== 'market' || !gameId || !token) return
    void qc.invalidateQueries({ queryKey: ['market_state', gameId] })
    void qc.invalidateQueries({ queryKey: ['market_auction_offers', gameId] })
  }, [dlg, gameId, token, qc])

  const [financePlayerId, setFinancePlayerId] = useState('')

  const [smallCat, setSmallCat] = useState<string>(SMALL_CATS[0].value)
  const [smallDealId, setSmallDealId] = useState('')
  const [smallShares, setSmallShares] = useState<number>(1)
  const [smallSellShares, setSmallSellShares] = useState<number>(1)
  const [smallAllowLoan, setSmallAllowLoan] = useState<boolean>(false)
  const [bigCat, setBigCat] = useState<string>(BIG_CATS[0].value)
  const [bigDealId, setBigDealId] = useState('')
  const [doodadId, setDoodadId] = useState('')
  const [loanAmount, setLoanAmount] = useState<number>(3000)
  const [repayAmount, setRepayAmount] = useState<number>(3000)

  const smallDeals = smallQ.data ?? []
  const filteredSmall = useMemo(
    () =>
      smallDeals.filter((d) => {
        if (d.category === smallCat) return true
        return (LEGACY_SMALL_CAT_MAP[smallCat] ?? []).includes(d.category)
      }),
    [smallDeals, smallCat],
  )
  useEffect(() => {
    const active = gameQ.data?.active_small_deal
    if (!active) return
    if (active.category) {
      setSmallCat(active.category)
    }
    setSmallDealId(active.id)
  }, [gameQ.data?.active_small_deal?.id])

  // Refresh deck when opening modal so DB seed/description updates appear without stale cache.
  useEffect(() => {
    if (dlg !== 'small' || !token) return
    void qc.invalidateQueries({ queryKey: ['auditor_small_deals'] })
  }, [dlg, qc, token])

  useEffect(() => {
    if (dlg !== 'big' || !token) return
    void qc.invalidateQueries({ queryKey: ['auditor_big_deals'] })
  }, [dlg, qc, token])

  useEffect(() => {
    setSmallShares(1)
    setSmallSellShares(1)
    setSmallAllowLoan(false)
    if (filteredSmall.length === 0) {
      if (!smallQ.isPending && !smallQ.isFetching) setSmallDealId('')
      return
    }
    setSmallDealId((prev) =>
      prev && filteredSmall.some((d) => d.id === prev) ? prev : filteredSmall[0].id,
    )
  }, [filteredSmall, smallCat, smallQ.isPending, smallQ.isFetching])

  const selectedSmallDeal = useMemo(() => {
    if (!smallDealId) return null
    return (
      filteredSmall.find((d) => d.id === smallDealId) ??
      smallDeals.find((d) => d.id === smallDealId) ??
      null
    )
  }, [filteredSmall, smallDeals, smallDealId])

  const smallDealDescription = useMemo(() => {
    const fromList = selectedSmallDeal?.description?.trim()
    if (fromList) return selectedSmallDeal!.description
    const active = gameQ.data?.active_small_deal
    if (active?.id === smallDealId && active.description?.trim()) return active.description
    return ''
  }, [selectedSmallDeal, gameQ.data?.active_small_deal, smallDealId])
  const isStockSmallDeal = selectedSmallDeal?.category === 'stock' || selectedSmallDeal?.category === 'small_deal_assets'
  const selectedStockSymbol = selectedSmallDeal?.symbol || ''

  const bigDeals = bigQ.data ?? []
  const filteredBig = useMemo(
    () =>
      bigDeals.filter((d) => {
        if (bigCat === 'business') {
          return d.deal_type === 'big_deal_business' || d.deal_type === 'business'
        }
        if (bigCat === 'real_estate') {
          return d.deal_type === 'big_deal_real_estate' || d.deal_type === 'real_estate'
        }
        // News cards (cost only). Legacy rows may still use deal_type "expense" before re-seed.
        const legacyNewsExpense =
          (d.deal_type === 'expense' || d.deal_type === 'expenses') &&
          d.price === 0 &&
          d.mortgage === 0 &&
          d.cashflow === 0 &&
          d.down_payment > 0
        return d.deal_type === 'big_deal_real_estate_news' || legacyNewsExpense
      }),
    [bigDeals, bigCat],
  )
  useEffect(() => {
    if (filteredBig.length === 0) {
      if (!bigQ.isPending && !bigQ.isFetching) setBigDealId('')
      return
    }
    setBigDealId((prev) =>
      prev && filteredBig.some((d) => d.id === prev) ? prev : filteredBig[0].id,
    )
  }, [filteredBig, bigCat, bigQ.isPending, bigQ.isFetching])

  const selectedBigDeal = useMemo(() => {
    if (!bigDealId) return null
    return (
      filteredBig.find((d) => d.id === bigDealId) ?? bigDeals.find((d) => d.id === bigDealId) ?? null
    )
  }, [filteredBig, bigDeals, bigDealId])

  const bigDealDescription = useMemo(() => {
    const t = selectedBigDeal?.description?.trim()
    return t || ''
  }, [selectedBigDeal])

  const doodads = doodadsQ.data ?? []
  useEffect(() => {
    if (doodads[0]?.id) setDoodadId(doodads[0].id)
  }, [doodads])

  const [sellerId, setSellerId] = useState('')
  const [buyerId, setBuyerId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [sellPrice, setSellPrice] = useState(0)

  const [auctionSellerId, setAuctionSellerId] = useState('')
  const [auctionAssetId, setAuctionAssetId] = useState('')
  const [auctionAskingPrice, setAuctionAskingPrice] = useState(0)
  const [bidOfferId, setBidOfferId] = useState('')
  const [bidBuyerId, setBidBuyerId] = useState('')
  const [bidAmount, setBidAmount] = useState(0)

  const assets = assetsQ.data ?? []

  useEffect(() => {
    if (dlg !== 'market') return
    if (!auctionSellerId && targetId) setAuctionSellerId(targetId)
    if (!bidBuyerId && targetId) setBidBuyerId(targetId)
  }, [dlg, targetId, auctionSellerId, bidBuyerId])

  const auctionSellerAssets = useMemo(
    () => assets.filter((a: GameAsset) => a.owner_id === auctionSellerId),
    [assets, auctionSellerId],
  )
  useEffect(() => {
    if (auctionSellerAssets.length === 0) {
      setAuctionAssetId('')
      return
    }
    setAuctionAssetId((prev) =>
      prev && auctionSellerAssets.some((a) => a.id === prev) ? prev : auctionSellerAssets[0].id,
    )
  }, [auctionSellerAssets])

  useEffect(() => {
    const offers = auctionOffersQ.data ?? []
    if (offers.length === 0) {
      setBidOfferId('')
      return
    }
    setBidOfferId((prev) => (prev && offers.some((o) => o.id === prev) ? prev : offers[0].id))
  }, [auctionOffersQ.data])

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
    onError: (err) => {
      alert((err as Error).message || 'Payday failed')
    },
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
  const loanM = useMutation({
    mutationFn: () => postEventLoan(token!, gameId!, targetId, Math.max(1000, Math.round(loanAmount / 1000) * 1000)),
    onSuccess: refresh,
    onError: (err) => {
      alert((err as Error).message || 'Loan failed')
    },
  })
  const repayM = useMutation({
    mutationFn: () =>
      postEventRepayLoan(token!, gameId!, targetId, Math.max(1000, Math.round(repayAmount / 1000) * 1000)),
    onSuccess: refresh,
    onError: (err) => {
      alert((err as Error).message || 'Repay failed')
    },
  })
  const smallM = useMutation({
    mutationFn: async () => {
      // Opening the card binds "who drew it"; backend uses this for stock-buy permission.
      await openSmallDeal(token!, gameId!, smallDealId, targetId)
      return postEventSmallDeal(token!, gameId!, targetId, smallDealId, {
        shares: isStockSmallDeal ? Math.max(1, smallShares) : undefined,
        allow_loan: smallAllowLoan,
      })
    },
    onSuccess: refresh,
    onError: (err) => {
      alert((err as Error).message || 'Small deal purchase failed')
    },
  })
  const stockSellBankM = useMutation({
    mutationFn: () =>
      postEventStockSellBank(
        token!,
        gameId!,
        targetId,
        selectedStockSymbol,
        Math.max(1, smallSellShares),
      ),
    onSuccess: refresh,
    onError: (err) => {
      alert((err as Error).message || 'Stock sell to bank failed')
    },
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

  const openNpcMarketM = useMutation({
    mutationFn: () => openGameMarket(token!, gameId!, npcMarketEventId),
    onSuccess: refresh,
    onError: (err) => alert((err as Error).message || 'Open NPC market failed'),
  })
  const closeNpcMarketM = useMutation({
    mutationFn: () => closeGameMarket(token!, gameId!),
    onSuccess: refresh,
    onError: (err) => alert((err as Error).message || 'Close market failed'),
  })
  const npcMarketSellM = useMutation({
    mutationFn: ({ playerId, assetId }: { playerId: string; assetId: string }) =>
      marketExternalSell(token!, gameId!, playerId, assetId),
    onSuccess: refresh,
    onError: (err) => alert((err as Error).message || 'NPC market sale failed'),
  })
  const auctionListM = useMutation({
    mutationFn: () =>
      marketAuctionList(token!, gameId!, {
        seller_id: auctionSellerId,
        asset_id: auctionAssetId,
        asking_price: auctionAskingPrice,
      }),
    onSuccess: refresh,
    onError: (err) => alert((err as Error).message || 'Auction list failed'),
  })
  const auctionBidM = useMutation({
    mutationFn: () =>
      marketAuctionBid(token!, gameId!, {
        buyer_id: bidBuyerId,
        market_offer_id: bidOfferId,
        bid_price: Math.max(1, bidAmount),
      }),
    onSuccess: refresh,
    onError: (err) => alert((err as Error).message || 'Bid failed'),
  })
  const playerConfirmTxM = useMutation({
    mutationFn: ({ txId, playerId }: { txId: string; playerId: string }) =>
      transactionPlayerConfirm(token!, gameId!, txId, playerId),
    onSuccess: refresh,
    onError: (err) => alert((err as Error).message || 'Confirm failed'),
  })

  const recent = (logsQ.data ?? []).slice(-12).reverse()
  const pending = pendingQ.data ?? []
  const activeNpcMarket = gameQ.data?.active_market_event ?? marketStateQ.data?.active_event ?? null
  const npcEligible = marketStateQ.data?.eligible ?? []

  const selectedDoodad = doodads.find((d) => d.id === doodadId)
  const doodadCost =
    selectedDoodad?.doodad_type === 'child_payment'
      ? (selectedDoodad.cost_per_child ?? 0) * (players.find((p) => p.id === targetId)?.children_count ?? 0)
      : (selectedDoodad?.cost ?? 0)

  const targetLoanBalance = players.find((p) => p.id === targetId)?.loan_balance ?? 0

  const selectedFinance = useMemo(
    () => finance.find((f) => f.player.id === financePlayerId) ?? null,
    [finance, financePlayerId],
  )
  const selectedOwnedAsset = useMemo(
    () => owned.find((a) => a.id === assetId) ?? null,
    [owned, assetId],
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
              <CardDescription>Сделки между игроками: подтверждение сторонами или одобрение аудитором.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending deals.</p>
              ) : (
                pending.map((p) => {
                  const tx = p.transaction
                  const asset = tx.market_offer?.asset
                  const sellerIdTx = tx.market_offer?.seller_id
                  const agreed = tx.counter_offer ?? tx.offer_price
                  return (
                    <div key={tx.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="font-medium">{asset?.name ?? 'Asset'}</div>
                      <div className="text-muted-foreground">
                        Offer {money(tx.offer_price)}
                        {tx.counter_offer != null ? ` · counter ${money(tx.counter_offer)}` : ''} · settled at {money(agreed)} · Buyer
                        cash after {money(p.buyer_cash_after)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Подтверждения: продавец {tx.seller_confirmed ? 'да' : 'нет'}, покупатель {tx.buyer_confirmed ? 'да' : 'нет'}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {sellerIdTx ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={playerConfirmTxM.isPending || tx.seller_confirmed}
                            onClick={() => playerConfirmTxM.mutate({ txId: tx.id, playerId: sellerIdTx })}
                          >
                            Продавец: подтвердить
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={playerConfirmTxM.isPending || tx.buyer_confirmed}
                          onClick={() => playerConfirmTxM.mutate({ txId: tx.id, playerId: tx.buyer_id })}
                        >
                          Покупатель: подтвердить
                        </Button>
                        <Button size="sm" onClick={() => approveM.mutate(tx.id)}>
                          Approve (аудитор)
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
            <ActionBtn icon={Banknote} label="Loan" onClick={() => setDlg('loan')} />
            <ActionBtn icon={Wallet} label="Repay loan" onClick={() => setDlg('repay_loan')} />
            <ActionBtn icon={LineChart} label="Market" onClick={() => setDlg('market')} />
            <ActionBtn icon={ArrowLeftRight} label="Transaction" onClick={() => setDlg('tx')} />
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
            {isStockSmallDeal && (
              <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                <div className="space-y-1">
                  <Label>Shares to buy (only for player who drew this card)</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={smallShares}
                    onChange={(e) => setSmallShares(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Sell old shares to bank (any player)</Label>
                  <p className="text-xs text-muted-foreground">
                    Current card price: {money(selectedSmallDeal?.price ?? 0)} per share
                    {selectedStockSymbol ? ` (${selectedStockSymbol})` : ''}.
                  </p>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={smallSellShares}
                    onChange={(e) => setSmallSellShares(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={!selectedStockSymbol || stockSellBankM.isPending || smallSellShares < 1}
                    onClick={() => stockSellBankM.mutate()}
                  >
                    Sell to bank at card price
                  </Button>
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={smallAllowLoan} onChange={(e) => setSmallAllowLoan(e.target.checked)} />
              Use loan automatically if cash is not enough
            </label>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Description</Label>
              <div className="max-h-[180px] overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
                {smallDealDescription
                  ? smallDealDescription
                  : selectedSmallDeal
                    ? '—'
                    : 'Select a card to see description from deck JSON.'}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDlg('none')}>
              Pass
            </Button>
            <Button onClick={() => smallM.mutate()} disabled={!smallDealId || smallM.isPending || (isStockSmallDeal && smallShares < 1)}>
              Buy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === 'big'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Big deal</DialogTitle>
            <DialogDescription>
              Property / business: creates an asset. RE expenses / news: one-time cash cost only (no asset).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
              <div>
                <Label>Category</Label>
                <select
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={bigCat}
                  onChange={(e) => setBigCat(e.target.value)}
                >
                  {BIG_CATS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            <Label>Deal</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={bigDealId}
              onChange={(e) => setBigDealId(e.target.value)}
            >
                {filteredBig.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.deal_type === 'big_deal_real_estate_news' ||
                  ((d.deal_type === 'expense' || d.deal_type === 'expenses') && d.price === 0 && d.down_payment > 0)
                    ? `${d.title || d.name} — ${money(d.down_payment)} cost`
                    : `${d.title || d.name} — ${money(d.down_payment)} down / ${money(d.cashflow)} CF`}
                </option>
              ))}
            </select>
            <div className="space-y-1">
              <Label className="text-muted-foreground">Description</Label>
              <div className="max-h-[220px] overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
                {bigDealDescription
                  ? bigDealDescription
                  : selectedBigDeal
                    ? '—'
                    : 'Select a deal to see description from the deck.'}
              </div>
            </div>
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

      <Dialog open={dlg === 'loan'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bank loan</DialogTitle>
            <DialogDescription>
              Player receives cash now, and monthly expenses increase by 10% of loan amount.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Loan amount (multiple of 1000)</Label>
            <Input
              type="number"
              min={1000}
              step={1000}
              value={loanAmount}
              onChange={(e) => setLoanAmount(Number(e.target.value) || 0)}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => loanM.mutate()} disabled={loanM.isPending || loanAmount < 1000}>
              Apply loan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === 'repay_loan'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Repay bank loan</DialogTitle>
            <DialogDescription>
              Pay from cash. Principal, liabilities, and the 10% loan payment line are reduced in proportion.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Current bank loan balance: <span className="font-mono text-foreground">{money(targetLoanBalance)}</span>
            </p>
            <Label>Repay amount (multiple of 1000, ≤ balance and ≤ cash)</Label>
            <Input
              type="number"
              min={1000}
              step={1000}
              value={repayAmount}
              onChange={(e) => setRepayAmount(Number(e.target.value) || 0)}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => repayM.mutate()}
              disabled={
                repayM.isPending ||
                repayAmount < 1000 ||
                targetLoanBalance < 1000 ||
                (players.find((p) => p.id === targetId)?.cash ?? 0) < Math.max(1000, Math.round(repayAmount / 1000) * 1000)
              }
            >
              Repay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === 'market'} onOpenChange={(o) => !o && setDlg('none')}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Market</DialogTitle>
            <DialogDescription>
              Внешний покупатель: чистая выплата = цена карты − ипотека; актив удаляется, пассивный доход пересчитывается.
              Внутренний аукцион при открытой карте: лот другим игрокам, ставки, двойное подтверждение (или одобрение аудитором).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <div className="mb-2 text-sm font-medium">Открыть событие (внешний покупатель)</div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1 space-y-1">
                  <Label>Карта из колоды</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={npcMarketEventId}
                    onChange={(e) => setNpcMarketEventId(e.target.value)}
                  >
                    {allMarketEvents.length === 0 ? (
                      <option value="">Нет карточек в базе</option>
                    ) : (
                      allMarketEvents.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {marketEventNpcSupported(ev) ? '' : '[справочно] '}
                          {ev.name}
                          {ev.offer_price > 0 ? ` — ${money(ev.offer_price)}` : ''} ({ev.event_type} /{' '}
                          {ev.sub_type})
                        </option>
                      ))
                    )}
                  </select>
                  {selectedMarketCatalogEvent && !selectedMarketNpcSupported ? (
                    <p className="text-xs text-amber-700 dark:text-amber-500">
                      NPC-продажа пока только для REAL_ESTATE_BUYER и BUSINESS_BUYER с фиксированной ценой. Остальные
                      карты — для справки на столе.
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  onClick={() => openNpcMarketM.mutate()}
                  disabled={
                    !npcMarketEventId ||
                    openNpcMarketM.isPending ||
                    npcBuyerSupportedEvents.length === 0 ||
                    !selectedMarketNpcSupported
                  }
                >
                  Open market
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => closeNpcMarketM.mutate()}
                  disabled={closeNpcMarketM.isPending}
                >
                  Close market
                </Button>
              </div>
              {activeNpcMarket ? (
                <div className="mt-3 rounded-md border border-primary/30 bg-background p-2 text-sm">
                  <div className="font-medium text-primary">Активная карта</div>
                  <div>{activeNpcMarket.name}</div>
                  <div className="text-muted-foreground">{activeNpcMarket.description}</div>
                  <div className="mt-1 font-mono">
                    Цена покупателя: {money(activeNpcMarket.offer_price)} · {activeNpcMarket.event_type} ·{' '}
                    {activeNpcMarket.sub_type}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Нет активного рыночного события для этой игры.</p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/10 p-3">
              <div className="mb-2 text-sm font-medium">Внутренний аукцион (при открытой карте рынка)</div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase text-muted-foreground">Выставить лот</div>
                  <div>
                    <Label className="text-xs">Продавец</Label>
                    <select
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={auctionSellerId}
                      onChange={(e) => setAuctionSellerId(e.target.value)}
                    >
                      {players.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Актив</Label>
                    <select
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={auctionAssetId}
                      onChange={(e) => setAuctionAssetId(e.target.value)}
                    >
                      {auctionSellerAssets.map((a: GameAsset) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.type}
                          {a.unit_price ? ` · ${money(a.unit_price)} avg` : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Желаемая цена (инфо, 0 ок)</Label>
                    <Input
                      type="number"
                      min={0}
                      className="font-mono"
                      value={auctionAskingPrice}
                      onChange={(e) => setAuctionAskingPrice(Number(e.target.value) || 0)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!activeNpcMarket || !auctionAssetId || auctionListM.isPending}
                    onClick={() => auctionListM.mutate()}
                  >
                    Выставить на торги
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase text-muted-foreground">Ставка</div>
                  <div>
                    <Label className="text-xs">Лот</Label>
                    <select
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={bidOfferId}
                      onChange={(e) => setBidOfferId(e.target.value)}
                    >
                      {(auctionOffersQ.data ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.asset?.name ?? o.asset_id} — {players.find((pl) => pl.id === o.seller_id)?.name ?? '?'}
                          {o.price > 0 ? ` (${money(o.price)})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Покупатель</Label>
                    <select
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={bidBuyerId}
                      onChange={(e) => setBidBuyerId(e.target.value)}
                    >
                      {players.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Предложенная цена</Label>
                    <Input
                      type="number"
                      min={1}
                      className="font-mono"
                      value={bidAmount || ''}
                      onChange={(e) => setBidAmount(Number(e.target.value) || 0)}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!activeNpcMarket || !bidOfferId || !bidBuyerId || bidAmount < 1 || auctionBidM.isPending}
                    onClick={() => auctionBidM.mutate()}
                  >
                    Отправить ставку
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    После ставки продавец и покупатель нажимают «подтвердить» в блоке Pending transactions (остальные ставки по
                    лоту сбрасываются при подтверждении продавцом).
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">Подходящие активы — продажа банку (NPC)</div>
              {marketStateQ.isFetching ? (
                <p className="text-xs text-muted-foreground">Загрузка…</p>
              ) : npcEligible.length === 0 ? (
                <p className="text-xs text-muted-foreground">Никто не держит подходящий актив под текущую карту.</p>
              ) : (
                <div className="space-y-3">
                  {npcEligible.map((row) => (
                    <div key={row.player_id} className="rounded-md border border-border p-2">
                      <div className="mb-2 font-medium">{row.name}</div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Asset</TableHead>
                            <TableHead className="text-right">Mortgage</TableHead>
                            <TableHead className="text-right">Loan</TableHead>
                            <TableHead className="text-right">CF</TableHead>
                            <TableHead className="text-right">Net</TableHead>
                            <TableHead />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {row.assets.map((a) => (
                            <TableRow key={a.asset_id}>
                              <TableCell>
                                {a.name}
                                {a.building_units > 0 ? (
                                  <span className="ml-1 text-xs text-muted-foreground">({a.building_units} units)</span>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-right font-mono">{money(a.mortgage)}</TableCell>
                              <TableCell className="text-right font-mono">{money(a.loan_amount)}</TableCell>
                              <TableCell className="text-right font-mono">{money(a.cashflow)}</TableCell>
                              <TableCell className="text-right font-mono">{money(a.net_to_player)}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={npcMarketSellM.isPending || !activeNpcMarket}
                                  onClick={() =>
                                    npcMarketSellM.mutate({ playerId: row.player_id, assetId: a.asset_id })
                                  }
                                  title={`Чистая выплата: ${money(a.net_to_player)}`}
                                >
                                  Продать в банк
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-medium">Вся колода ({allMarketEvents.length})</div>
                <ScrollArea className="h-[min(50vh,440px)] rounded-md border border-border p-2 text-xs">
                  {allMarketEvents.map((ev) => (
                    <div key={ev.id} className="border-b border-border/50 py-2">
                      <div className="flex flex-wrap items-baseline gap-x-2 font-medium">
                        <span>{ev.name}</span>
                        <Badge variant="outline" className="font-normal">
                          {ev.event_type}
                        </Badge>
                        {marketEventNpcSupported(ev) ? (
                          <Badge variant="secondary" className="font-normal">
                            NPC OK
                          </Badge>
                        ) : null}
                      </div>
                      {ev.offer_price > 0 ? (
                        <div className="font-mono text-muted-foreground">{money(ev.offer_price)}</div>
                      ) : null}
                      <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{ev.description}</div>
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
              Player→player sale…
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
                    {a.name} ({a.type}
                    {a.unit_price ? ` · bought @ ${money(a.unit_price)}` : ''})
                  </option>
                ))}
              </select>
              {selectedOwnedAsset ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Bought at: {selectedOwnedAsset.unit_price ? money(selectedOwnedAsset.unit_price) : '—'}
                  {selectedOwnedAsset.shares ? ` · Shares: ${selectedOwnedAsset.shares}` : ''}
                </p>
              ) : null}
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
