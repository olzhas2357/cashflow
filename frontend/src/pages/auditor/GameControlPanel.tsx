import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import {
  approveTransaction,
  createMarketSell,
  financeOverview,
  gameAssets,
  gameLogs,
  listPendingTransactions,
  postEventBaby,
  postEventBigDeal,
  postEventCharity,
  postEventDoodad,
  postEventDownsized,
  postEventPayday,
  postEventSmallDeal,
  rejectTransaction,
  referenceData,
  type BigDeal,
  type Doodad,
  type PlayerFinanceDTO,
  type SmallDeal,
} from '../../api/auditorPanel'
import { GlassCard, GradientButton } from '../../components/ui'

export default function AuditorGameControlPanel() {
  const token = useAuthStore((s) => s.token)
  const { gameId } = useParams()
  const qc = useQueryClient()

  const refQ = useQuery({
    queryKey: ['auditor_reference', gameId],
    queryFn: () => referenceData(token!, gameId!),
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

  const professions = refQ.data?.professions ?? []
  const smallDeals = refQ.data?.small_deals ?? []
  const bigDeals = refQ.data?.big_deals ?? []
  const doodads = refQ.data?.doodads ?? []

  const finance = financeQ.data ?? []
  const logs = logsQ.data ?? []
  const pending = pendingQ.data ?? []
  const assets = assetsQ.data ?? []

  const players = finance.map((f) => f.player)
  const defaultPlayerId = players[0]?.id ?? ''

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(defaultPlayerId)
  const [playerModalId, setPlayerModalId] = useState<string | null>(null)

  const selectedFinance = useMemo(() => finance.find((f) => f.player.id === selectedPlayerId) ?? null, [finance, selectedPlayerId])

  const selectedPlayer = selectedFinance?.player ?? null

  const [selectedDoodadId, setSelectedDoodadId] = useState<string>(doodads[0]?.id ?? '')
  const [selectedSmallDealId, setSelectedSmallDealId] = useState<string>(smallDeals[0]?.id ?? '')
  const [selectedBigDealId, setSelectedBigDealId] = useState<string>(bigDeals[0]?.id ?? '')

  const [sellerId, setSellerId] = useState<string>(players[0]?.id ?? '')
  const [buyerId, setBuyerId] = useState<string>(players[1]?.id ?? players[0]?.id ?? '')
  const [assetId, setAssetId] = useState<string>('')
  const [sellPrice, setSellPrice] = useState<number>(0)

  const ownedAssets = useMemo(() => assets.filter((a: any) => a.owner_id === sellerId), [assets, sellerId])

  const refreshAll = async () => {
    await qc.invalidateQueries({ queryKey: ['auditor_finance', gameId] })
    await qc.invalidateQueries({ queryKey: ['auditor_logs', gameId] })
    await qc.invalidateQueries({ queryKey: ['auditor_pending_txs', gameId] })
    await qc.invalidateQueries({ queryKey: ['auditor_assets', gameId] })
  }

  useEffect(() => {
    if (!selectedPlayerId && players[0]?.id) setSelectedPlayerId(players[0].id)
    if (!sellerId && players[0]?.id) setSellerId(players[0].id)
    if (!buyerId && players[1]?.id) setBuyerId(players[1].id)
  }, [players, selectedPlayerId, sellerId, buyerId])

  useEffect(() => {
    if (!selectedDoodadId && doodads[0]?.id) setSelectedDoodadId(doodads[0].id)
    if (!selectedSmallDealId && smallDeals[0]?.id) setSelectedSmallDealId(smallDeals[0].id)
    if (!selectedBigDealId && bigDeals[0]?.id) setSelectedBigDealId(bigDeals[0].id)
  }, [doodads, smallDeals, bigDeals, selectedDoodadId, selectedSmallDealId, selectedBigDealId])

  useEffect(() => {
    // keep asset selection valid when seller changes
    if (sellerId) {
      const current = ownedAssets.find((a: any) => a.id === assetId)
      if (!current) {
        const first = ownedAssets[0]?.id ?? ''
        setAssetId(first)
      }
    }
  }, [ownedAssets, sellerId, assetId])

  const approveM = useMutation({
    mutationFn: (txId: string) => approveTransaction(token!, gameId!, txId),
    onSuccess: refreshAll,
  })
  const rejectM = useMutation({
    mutationFn: (txId: string) => rejectTransaction(token!, gameId!, txId),
    onSuccess: refreshAll,
  })

  const paydayM = useMutation({
    mutationFn: () => postEventPayday(token!, gameId!, selectedPlayerId),
    onSuccess: refreshAll,
  })
  const babyM = useMutation({
    mutationFn: () => postEventBaby(token!, gameId!, selectedPlayerId),
    onSuccess: refreshAll,
  })
  const charityM = useMutation({
    mutationFn: () => postEventCharity(token!, gameId!, selectedPlayerId),
    onSuccess: refreshAll,
  })
  const downsizedM = useMutation({
    mutationFn: () => postEventDownsized(token!, gameId!, selectedPlayerId),
    onSuccess: refreshAll,
  })
  const doodadM = useMutation({
    mutationFn: () => postEventDoodad(token!, gameId!, selectedPlayerId, selectedDoodadId),
    onSuccess: refreshAll,
  })
  const smallDealM = useMutation({
    mutationFn: () => postEventSmallDeal(token!, gameId!, selectedPlayerId, selectedSmallDealId),
    onSuccess: refreshAll,
  })
  const bigDealM = useMutation({
    mutationFn: () => postEventBigDeal(token!, gameId!, selectedPlayerId, selectedBigDealId),
    onSuccess: refreshAll,
  })

  const sellM = useMutation({
    mutationFn: () =>
      createMarketSell(token!, gameId!, {
        seller_id: sellerId,
        buyer_id: buyerId,
        asset_id: assetId,
        price: sellPrice,
      }),
    onSuccess: refreshAll,
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Game Control Panel</h1>
          <div className="text-sm text-slate-600">Manage finances, record events, and verify transactions (auditor workflow).</div>
        </div>
        <div className="text-sm text-slate-500">Game ID: <span className="font-mono">{gameId}</span></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-1">
          <h2 className="font-semibold">Action Panel</h2>

          <div className="mt-3 space-y-2">
            <label className="block text-xs font-medium text-slate-600">
              Target player
              <select
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                value={selectedPlayerId}
                onChange={(e) => {
                  setSelectedPlayerId(e.target.value)
                }}
              >
                {players.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <GradientButton onClick={() => paydayM.mutate()} disabled={paydayM.isPending || !selectedPlayerId}>
                Payday
              </GradientButton>
              <GradientButton onClick={() => babyM.mutate()} disabled={babyM.isPending || !selectedPlayerId}>
                Baby
              </GradientButton>
              <GradientButton onClick={() => charityM.mutate()} disabled={charityM.isPending || !selectedPlayerId}>
                Charity
              </GradientButton>
              <GradientButton onClick={() => downsizedM.mutate()} disabled={downsizedM.isPending || !selectedPlayerId}>
                Downsized
              </GradientButton>
            </div>

            <div className="mt-2 rounded-xl border border-slate-200 p-3">
              <div className="text-sm font-semibold">Doodad</div>
              <select
                className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
                value={selectedDoodadId}
                onChange={(e) => setSelectedDoodadId(e.target.value)}
              >
                {doodads.map((d: Doodad) => (
                  <option value={d.id} key={d.id}>
                    {d.name} (-{d.cost})
                  </option>
                ))}
              </select>
              <div className="mt-2">
                <GradientButton onClick={() => doodadM.mutate()} disabled={doodadM.isPending || !selectedDoodadId}>
                  Apply
                </GradientButton>
              </div>
            </div>

            <div className="mt-2 rounded-xl border border-slate-200 p-3">
              <div className="text-sm font-semibold">Small Deal</div>
              <select
                className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
                value={selectedSmallDealId}
                onChange={(e) => setSelectedSmallDealId(e.target.value)}
              >
                {smallDeals.map((d: SmallDeal) => (
                  <option value={d.id} key={d.id}>
                    {d.name} (cashflow +{d.cashflow})
                  </option>
                ))}
              </select>
              <div className="mt-2">
                <GradientButton onClick={() => smallDealM.mutate()} disabled={smallDealM.isPending || !selectedSmallDealId}>
                  Buy
                </GradientButton>
              </div>
            </div>

            <div className="mt-2 rounded-xl border border-slate-200 p-3">
              <div className="text-sm font-semibold">Big Deal</div>
              <select
                className="mt-2 w-full rounded-xl border px-3 py-2 text-sm"
                value={selectedBigDealId}
                onChange={(e) => setSelectedBigDealId(e.target.value)}
              >
                {bigDeals.map((d: BigDeal) => (
                  <option value={d.id} key={d.id}>
                    {d.name} (cashflow +{d.cashflow})
                  </option>
                ))}
              </select>
              <div className="mt-2">
                <GradientButton onClick={() => bigDealM.mutate()} disabled={bigDealM.isPending || !selectedBigDealId}>
                  Buy
                </GradientButton>
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Player Finance</h2>
              <div className="text-sm text-slate-600">Click a row to open the financial card and see the cashflow formula.</div>
            </div>
            {selectedPlayer ? (
              <div className="text-sm text-slate-700">
                Cashflow now: <b>${selectedFinance?.cashflow.toLocaleString()}</b>
              </div>
            ) : null}
          </div>

          <div className="mt-3 overflow-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 text-left font-semibold">Player</th>
                  <th className="p-2 text-left font-semibold">Cash</th>
                  <th className="p-2 text-left font-semibold">Salary</th>
                  <th className="p-2 text-left font-semibold">Expenses</th>
                  <th className="p-2 text-left font-semibold">Passive Income</th>
                  <th className="p-2 text-left font-semibold">Children</th>
                  <th className="p-2 text-left font-semibold">Cashflow</th>
                </tr>
              </thead>
              <tbody>
                {finance.length === 0 ? (
                  <tr>
                    <td className="p-2 text-slate-500" colSpan={7}>
                      No players in this game yet.
                    </td>
                  </tr>
                ) : (
                  finance.map((f: PlayerFinanceDTO, idx: number) => (
                    <tr
                      key={f.player.id}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() => setPlayerModalId(f.player.id)}
                    >
                      <td className="p-2 font-medium">{f.player.name}</td>
                      <td className="p-2">${f.player.cash.toLocaleString()}</td>
                      <td className="p-2">${f.player.salary.toLocaleString()}</td>
                      <td className="p-2">${f.total_expenses.toLocaleString()}</td>
                      <td className="p-2">${f.player.passive_income.toLocaleString()}</td>
                      <td className="p-2">{f.player.children_count}</td>
                      <td className={`p-2 font-semibold ${f.cashflow >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        ${f.cashflow.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="font-semibold">Market / Transactions Queue</h3>
              <div className="mt-2 rounded-xl border border-slate-200 p-3">
                <div className="text-sm font-semibold">Create Sell Transaction</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-medium text-slate-600">
                    Seller
                    <select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                      {players.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-600">
                    Buyer
                    <select className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                      {players.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                    Asset (owned by seller)
                    <select
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                      value={assetId}
                      onChange={(e) => setAssetId(e.target.value)}
                    >
                      <option value="">Select asset...</option>
                      {ownedAssets.map((a: any) => (
                        <option value={a.id} key={a.id}>
                          {a.name} ({a.type}) cashflow +{a.income}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-600 sm:col-span-2">
                    Price
                    <input
                      type="number"
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                      value={sellPrice}
                      onChange={(e) => setSellPrice(Number(e.target.value))}
                    />
                  </label>
                </div>
                <div className="mt-3">
                  <GradientButton
                    className="w-full"
                    onClick={() => sellM.mutate()}
                    disabled={sellM.isPending || !assetId || sellPrice <= 0 || sellerId === buyerId}
                  >
                    Create Pending Transaction
                  </GradientButton>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">Pending</h3>
                <div className="text-xs text-slate-500">{pending.length} item(s)</div>
              </div>
              <div className="mt-2 space-y-2">
                {pending.length === 0 ? <div className="text-sm text-slate-500">No pending transactions.</div> : null}
                {pending.map((p: any) => {
                  const tx = p.transaction
                  const assetName = tx?.market_offer?.asset?.name ?? tx?.market_offer?.asset_id
                  const sellerName = tx?.market_offer?.seller?.name ?? tx?.market_offer?.seller_id
                  const buyerName = tx?.buyer?.name ?? tx?.buyer_id
                  return (
                    <div key={tx.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">Asset: {assetName}</div>
                          <div className="text-sm text-slate-600">
                            Seller: {sellerName} • Buyer: {buyerName}
                          </div>
                          <div className="text-sm">
                            Price: <b>${tx.offer_price?.toLocaleString ? tx.offer_price.toLocaleString() : tx.offer_price}</b>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <GradientButton
                            onClick={() => approveM.mutate(tx.id)}
                            disabled={approveM.isPending || rejectM.isPending}
                          >
                            Approve
                          </GradientButton>
                          <button
                            className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700"
                            disabled={approveM.isPending || rejectM.isPending}
                            onClick={() => rejectM.mutate(tx.id)}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Game Log</h2>
            <div className="text-sm text-slate-600">Chronological financial events (auditor actions + transaction approvals).</div>
          </div>
          <div className="text-sm text-slate-500">{logs.length} event(s)</div>
        </div>

        <div className="mt-3 overflow-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 text-left font-semibold">Player</th>
                <th className="p-2 text-left font-semibold">Event</th>
                <th className="p-2 text-left font-semibold">Amount</th>
                <th className="p-2 text-left font-semibold">Time</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td className="p-2 text-slate-500" colSpan={4}>
                    No events yet. Use the action panel to start the session.
                  </td>
                </tr>
              ) : (
                logs.slice(-60).map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="p-2 font-medium">{l.player_name}</td>
                    <td className="p-2">
                      <div className="font-semibold">{l.type}</div>
                      {l.description ? <div className="text-xs text-slate-600">{l.description}</div> : null}
                    </td>
                    <td className={`p-2 font-semibold ${l.amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {l.amount >= 0 ? '+' : ''}
                      {l.amount.toLocaleString()}
                    </td>
                    <td className="p-2 text-slate-600">{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <AnimatePresence>
        {playerModalId ? (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/45 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 18, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 18, opacity: 0 }}
              className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-card"
            >
              {(() => {
                const f = finance.find((x) => x.player.id === playerModalId)
                if (!f) return null
                return (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold">{f.player.name}</div>
                        <div className="text-sm text-slate-600">Profession: {(() => {
                          const prof = professions.find(p => p.id === f.player.profession_id)
                          return prof?.name ?? '—'
                        })()}</div>
                      </div>
                      <button className="rounded-xl border px-3 py-1 text-sm" onClick={() => setPlayerModalId(null)}>
                        Close
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <GlassCard>
                        <div className="text-sm text-slate-500">Cash</div>
                        <div className="text-xl font-semibold">${f.player.cash.toLocaleString()}</div>
                      </GlassCard>
                      <GlassCard>
                        <div className="text-sm text-slate-500">Children</div>
                        <div className="text-xl font-semibold">{f.player.children_count}</div>
                      </GlassCard>
                      <GlassCard>
                        <div className="text-sm text-slate-500">Salary</div>
                        <div className="text-xl font-semibold">${f.player.salary.toLocaleString()}</div>
                      </GlassCard>
                      <GlassCard>
                        <div className="text-sm text-slate-500">Expenses</div>
                        <div className="text-xl font-semibold">${f.player.expenses.toLocaleString()}</div>
                      </GlassCard>
                      <GlassCard className="sm:col-span-2">
                        <div className="text-sm text-slate-500">Cashflow formula</div>
                        <div className="mt-1 text-sm text-slate-700">
                          monthly cashflow = salary + passive income - total expenses
                        </div>
                        <div className="mt-2 text-sm">
                          salary: ${f.player.salary.toLocaleString()}
                        </div>
                        <div className="mt-1 text-sm">
                          passive income: ${f.player.passive_income.toLocaleString()}
                        </div>
                        <div className="mt-1 text-sm">
                          base expenses: ${f.base_expenses.toLocaleString()}
                        </div>
                        <div className="mt-1 text-sm">
                          child expense each: ${f.child_expense_each.toLocaleString()}
                        </div>
                        <div className="mt-1 text-sm">
                          children total expense: ${f.children_expense_total.toLocaleString()} ({f.player.children_count} children)
                        </div>
                        <div className="mt-1 text-sm">
                          total expenses: ${f.total_expenses.toLocaleString()}
                        </div>
                        <div className="mt-2 text-lg font-semibold">
                          Monthly cashflow: ${f.cashflow.toLocaleString()}
                        </div>
                      </GlassCard>
                    </div>
                  </>
                )
              })()}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

