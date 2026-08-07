import { useEffect, useRef } from 'react'
import i18n from '../i18n/i18n'
import { useNotificationsStore } from '../store/notificationsStore'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export type GameEvent = {
  type: string
  timestamp: string
  payload: Record<string, unknown>
}

type Handlers = Partial<Record<string, (payload: Record<string, unknown>) => void>>

function eventLabel(type: string): string {
  return i18n.t(`game.events.${type}`, { defaultValue: type }) as string
}

// A few events carry enough payload context to name the card/symbol — falls
// back to the static label above when the field isn't present.
function describeEvent(type: string, payload: Record<string, unknown>): string {
  const card = payload.card as { name?: string; title?: string; symbol?: string } | undefined
  const label = eventLabel(type)
  switch (type) {
    case 'MARKET_OPEN':
    case 'MARKET_SKIPPED':
    case 'MARKET_FORCED_APPLIED':
      return card?.name ? `${label}: ${card.name}` : label
    case 'BIG_DEAL_NEWS_SKIPPED':
      return card?.title ? `${label}: ${card.title}` : label
    case 'STOCK_NEWS_OPEN':
      return card?.symbol ? `${label} (${card.symbol})` : label
    case 'AUCTION_ENDED': {
      const assetName = payload.asset_name as string | undefined
      const price = payload.price as number | undefined
      if (payload.sold && assetName) {
        return price != null
          ? i18n.t('game.events.AUCTION_ENDED_SOLD', { asset: assetName, price: `$${price.toLocaleString()}` })
          : i18n.t('game.events.AUCTION_ENDED_SOLD_NO_PRICE', { asset: assetName })
      }
      if (assetName) {
        return i18n.t('game.events.AUCTION_ENDED_NO_BID', { asset: assetName })
      }
      return label
    }
    default:
      return label
  }
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
        // CHAT_MESSAGE is excluded from the toast feed — unlike every other
        // event here (rare game-state transitions), chat messages/emoji fire
        // often enough that toasting each one would be spam; the ChatPanel
        // itself renders them via the handler below.
        if (data.type !== 'CHAT_MESSAGE') {
          push({ type: data.type, message: describeEvent(data.type, data.payload ?? {}) })
        }
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
