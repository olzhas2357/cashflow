import { useEffect } from 'react'
import { useNotificationsStore } from '../store/notificationsStore'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export function useNegotiationSocket(token: string | null, enabled: boolean) {
  const push = useNotificationsStore((s) => s.push)

  useEffect(() => {
    if (!token || !enabled) return
    const wsBase = API_BASE_URL ? API_BASE_URL.replace(/^http/, 'ws') : window.location.origin.replace(/^http/, 'ws')
    const ws = new WebSocket(`${wsBase}/ws/negotiation?token=${encodeURIComponent(token)}`)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type?: string
          payload?: Record<string, unknown>
        }
        const type = data.type ?? 'event'
        push({
          type,
          message: `Live event: ${type}`,
        })
      } catch {
        push({ type: 'event', message: 'Live negotiation update' })
      }
    }

    return () => ws.close()
  }, [token, enabled, push])
}

