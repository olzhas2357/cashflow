import { useEffect, useRef } from 'react'
import { useNotificationsStore } from '../store/notificationsStore'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export type GameEvent = {
  type: string
  timestamp: string
  payload: Record<string, unknown>
}

type Handlers = Partial<Record<string, (payload: Record<string, unknown>) => void>>

const EVENT_LABELS: Record<string, string> = {
  PLAYER_JOINED: 'A player joined the game',
  PLAYER_READY: 'A player is ready',
  GAME_STARTED: 'Game started!',
  DICE_ROLLED: 'Dice rolled',
  PAYDAY_RECEIVED: 'Payday collected',
  DOODAD_PAID: 'Doodad expense paid',
  BABY_BORN: 'A baby was born',
  PLAYER_DOWNSIZED: 'A player was downsized',
  CHARITY_PAID: 'Charity donation made',
  DEAL_DRAWN: 'A deal card was drawn',
  DECISION_MADE: 'Decision made',
  TURN_CHANGED: "Next player's turn",
  PLAYER_WON: 'A player won the game!',
}

// Connects to the game-scoped realtime channel with exponential-backoff
// reconnect (unlike the dead useNegotiationSocket, which never reconnected
// and never sent game_id at all).
export function usePlayGameSocket(token: string | null, gameId: string | null, handlers: Handlers = {}) {
  const push = useNotificationsStore((s) => s.push)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!token || !gameId) return

    let closedByCleanup = false
    let attempt = 0
    let socket: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    function connect() {
      const wsBase = API_BASE_URL
        ? API_BASE_URL.replace(/^http/, 'ws')
        : window.location.origin.replace(/^http/, 'ws')
      socket = new WebSocket(
        `${wsBase}/ws/negotiation?token=${encodeURIComponent(token!)}&game_id=${encodeURIComponent(gameId!)}`,
      )

      socket.onopen = () => {
        attempt = 0
      }

      socket.onmessage = (event) => {
        let data: GameEvent | null = null
        try {
          data = JSON.parse(event.data) as GameEvent
        } catch {
          return
        }
        if (!data?.type) return
        push({ type: data.type, message: EVENT_LABELS[data.type] ?? data.type })
        handlersRef.current[data.type]?.(data.payload ?? {})
      }

      socket.onclose = () => {
        if (closedByCleanup) return
        attempt += 1
        const delay = Math.min(1000 * 2 ** attempt, 15000)
        retryTimer = setTimeout(connect, delay)
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      closedByCleanup = true
      if (retryTimer) clearTimeout(retryTimer)
      socket?.close()
    }
  }, [token, gameId, push])
}
