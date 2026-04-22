import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { login } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ClipboardList } from 'lucide-react'

export default function AuditorLogin() {
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)
  const existing = useAuthStore((s) => s.user)
  const hasToken = useAuthStore((s) => s.token)
  if (hasToken && (existing?.role === 'auditor' || existing?.role === 'admin')) {
    return <Navigate to="/auditor/dashboard" replace />
  }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      const res = await login(email, password)
      if (res.user.role !== 'auditor' && res.user.role !== 'admin') {
        setErr('This account is not an auditor. Use an auditor login.')
        return
      }
      setToken(res.token)
      navigate('/auditor/dashboard', { replace: true })
    } catch {
      setErr('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
          <ClipboardList className="h-7 w-7 text-primary" />
        </div>
        <div className="text-left">
          <h1 className="text-xl font-semibold tracking-tight">Cashflow 101</h1>
          <p className="text-sm text-muted-foreground">Auditor / accountant console</p>
        </div>
      </div>

      <Card className="w-full max-w-md border-border">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Enter your auditor credentials to manage live sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Login'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
