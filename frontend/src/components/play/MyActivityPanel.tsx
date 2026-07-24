import { useQuery } from '@tanstack/react-query'
import { listMyLogs } from '@/api/play'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { History } from 'lucide-react'

// Every player's own purchase/event history — server-scoped to the caller's
// player_id (PlayerMyLogs), so unlike the auditor's all-players log view,
// each player only ever sees their own entries here.
export function MyActivityPanel() {
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
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4" />
        My activity
      </div>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ScrollArea className="h-48 pr-2">
          <ul className="space-y-2">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="shrink-0 text-xs">
                  {l.type}
                </Badge>
                <div className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-muted-foreground [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {l.description ?? ''}
                </div>
                <span className={l.amount < 0 ? 'shrink-0 text-destructive' : 'shrink-0 text-green-600'}>
                  {l.amount >= 0 ? '+' : ''}
                  {l.amount.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  )
}
