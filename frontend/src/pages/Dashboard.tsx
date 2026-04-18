import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { getAssets, getFinance } from '../api/board'
import { useAuthStore } from '../store/authStore'
import { useNotificationsStore } from '../store/notificationsStore'
import { GlassCard, GradientButton } from '../components/ui'
import { useGameSetupStore } from '../store/gameSetupStore'

export default function Dashboard() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const notifications = useNotificationsStore((s) => s.items)
  const profile = useGameSetupStore((s) => s.selected)
  const [openTerm, setOpenTerm] = useState<string | null>(null)

  const financeQ = useQuery({
    queryKey: ['finance', user?.player_id],
    queryFn: () => getFinance(token!, user!.player_id),
    enabled: !!token && !!user?.player_id,
  })
  const assetsQ = useQuery({
    queryKey: ['assets'],
    queryFn: () => getAssets(token!),
    enabled: !!token,
  })

  const finance = financeQ.data
  const cards = [
    { label: 'Cashflow', value: finance?.cashflow.net_cash_change ?? ((profile?.salary ?? 0) + (profile?.passiveIncome ?? 0) - (profile?.expenses ?? 0)) },
    { label: 'Net Worth', value: finance?.balance_sheet.equity ?? 64000 },
    { label: 'Passive Income', value: finance?.income_statement.total_income ?? (profile?.passiveIncome ?? 2800) },
    { label: 'Expenses', value: finance?.income_statement.total_expenses ?? (profile?.expenses ?? 1300) },
  ]
  const monthlyCashflow = cards[0].value
  const passiveIncome = profile?.passiveIncome ?? cards[2].value
  const monthlyExpenses = profile?.expenses ?? cards[3].value
  const isFinancialFree = passiveIncome > monthlyExpenses

  const netWorthSeries = [30, 45, 42, 58, 62, 74, 80]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Player Dashboard</h1>
      <GlassCard className={isFinancialFree ? 'border-emerald-300 bg-emerald-50/60' : 'border-amber-300 bg-amber-50/60'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600">Cashflow Status (Rat Race rule)</p>
            <p className="text-lg font-semibold">
              {isFinancialFree ? 'Fast Track unlocked' : 'Still in Rat Race'}
            </p>
          </div>
          <div className="text-sm text-slate-700">
            Passive income: <b>${passiveIncome.toLocaleString()}</b> vs Expenses:{' '}
            <b>${monthlyExpenses.toLocaleString()}</b>
            <div>Monthly cashflow: <b>${monthlyCashflow.toLocaleString()}</b></div>
          </div>
        </div>
      </GlassCard>
      {profile ? (
        <GlassCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">Profession Profile</p>
              <p className="text-lg font-semibold">{profile.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <span>Salary: ${profile.salary}</span>
              <span>Expenses: ${profile.expenses}</span>
              <span>Liabilities: ${profile.liabilities}</span>
              <span>Starting cash: ${profile.startingCash}</span>
            </div>
          </div>
        </GlassCard>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {['Passive income', 'Assets', 'Liabilities', 'Cashflow'].map((term) => (
          <button key={term} className="rounded-full border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100" onClick={() => setOpenTerm(term)}>
            {term} ?
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, idx) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
            <GlassCard>
              <p className="text-sm text-slate-500">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold">${c.value.toLocaleString()}</p>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <h2 className="font-semibold">Net Worth Trend</h2>
          <div className="mt-4 flex h-36 items-end gap-2">
            {netWorthSeries.map((point, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${point}%` }}
                transition={{ delay: i * 0.05, duration: 0.4 }}
                className="w-full rounded-t bg-gradient-to-t from-brand-600 to-brand-400"
              />
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <h2 className="font-semibold">Notifications</h2>
          <div className="mt-3 space-y-2 text-sm">
            {notifications.slice(0, 5).map((n) => (
              <div key={n.id} className="rounded-lg border border-slate-200 p-2">
                <p className="font-medium">{n.type}</p>
                <p className="text-slate-600">{n.message}</p>
              </div>
            ))}
            {notifications.length === 0 && <p className="text-slate-500">No live updates yet.</p>}
          </div>
        </GlassCard>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(assetsQ.data ?? []).slice(0, 8).map((asset) => (
          <GlassCard key={asset.id}>
            <h3 className="font-semibold">{asset.name}</h3>
            <p className="text-sm text-slate-600">{asset.type}</p>
            <p className="mt-2 text-sm">Price: ${asset.price.toLocaleString()}</p>
          </GlassCard>
        ))}
      </div>

      <AnimatePresence>
        {openTerm && (
          <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-card">
              <h3 className="text-lg font-semibold">{openTerm}</h3>
              <p className="mt-2 text-sm text-slate-600">
                {openTerm === 'Passive income' && 'Income that continues to come in from assets even when you are not actively working.'}
                {openTerm === 'Assets' && 'Resources that can generate cashflow or appreciate in value, such as stocks, real estate, or business equity.'}
                {openTerm === 'Liabilities' && 'Debts and obligations (e.g., mortgage) that reduce your monthly cashflow and net worth.'}
                {openTerm === 'Cashflow' && 'The monthly difference between total income and total expenses.'}
              </p>
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                Deal impact preview: after buying a cashflow-generating asset, your passive income grows and can help exceed expenses faster.
              </div>
              <GradientButton className="mt-4" onClick={() => setOpenTerm(null)}>
                Got it
              </GradientButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

