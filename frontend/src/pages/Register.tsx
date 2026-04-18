import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { register } from '../api/auth'
import { useAuthStore } from '../store/authStore'
import { GradientButton, GlassCard } from '../components/ui'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const setToken = useAuthStore((s) => s.setToken)
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => register(email, password),
    onSuccess: (res) => {
      setToken(res.token)
      navigate('/start-game')
    },
  })

  return (
    <div className="mx-auto max-w-md">
      <GlassCard>
        <h1 className="mb-5 text-2xl font-semibold">Create account</h1>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border px-3 py-2"
          />
        </label>

        {mutation.error ? <div className="text-sm text-red-600">{String((mutation.error as Error).message)}</div> : null}

        <GradientButton onClick={() => mutation.mutate()} disabled={mutation.isPending as any} className="w-full">
          {mutation.isPending ? 'Creating...' : 'Create account'}
        </GradientButton>

        <div className="pt-2 text-sm text-slate-600">
          Have an account? <Link to="/login">Login</Link>
        </div>
      </div>
      </GlassCard>
    </div>
  )
}

