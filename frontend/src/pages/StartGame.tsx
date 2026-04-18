import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GlassCard, GradientButton } from '../components/ui'
import { PROFESSION_TEMPLATES, type ProfessionProfile, useGameSetupStore } from '../store/gameSetupStore'

function passiveOpportunity() {
  const opportunities = [
    { title: 'Dividend ETF', income: 120 },
    { title: 'Mini Rental', income: 180 },
    { title: 'Small Business Share', income: 240 },
  ]
  return opportunities[Math.floor(Math.random() * opportunities.length)]
}

export default function StartGame() {
  const setProfession = useGameSetupStore((s) => s.setProfession)
  const navigate = useNavigate()
  const randomOpportunity = useMemo(() => passiveOpportunity(), [])

  const onSelect = (p: ProfessionProfile) => {
    setProfession({
      ...p,
      passiveIncome: p.passiveIncome + randomOpportunity.income,
    })
    navigate('/dashboard')
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Start Game: Choose Profession</h1>
      <p className="text-slate-600">
        Select a profession to initialize salary, expenses, liabilities (including mortgage-like debt), and starting cash.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
        <b>Digital adaptation note:</b> this platform adapts core Cashflow mechanics online: profession start, monthly payday
        (income - expenses), asset deals, and auditor verification before transactions are finalized.
      </div>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">
        Random passive-income opportunity this round: <b>{randomOpportunity.title}</b> (+${randomOpportunity.income}/month)
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Exit condition from Rat Race: passive income must become higher than total expenses.
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          Bankruptcy risk: if monthly cashflow is negative and no cash reserves remain, assets are liquidated at discount.
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {PROFESSION_TEMPLATES.map((p, i) => (
          <motion.div key={p.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <GlassCard>
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>Salary: ${p.salary}</div>
                <div>Expenses: ${p.expenses}</div>
                <div>Liabilities: ${p.liabilities}</div>
                <div>Starting Cash: ${p.startingCash}</div>
              </div>
              <GradientButton className="mt-4 w-full" onClick={() => onSelect(p)}>
                Select Profession
              </GradientButton>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

