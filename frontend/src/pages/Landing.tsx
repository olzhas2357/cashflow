import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { fadeUp } from '../animations/motionPresets'
import { GradientButton, GlassCard } from '../components/ui'

export default function Landing() {
  return (
    <div className="space-y-10">
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <motion.div {...fadeUp}>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Cashflow online: a digital adaptation of Robert Kiyosaki's board game.
          </h1>
          <p className="mt-4 max-w-xl text-slate-600">
            This platform is a digital adaptation of the Cashflow (Денежный поток) game: track cashflow, negotiate deals in real-time,
            and verify every transaction through an auditor workflow.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/start-game">
              <GradientButton>Start Game</GradientButton>
            </Link>
            <Link to="/learn">
              <button className="rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100">
                Learn Finance
              </button>
            </Link>
          </div>
        </motion.div>

        <motion.div {...fadeUp} transition={{ delay: 0.1, duration: 0.5 }} className="grid grid-cols-2 gap-3">
          {['Coins', 'Stocks', 'Real Estate', 'Business'].map((label, i) => (
            <motion.div
              key={label}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2.4 + i * 0.2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <GlassCard className="h-28 flex items-center justify-center text-lg font-semibold">
                {label}
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </div>
  )
}

