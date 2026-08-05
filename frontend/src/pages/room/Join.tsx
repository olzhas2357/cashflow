import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { joinRoom } from '@/api/hostAuth'
import { useRoomPlayerStore } from '@/store/roomPlayerStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users } from 'lucide-react'

export default function RoomJoin() {
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const setGuest = useRoomPlayerStore((s) => s.setGuest)

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
      setGuest(code.toUpperCase(), me?.seat ?? 0, name.trim())
      navigate(`/room/${code.toUpperCase()}`, { replace: true })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось войти в комнату.')
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
          <p className="text-sm text-muted-foreground">Комната {code.toUpperCase()}</p>
        </div>
      </div>

      <Card className="w-full max-w-md border-border">
        <CardHeader>
          <CardTitle>Присоединиться</CardTitle>
          <CardDescription>Регистрация не нужна — просто укажи своё имя.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Твоё имя</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Вход…' : 'Войти в игру'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
