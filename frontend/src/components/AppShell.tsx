import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuthStore } from '../store/authStore'
import type React from 'react'

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="app-container flex h-16 items-center justify-between">
          <Link to="/" className="font-semibold tracking-tight text-slate-900">
            Cashflow
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-700">
            <Link to="/start-game">Start Game</Link>
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/market">Market</Link>
            <Link to="/auditor">Auditor</Link>
            <Link to="/learn">Learn</Link>
            {user ? (
              <motion.button whileTap={{ scale: 0.97 }} onClick={logout} className="rounded-lg border px-3 py-1.5">
                Logout
              </motion.button>
            ) : (
              <Link to="/login">Login</Link>
            )}
          </nav>
        </div>
      </header>
      <main className="app-container py-6">{children}</main>
    </div>
  )
}

