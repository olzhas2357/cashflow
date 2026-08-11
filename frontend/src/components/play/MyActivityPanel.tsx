import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { listMyLogs } from '@/api/play'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { History } from 'lucide-react'

// Every player's own purchase/event history — server-scoped to the caller's
// player_id (PlayerMyLogs), so unlike the auditor's all-players log view,
// each player only ever sees their own entries here.
export function MyActivityPanel() {
  const { t } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const gameId = usePlayStore((s) => s.gameId)

  const logsQ = useQuery({
    queryKey: ['my_logs', gameId],
    queryFn: () => listMyLogs(token!, gameId!),
    enabled: !!token && !!gameId,
    refetchInterval: 5000,
  })

  const logs = logsQ.data ?? []

 return (
  <div className="flex h-full flex-col rounded-xl border p-3">
    <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
      <History className="h-4 w-4" />
      {t("game.activity.title")}
    </div>

     <ScrollArea className="flex-1 min-h">
      <ul className="space-y-3">
        {logs.map((l) => (
          <li
            key={l.id}
            className="rounded-lg border border-border p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <Badge variant="outline" className="shrink-0">
                {l.type}
              </Badge>

              <span
                className={
                  l.amount < 0
                    ? "shrink-0 text-destructive"
                    : "shrink-0 text-green-600"
                }
              >
                {l.amount >= 0 ? "+" : ""}
                {l.amount.toLocaleString()}
              </span>
            </div>

            <p className="w-full whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {l.description}
            </p>
          </li>
        ))}
      </ul>
    </ScrollArea>
      <ScrollBar orientation="vertical" />
      <ScrollBar orientation="horizontal" />
  </div>
)
}
