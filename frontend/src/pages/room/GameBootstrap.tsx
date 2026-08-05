import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { exchangeSessionToken } from '@/api/hostAuth'
import { useRoomPlayerStore } from '@/store/roomPlayerStore'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'

// Этап 2 bridge: exchanges this browser's room player_token for a real
// legacy game JWT exactly once, then hands off to the existing, untouched
// /play/* player frontend — see design/Task-Testing.md and
// handlers/rooms_game.go's ExchangeSessionToken.
export default function GameBootstrap() {
  const { code = '' } = useParams()
  const upperCode = code.toUpperCase()
  const playerToken = useRoomPlayerStore((s) => s.players[upperCode]?.playerToken ?? null)
  const setToken = useAuthStore((s) => s.setToken)
  const setGameId = usePlayStore((s) => s.setGameId)

  const [status, setStatus] = useState<'loading' | 'error' | 'done'>('loading')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!playerToken) {
      setStatus('error')
      setErr('no_identity')
      return
    }
    let cancelled = false
    exchangeSessionToken(upperCode, playerToken)
      .then((res) => {
        if (cancelled) return
        setToken(res.token)
        setGameId(res.game_id)
        setStatus('done')
      })
      .catch((e) => {
        if (cancelled) return
        setErr(e instanceof Error ? e.message : 'Не удалось войти в игру.')
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [upperCode, playerToken, setToken, setGameId])

  if (status === 'done') {
    return <Navigate to="/play/board" replace />
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-destructive">{err === 'no_identity' ? 'Не удалось опознать тебя в этой комнате.' : err}</p>
        <Link to={`/room/${upperCode}`} className="text-primary underline-offset-4 hover:underline">
          Вернуться в лобби
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p className="text-muted-foreground">Входим в игру…</p>
    </div>
  )
}
