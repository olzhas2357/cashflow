import { useEffect, useState } from 'react'
import { useNotificationsStore } from '@/store/notificationsStore'
import { X } from 'lucide-react'

const VISIBLE_MS = 6000

// Surfaces usePlayGameSocket's notification store (every WS event already
// lands there via EVENT_LABELS, but nothing rendered it before — a player
// landing on a Market/Stock News card that auto-skips because nobody's
// eligible saw literally nothing happen). Auto-dismisses after a few
// seconds; click to dismiss early.
export function GameNoticeToasts() {
  const items = useNotificationsStore((s) => s.items)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = items.filter((n) => !dismissed.has(n.id)).slice(0, 4)

  useEffect(() => {
    if (visible.length === 0) return
    const timers = visible.map((n) =>
      setTimeout(() => setDismissed((prev) => new Set(prev).add(n.id)), VISIBLE_MS),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map((n) => n.id).join(',')])

  if (visible.length === 0) return null

  return (
    // Left side, clearing the md+ nav sidebar (w-56) — right-4 used to sit
    // directly over the Financial Statement's Income/Expenses panel.
    <div className="pointer-events-none fixed left-4 top-4 z-50 flex w-80 flex-col gap-2 md:left-64">
      {visible.map((n) => (
        <button
          key={n.id}
          type="button"
          className="pointer-events-auto flex items-start justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm shadow-lg"
          onClick={() => setDismissed((prev) => new Set(prev).add(n.id))}
        >
          <span>{n.message}</span>
          <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  )
}
