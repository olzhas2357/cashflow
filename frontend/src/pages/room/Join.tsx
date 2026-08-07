import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { joinRoom } from '@/api/hostAuth'
import { useRoomPlayerStore } from '@/store/roomPlayerStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users } from 'lucide-react'

export default function RoomJoin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const setPlayer = useRoomPlayerStore((s) => s.setPlayer)

  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    try {
      const res = await joinRoom(code.toUpperCase(), name.trim())
      const me = res.room.players.find((p) => p.name === name.trim() && !p.is_host)
      setPlayer(code.toUpperCase(), me?.seat ?? 0, name.trim(), res.player_token)
      navigate(`/room/${code.toUpperCase()}`, { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('roomAuth.join.errorDefault'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
          <Users className="h-7 w-7 text-primary" />
        </div>
        <div className="text-left">
          <h1 className="text-xl font-semibold tracking-tight">Cashflow 101</h1>
          <p className="text-sm text-muted-foreground">
            {t('roomAuth.join.roomLabel', { code: code.toUpperCase() })}
          </p>
        </div>
      </div>

      <Card className="w-full max-w-md border-border">
        <CardHeader>
          <CardTitle>{t('roomAuth.join.title')}</CardTitle>
          <CardDescription>{t('roomAuth.join.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('roomAuth.join.nameLabel')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('roomAuth.join.submitting') : t('roomAuth.join.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
