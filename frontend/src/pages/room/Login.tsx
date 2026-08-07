import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { loginHost } from '@/api/hostAuth'
import { useHostAuthStore } from '@/store/hostAuthStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Home } from 'lucide-react'

export default function RoomLogin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const token = useHostAuthStore((s) => s.token)
  const setSession = useHostAuthStore((s) => s.setSession)
  if (token) return <Navigate to="/host/dashboard" replace />

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      const res = await loginHost(email, password)
      setSession(res.token)
      navigate('/host/dashboard', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('roomAuth.login.errorDefault'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
          <Home className="h-7 w-7 text-primary" />
        </div>
        <div className="text-left">
          <h1 className="text-xl font-semibold tracking-tight">CashYOU</h1>
          <p className="text-sm text-muted-foreground">{t('roomAuth.login.subtitle')}</p>
        </div>
      </div>

      <Card className="w-full max-w-md border-border">
        <CardHeader>
          <CardTitle>{t('roomAuth.login.title')}</CardTitle>
          <CardDescription>{t('roomAuth.login.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('roomAuth.login.emailLabel')}</Label>
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
              <Label htmlFor="password">{t('roomAuth.login.passwordLabel')}</Label>
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
              {loading ? t('roomAuth.login.submitting') : t('roomAuth.login.submit')}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('roomAuth.login.noAccount')}{' '}
            <Link to="/host/register" className="text-primary underline-offset-4 hover:underline">
              {t('roomAuth.login.registerLink')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
