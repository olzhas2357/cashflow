import React, { useMemo, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { getAssets, getFinance, listMarket, proposeOnMarket, sellAsset } from '../api/board'
import { StatCard } from '../components/StatCard'
import { Button } from '../components/Button'

export default function PlayerDashboard() {
  const { token, user } = useAuth()
  const playerId = user?.player_id ?? ''

  const financeQ = useQuery({
    queryKey: ['finance', playerId],
    queryFn: () => getFinance(token!, playerId),
    enabled: !!token && !!playerId,
  })
  const assetsQ = useQuery({
    queryKey: ['assets'],
    queryFn: () => getAssets(token!),
    enabled: !!token,
  })
  const marketQ = useQuery({
    queryKey: ['market'],
    queryFn: () => listMarket(token!),
    enabled: !!token,
  })

  const [sellPrices, setSellPrices] = useState<Record<string, string>>({})
  const [proposalOffers, setProposalOffers] = useState<Record<string, string>>({})
  const [proposalMessages, setProposalMessages] = useState<Record<string, string>>({})

  const sellMutation = useMutation({
    mutationFn: (payload: { assetId: string; price: number }) =>
      sellAsset(token!, payload.assetId, payload.price),
    onSuccess: () => marketQ.refetch(),
  })

  const proposeMutation = useMutation({
    mutationFn: (payload: { marketOfferId: string; offerPrice: number; message: string }) =>
      proposeOnMarket(token!, {
        market_offer_id: payload.marketOfferId,
        buyer_id: playerId,
        offer_price: payload.offerPrice,
        message: payload.message,
      }),
    onSuccess: () => marketQ.refetch(),
  })

  const finance = financeQ.data

  const formatMoney = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString()

  const playerAssets = assetsQ.data ?? []
  const marketOffers = marketQ.data ?? []

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Player Dashboard</h1>
        <div style={{ color: '#6b7280', fontSize: 13 }}>
          Player: <span style={{ fontFamily: 'monospace' }}>{playerId}</span>
        </div>
      </div>

      <div style={{ marginTop: 16 }} />

      <div className="grid">
        <StatCard label="Assets (value)" value={finance ? formatMoney(finance.balance_sheet.assets) : '...'} />
        <StatCard label="Liabilities" value={finance ? formatMoney(finance.balance_sheet.liabilities) : '...'} />
        <StatCard label="Net Cash Change" value={finance ? formatMoney(finance.cashflow.net_cash_change) : '...'} />
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Your Assets</h2>
          {assetsQ.isLoading ? (
            <div>Loading...</div>
          ) : playerAssets.length === 0 ? (
            <div>No assets yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {playerAssets.map((a) => (
                <div key={a.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{a.name}</div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>
                        {a.type} | Price: {formatMoney(a.price)}
                      </div>
                    </div>
                    <div style={{ minWidth: 220 }}>
                      <input
                        placeholder="Sell price"
                        value={sellPrices[a.id] ?? ''}
                        onChange={(e) => setSellPrices((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        style={{ width: '100%', padding: 10 }}
                      />
                      <div style={{ height: 10 }} />
                      <Button
                        variant="secondary"
                        disabled={sellMutation.isPending}
                        onClick={() => {
                          const v = Number(sellPrices[a.id] ?? 0)
                          if (!v || v <= 0) return
                          sellMutation.mutate({ assetId: a.id, price: v })
                        }}
                      >
                        {sellMutation.isPending ? 'Submitting...' : 'Sell'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Market</h2>
          {marketQ.isLoading ? (
            <div>Loading...</div>
          ) : marketOffers.length === 0 ? (
            <div>No offers available.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {marketOffers.map((o) => (
                <div key={o.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>Offer: {o.asset?.name ?? o.asset_id}</div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>
                        Asking: {formatMoney(o.price)} | Status: {o.status}
                      </div>
                    </div>
                    <div style={{ minWidth: 280 }}>
                      <input
                        placeholder="Your offer price"
                        value={proposalOffers[o.id] ?? ''}
                        onChange={(e) =>
                          setProposalOffers((prev) => ({ ...prev, [o.id]: e.target.value }))
                        }
                        style={{ width: '100%', padding: 10, marginBottom: 8 }}
                      />
                      <input
                        placeholder="Message (optional)"
                        value={proposalMessages[o.id] ?? ''}
                        onChange={(e) =>
                          setProposalMessages((prev) => ({ ...prev, [o.id]: e.target.value }))
                        }
                        style={{ width: '100%', padding: 10, marginBottom: 8 }}
                      />
                      <Button
                        disabled={proposeMutation.isPending}
                        variant="primary"
                        onClick={() => {
                          const offerPrice = Number(proposalOffers[o.id] ?? 0)
                          if (!offerPrice || offerPrice <= 0) return
                          proposeMutation.mutate({
                            marketOfferId: o.id,
                            offerPrice,
                            message: proposalMessages[o.id] ?? '',
                          })
                        }}
                      >
                        {proposeMutation.isPending ? 'Proposing...' : 'Propose'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

