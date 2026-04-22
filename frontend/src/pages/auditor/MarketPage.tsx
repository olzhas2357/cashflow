import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { listGames, listMarketEvents } from '@/api/auditorPanel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function MarketPage() {
  const token = useAuthStore((s) => s.token)

  const gamesQ = useQuery({
    queryKey: ['auditor_games'],
    queryFn: () => listGames(token!),
    enabled: !!token,
  })

  const evQ = useQuery({
    queryKey: ['auditor_market_events'],
    queryFn: () => listMarketEvents(token!),
    enabled: !!token,
  })

  const games = gamesQ.data ?? []
  const events = evQ.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Market</h1>
        <p className="text-muted-foreground">Market deck reference — when a market square is hit, pick the matching card.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Games</CardTitle>
          <CardDescription>Jump into a session to record sales or use the transaction queue.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link
            to="/market/small-deals"
            className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
          >
            Manage small deals
          </Link>
          {games.map((g) => (
            <Link
              key={g.id}
              to={`/auditor/games/${g.id}`}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40"
            >
              {g.name}
            </Link>
          ))}
          {games.length === 0 && <span className="text-sm text-muted-foreground">No games yet.</span>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Market events library</CardTitle>
          <CardDescription>{events.length} cards loaded from the API.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[480px] pr-4">
            <ul className="space-y-3">
              {events.map((ev) => (
                <li key={ev.id} className="rounded-lg border border-border/80 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{ev.name}</span>
                    {ev.event_type && <Badge variant="outline">{ev.event_type}</Badge>}
                    {ev.sub_type && (
                      <Badge variant="secondary" className="text-xs">
                        {ev.sub_type}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{ev.description}</p>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
