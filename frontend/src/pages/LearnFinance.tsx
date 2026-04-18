import { motion } from 'framer-motion'
import { GlassCard } from '../components/ui'

const glossary = [
  { term: 'Passive Income', description: 'Earnings that continue without active work, such as rental or dividends.' },
  { term: 'Liabilities', description: 'Debt obligations that reduce net worth and monthly cashflow.' },
  { term: 'Asset', description: 'A resource with economic value that can produce income or appreciate.' },
  { term: 'Payday', description: 'Monthly payout equals total income minus total expenses. Missing payout means lost turn benefit in board rules.' },
  { term: 'Rat Race', description: 'Stage where salary drives survival and liabilities absorb cashflow.' },
  { term: 'Fast Track', description: 'Reached when passive income exceeds monthly expenses.' },
]

export default function LearnFinance() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Financial Learning Hub</h1>
      <p className="text-slate-600">Hover cards, quick glossary, and mini simulations designed for board-game style learning.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {glossary.map((item, idx) => (
          <motion.div key={item.term} whileHover={{ y: -4 }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}>
            <GlassCard>
              <h3 className="font-semibold">{item.term}</h3>
              <p className="mt-2 text-sm text-slate-600">{item.description}</p>
            </GlassCard>
          </motion.div>
        ))}
      </div>
      <GlassCard>
        <h2 className="font-semibold">Mini Simulation</h2>
        <p className="mt-2 text-sm text-slate-600">
          Buy an asset generating $300 monthly income and compare your net cashflow against fixed expenses to understand freedom number dynamics.
        </p>
      </GlassCard>
      <GlassCard>
        <h2 className="font-semibold">Cashflow Game Rules (adapted)</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Small deals are up to $5000; large deals are $6000 and above.</li>
          <li>Auditor validates each agreed transaction before approval.</li>
          <li>Victory path is to escape Rat Race and pursue high-cashflow goals on Fast Track.</li>
        </ul>
      </GlassCard>
    </div>
  )
}

