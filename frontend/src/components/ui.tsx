import { motion } from 'framer-motion'
import type { PropsWithChildren } from 'react'
import type React from 'react'

export function GlassCard({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={`rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-card ${className}`}
    >
      {children}
    </motion.div>
  )
}

export function GradientButton({
  children,
  className = '',
  ...props
}: PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }>) {
  return (
    <button
      {...props}
      className={`rounded-xl bg-gradient-to-r from-brand-500 to-indigo-500 px-4 py-2 font-medium text-white shadow transition hover:brightness-110 disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  )
}

