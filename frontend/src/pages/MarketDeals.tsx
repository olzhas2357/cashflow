import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { listMarket, proposeOnMarket } from '../api/board'
import { useAuthStore } from '../store/authStore'
import { useNotificationsStore } from '../store/notificationsStore'
import { GlassCard, GradientButton } from '../components/ui'

export default function MarketDeals() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const push = useNotificationsStore((s) => s.push)
  const [message, setMessage] = useState('')
  const [offer, setOffer] = useState<number>(0)
  const [activeOfferId, setActiveOfferId] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatLog, setChatLog] = useState<Array<{ id: string; text: string; author: string }>>([])

  const marketQ = useQuery({
    queryKey: ['market'],
    queryFn: () => listMarket(token!),
    enabled: !!token,
    refetchInterval: 4000,
  })

  const proposalM = useMutation({
    mutationFn: (payload: { offerId: string; price: number; message: string }) =>
      proposeOnMarket(token!, {
        market_offer_id: payload.offerId,
        buyer_id: user!.player_id,
        offer_price: payload.price,
        message: payload.message,
      }),
    onSuccess: () => {
      push({ type: 'proposal_sent', message: 'Your counteroffer has been sent.' })
      setActiveOfferId(null)
      marketQ.refetch()
    },
  })

  const offers = marketQ.data ?? []
  // Based on Cashflow guide: small deals up to $5000, large deals from $6000.
  const smallDeals = offers.filter((o) => o.price <= 5000)
  const largeDeals = offers.filter((o) => o.price >= 6000)

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Market & Deals</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Small Deals</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {smallDeals.map((m, i) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <GlassCard className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{m.asset?.name ?? m.asset_id.slice(0, 8)}</h3>
                  <p className="text-sm text-slate-600">{m.asset?.type ?? 'investment'}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    m.status === 'open'
                      ? 'bg-emerald-100 text-emerald-700'
                      : m.status === 'negotiation'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {m.status}
                </span>
              </div>
              <p className="mt-3 text-xl font-semibold">${m.price.toLocaleString()}</p>
              {m.price >= 6000 && (
                <p className="mt-1 inline-block rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                  Large deal
                </p>
              )}
              <div className="mt-4">
                <GradientButton className="w-full" onClick={() => setActiveOfferId(m.id)}>
                  Negotiate
                </GradientButton>
              </div>
            </GlassCard>
          </motion.div>
          ))}
          {smallDeals.length === 0 && <div className="text-sm text-slate-500">No small deals available.</div>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Large Deals</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {largeDeals.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <GlassCard className="relative border-violet-300 bg-violet-50/40">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{m.asset?.name ?? m.asset_id.slice(0, 8)}</h3>
                    <p className="text-sm text-slate-600">{m.asset?.type ?? 'investment'}</p>
                  </div>
                  <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-medium text-violet-700">Large</span>
                </div>
                <p className="mt-3 text-xl font-semibold">${m.price.toLocaleString()}</p>
                <div className="mt-4">
                  <GradientButton className="w-full" onClick={() => setActiveOfferId(m.id)}>
                    Negotiate
                  </GradientButton>
                </div>
              </GlassCard>
            </motion.div>
          ))}
          {largeDeals.length === 0 && <div className="text-sm text-slate-500">No large deals available.</div>}
        </div>
      </section>

      <AnimatePresence>
        {activeOfferId && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 20, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-card"
            >
              <h2 className="text-lg font-semibold">Send counteroffer</h2>
              <input
                type="number"
                placeholder="Offer price"
                value={offer || ''}
                onChange={(e) => setOffer(Number(e.target.value))}
                className="mt-3 w-full rounded-xl border px-3 py-2"
              />
              <textarea
                placeholder="Message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-3 h-24 w-full rounded-xl border px-3 py-2"
              />
              <div className="mt-4 flex gap-2">
                <GradientButton
                  onClick={() => proposalM.mutate({ offerId: activeOfferId, price: offer, message })}
                  disabled={proposalM.isPending || !offer}
                >
                  {proposalM.isPending ? 'Sending...' : 'Send'}
                </GradientButton>
                <button className="rounded-xl border px-4 py-2" onClick={() => setActiveOfferId(null)}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <GlassCard>
        <h2 className="text-lg font-semibold">Player Chat (simulation)</h2>
        <div className="mt-3 h-40 space-y-2 overflow-auto rounded-lg border border-slate-200 p-2 text-sm">
          {chatLog.map((msg) => (
            <div key={msg.id}>
              <span className="font-medium">{msg.author}: </span>
              <span>{msg.text}</span>
            </div>
          ))}
          {chatLog.length === 0 && <p className="text-slate-500">No messages yet. Start discussing a deal.</p>}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type message to players..."
            className="w-full rounded-xl border px-3 py-2"
          />
          <GradientButton
            onClick={() => {
              if (!chatInput.trim()) return
              setChatLog((prev) => [
                ...prev,
                { id: `${Date.now()}`, text: chatInput.trim(), author: user?.player_id.slice(0, 8) ?? 'Player' },
              ])
              push({ type: 'chat', message: chatInput.trim() })
              setChatInput('')
            }}
          >
            Send
          </GradientButton>
        </div>
      </GlassCard>
    </div>
  )
}

