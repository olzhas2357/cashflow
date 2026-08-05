import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Check, Plus, Users } from 'lucide-react'
import { useHostAuthStore } from '@/store/hostAuthStore'
import { useRoomPlayerStore } from '@/store/roomPlayerStore'
import { createRoom, listMyRooms } from '@/api/hostAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function statusLabel(status: string) {
  if (status === 'WAITING') return { label: 'Ожидание', variant: 'warning' as const }
  if (status === 'IN_PROGRESS') return { label: 'Идёт игра', variant: 'success' as const }
  return { label: 'Завершена', variant: 'muted' as const }
}

function CopyLinkButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${code}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable — code is still visible to read/type manually
    }
  }
  return (
    <Button type="button" size="icon" variant="ghost" onClick={copy} title="Копировать ссылку">
      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </Button>
  )
}

export default function RoomDashboard() {
  const navigate = useNavigate()
  const token = useHostAuthStore((s) => s.token)
  const setPlayer = useRoomPlayerStore((s) => s.setPlayer)
  const qc = useQueryClient()

  const roomsQ = useQuery({
    queryKey: ['my_rooms'],
    queryFn: () => listMyRooms(token!),
    enabled: !!token,
  })

  const createMut = useMutation({
    mutationFn: () => createRoom(token!),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['my_rooms'] })
      // Этап 2: the host uses the same player_token bridge as a guest to
      // enter the game once it starts.
      setPlayer(res.code, 1, '', res.player_token)
      navigate(`/room/${res.code}`)
    },
  })

  const rooms = roomsQ.data ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Мои игры</h1>
          <p className="text-sm text-muted-foreground">Создай комнату и пришли ссылку друзьям.</p>
        </div>
        <Button size="lg" className="gap-2" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
          <Plus className="h-5 w-5" />
          {createMut.isPending ? 'Создаём…' : 'Создать игру'}
        </Button>
      </div>

      {createMut.isError && (
        <p className="text-sm text-destructive">
          {createMut.error instanceof Error ? createMut.error.message : 'Не удалось создать игру.'}
        </p>
      )}

      {roomsQ.isLoading && <p className="text-muted-foreground">Загрузка…</p>}

      <div className="space-y-3">
        {rooms.map((r) => {
          const st = statusLabel(r.status)
          return (
            <Card key={r.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="font-mono tracking-widest">{r.code}</CardTitle>
                  <CardDescription>{new Date(r.created_at).toLocaleString()}</CardDescription>
                </div>
                <Badge variant={st.variant === 'success' ? 'success' : st.variant === 'warning' ? 'warning' : 'muted'}>
                  {st.label}
                </Badge>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Button asChild variant="secondary" size="sm" className="flex-1 gap-2">
                  <Link to={`/room/${r.code}`}>
                    <Users className="h-4 w-4" />
                    Открыть лобби
                  </Link>
                </Button>
                <CopyLinkButton code={r.code} />
              </CardContent>
            </Card>
          )
        })}
      </div>

      {!roomsQ.isLoading && rooms.length === 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Пока нет игр</CardTitle>
            <CardDescription>Нажми «Создать игру», чтобы получить код и ссылку для друзей.</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}
