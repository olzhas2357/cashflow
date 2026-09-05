import { useEffect, useState } from 'react'
import { useNotificationsStore } from '@/store/notificationsStore'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const VISIBLE_MS = 6000

// Surfaces usePlayGameSocket's notification store (every WS event already
// lands there via EVENT_LABELS, but nothing rendered it before — a player
// landing on a Market/Stock News card that auto-skips because nobody's
// eligible saw literally nothing happen). Auto-dismisses after a few
// seconds; click to dismiss early.
function useVisibleNotices() {
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

  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id))

  return { visible, dismiss }
}

function NoticeItem({
  message,
  onDismiss,
  className,
}: {
  message: string
  onDismiss: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex items-start justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm shadow-lg',
        className,
      )}
      onClick={onDismiss}
    >
      <span>{message}</span>
      <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  )
}

// Desktop: rendered inside the sidebar (below the Lobby/Board nav links),
// in the space that used to sit empty above the Sign out button — instead
// of floating over the board content near the top of the page.
export function GameNoticeSidebar() {
  const { visible, dismiss } = useVisibleNotices()
  if (visible.length === 0) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2">
      {visible.map((n) => (
        <NoticeItem key={n.id} message={n.message} onDismiss={() => dismiss(n.id)} />
      ))}
    </div>
  )
}

// Mobile fallback — keep notices in the page flow so they do not cover the board.
export function GameNoticeToasts() {
  const { visible, dismiss } = useVisibleNotices()
  if (visible.length === 0) return null

  return (
    <div className="pointer-events-none relative z-30 mb-3 flex w-full flex-col gap-2 lg:hidden">
      {visible.map((n) => (
        <NoticeItem
          key={n.id}
          message={n.message}
          onDismiss={() => dismiss(n.id)}
          className="pointer-events-auto"
        />
      ))}
    </div>
  )
}
