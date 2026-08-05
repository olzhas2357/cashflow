import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Copy, Check, Crown, User } from 'lucide-react'
import { getRoomState } from '@/api/hostAuth'
import { useHostAuthStore } from '@/store/hostAuthStore'
import { useRoomPlayerStore } from '@/store/roomPlayerStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function Room() {
  const { code = '' } = useParams()
  const upperCode = code.toUpperCase()
  const hostUserId = useHostAuthStore((s) => s.userId)
  const myGuestSeat = useRoomPlayerStore((s) => (s.code === upperCode ? s.seat : null))
  const [copied, setCopied] = useState(false)

  const roomQ = useQuery({
    queryKey: ['room_state', upperCode],
    queryFn: () => getRoomState(upperCode),
    enabled: !!upperCode,
    refetchInterval: 3000,
  })

  const room = roomQ.data
  const amHost = !!hostUserId && room?.host_user_id === hostUserId
  const iAmIdentified = amHost || myGuestSeat != null

  const joinUrl = `${window.location.origin}/join/${upperCode}`
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — link is still visible to copy manually
    }
  }

  if (roomQ.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-destructive">
          {roomQ.error instanceof Error ? roomQ.error.message : 'Комната не найдена.'}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Код комнаты</p>
        <div className="font-mono text-5xl font-bold tracking-[0.3em] text-primary">{upperCode}</div>
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button variant="outline" className="gap-2" onClick={copyLink}>
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Скопировано' : 'Копировать ссылку'}
        </Button>
      </div>

      {!iAmIdentified && (
        <p className="text-center text-sm text-muted-foreground">
          Ты смотришь эту комнату со стороны.{' '}
          <Link to={`/join/${upperCode}`} className="text-primary underline-offset-4 hover:underline">
            Войти как гость
          </Link>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Игроки</CardTitle>
          <CardDescription>{room?.players.length ?? 0} / 6</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {room?.players.map((p) => {
            const isMe = (amHost && p.is_host) || (!amHost && myGuestSeat === p.seat)
            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  {p.is_host ? <Crown className="h-4 w-4 text-amber-400" /> : <User className="h-4 w-4 text-muted-foreground" />}
                  {p.name}
                  {isMe && <Badge variant="muted">Ты</Badge>}
                </span>
                {p.is_host && <Badge variant="warning">Хост</Badge>}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">Статус: {room?.status ?? '…'}</p>
    </div>
  )
}
