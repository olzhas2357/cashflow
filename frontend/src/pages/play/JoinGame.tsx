import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { join } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dice5 } from 'lucide-react'

export default function JoinGame() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)
  const setGameId = usePlayStore((s) => s.setGameId)

  const [searchParams] = useSearchParams()
  const [joinCode, setJoinCode] = useState(searchParams.get('code') ?? '')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      const res = await join(joinCode.trim().toUpperCase(), name.trim())
      setToken(res.token)
      setGameId(res.game_id)
      navigate('/play/onboarding', { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('game.joinGame.errorDefault'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
          <Dice5 className="h-7 w-7 text-primary" />
        </div>
        <div className="text-left">
          <h1 className="text-xl font-semibold tracking-tight">Cashflow 101</h1>
          <p className="text-sm text-muted-foreground">{t('game.joinGame.subtitle')}</p>
        </div>
      </div>

      <Card className="w-full max-w-md border-border">
        <CardHeader>
          <CardTitle>{t('game.joinGame.subtitle')}</CardTitle>
          <CardDescription>{t('game.joinGame.cardDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="joinCode">{t('game.joinGame.joinCodeLabel')}</Label>
              <Input
                id="joinCode"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="ABC123"
                autoCapitalize="characters"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">{t('game.joinGame.nameLabel')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('game.joinGame.joining') : t('game.joinGame.join')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
