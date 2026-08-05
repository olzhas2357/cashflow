import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Check, Crown, User, CheckCircle2, Circle } from 'lucide-react'
import { getMyRoomPlayerToken, getRoomState, listProfessions, setRoomProfession, startRoomGame } from '@/api/hostAuth'
import { useHostAuthStore } from '@/store/hostAuthStore'
import { useRoomPlayerStore } from '@/store/roomPlayerStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function Room() {
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const upperCode = code.toUpperCase()
  const hostUserId = useHostAuthStore((s) => s.userId)
  const hostToken = useHostAuthStore((s) => s.token)
  const storedEntry = useRoomPlayerStore((s) => s.players[upperCode] ?? null)
  const setPlayer = useRoomPlayerStore((s) => s.setPlayer)
  const myGuestSeat = storedEntry?.seat ?? null
  const myPlayerToken = storedEntry?.playerToken ?? null
  const [copied, setCopied] = useState(false)
  const [professionId, setProfessionId] = useState('')
  const qc = useQueryClient()

  const roomQ = useQuery({
    queryKey: ['room_state', upperCode],
    queryFn: () => getRoomState(upperCode),
    enabled: !!upperCode,
    refetchInterval: 2000,
  })

  const professionsQ = useQuery({
    queryKey: ['room_professions'],
    queryFn: () => listProfessions(),
  })

  const room = roomQ.data
  const amHost = !!hostUserId && room?.host_user_id === hostUserId
  const iAmIdentified = amHost || myGuestSeat != null
  const me = room?.players.find((p) => (amHost ? p.is_host : p.seat === myGuestSeat))

  // Self-heal: a host revisiting a room whose player_token this browser
  // never stored (or lost — e.g. overwritten before the per-room-code fix)
  // can always recover it, since their identity is already proven by the
  // room JWT matching this room's host_user_id.
  useEffect(() => {
    if (amHost && !storedEntry && hostToken) {
      getMyRoomPlayerToken(upperCode, hostToken)
        .then((res) => setPlayer(upperCode, res.seat, res.name, res.player_token))
        .catch(() => {
          // best-effort — the profession picker just stays hidden if this fails
        })
    }
  }, [amHost, storedEntry, hostToken, upperCode, setPlayer])

  useEffect(() => {
    if (room?.status === 'IN_PROGRESS') {
      navigate(`/game/${upperCode}`, { replace: true })
    }
  }, [room?.status, upperCode, navigate])

  const professionMut = useMutation({
    mutationFn: (profId: string) => setRoomProfession(upperCode, myPlayerToken!, profId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room_state', upperCode] }),
  })

  const startMut = useMutation({
    mutationFn: () => startRoomGame(upperCode, hostToken!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room_state', upperCode] }),
  })

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

  const allReady = !!room && room.players.length >= 2 && room.players.every((p) => !!p.profession_id)

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
                <span className="flex items-center gap-2">
                  {p.is_host && <Badge variant="warning">Хост</Badge>}
                  {p.profession_id ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Готов
                    </Badge>
                  ) : (
                    <Badge variant="muted" className="gap-1">
                      <Circle className="h-3 w-3" /> Выбирает
                    </Badge>
                  )}
                </span>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {iAmIdentified && myPlayerToken && !me?.profession_id && (
        <Card>
          <CardHeader>
            <CardTitle>Выбери профессию</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={professionId} onValueChange={setProfessionId}>
              <SelectTrigger>
                <SelectValue placeholder="Профессия" />
              </SelectTrigger>
              <SelectContent>
                {professionsQ.data?.map((prof) => (
                  <SelectItem key={prof.id} value={prof.id}>
                    {prof.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              disabled={!professionId || professionMut.isPending}
              onClick={() => professionMut.mutate(professionId)}
            >
              {professionMut.isPending ? 'Сохраняем…' : 'Готово'}
            </Button>
            {professionMut.isError && (
              <p className="text-sm text-destructive">
                {professionMut.error instanceof Error ? professionMut.error.message : 'Не удалось выбрать профессию.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {amHost && (
        <div className="space-y-2">
          <Button className="w-full" size="lg" disabled={!allReady || startMut.isPending} onClick={() => startMut.mutate()}>
            {startMut.isPending ? 'Запускаем…' : 'Начать игру'}
          </Button>
          {!allReady && (
            <p className="text-center text-xs text-muted-foreground">
              Нужно минимум 2 игрока, и все должны выбрать профессию.
            </p>
          )}
          {startMut.isError && (
            <p className="text-center text-sm text-destructive">
              {startMut.error instanceof Error ? startMut.error.message : 'Не удалось начать игру.'}
            </p>
          )}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">Статус: {room?.status ?? '…'}</p>
    </div>
  )
}
