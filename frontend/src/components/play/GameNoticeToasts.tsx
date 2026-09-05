import { useEffect, useMemo, useState } from 'react'
import { useNotificationsStore } from '@/store/notificationsStore'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const VISIBLE_MS = 6000

function useVisibleNotices() {
  const items = useNotificationsStore((s) => s.items)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = useMemo(() => items.filter((n) => !dismissed.has(n.id)).slice(0, 4), [items, dismissed])

  useEffect(() => {
    if (visible.length === 0) return
    const timers = visible.map((n) =>
      setTimeout(() => setDismissed((prev) => new Set(prev).add(n.id)), VISIBLE_MS),
    )
    return () => timers.forEach(clearTimeout)
  }, [visible])

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
