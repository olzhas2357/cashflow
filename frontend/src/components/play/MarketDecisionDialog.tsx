import { useMutation, useQueryClient } from '@tanstack/react-query'
import { makeDecision } from '@/api/play'
import type { MarketEligiblePlayer } from '@/api/play'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import type { GameSession } from '@/api/auditorPanel'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// Shown to EVERY player once turn_status === 'AWAITING_MARKET_DECISIONS' —
// market cards are is_global, so any eligible player (not just whoever
// rolled) may sell. Players with no matching asset just see the card and a
// waiting message.
export function MarketDecisionDialog({
  game,
  eligible,
}: {
  game: GameSession
  eligible: MarketEligiblePlayer[]
}) {
  const token = useAuthStore((s) => s.token)
  const myPlayerId = useAuthStore((s) => s.user?.player_id)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()

  const card = game.active_market_event
  const mine = eligible.find((p) => p.player_id === myPlayerId)

  const decideMut = useMutation({
    mutationFn: (payload: { action: 'market_sell' | 'market_skip'; asset_id?: string }) =>
      makeDecision(token!, gameId!, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
  })

  if (!card) return null

  return (
    <Dialog open>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Market: {card.name}</DialogTitle>
          <DialogDescription>{card.description}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Offer price</span>
          <span>${card.offer_price.toLocaleString()}</span>
        </div>

        {decideMut.isError && (
          <p className="text-sm text-destructive">
            {decideMut.error instanceof Error ? decideMut.error.message : 'Could not respond.'}
          </p>
        )}

        {mine ? (
          <div className="space-y-3">
            {mine.assets.map((asset) => (
              <div
                key={asset.asset_id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{asset.name}</div>
                  <div className="text-muted-foreground">Net: ${asset.net_to_player.toLocaleString()}</div>
                </div>
                <Button
                  size="sm"
                  onClick={() => decideMut.mutate({ action: 'market_sell', asset_id: asset.asset_id })}
                  disabled={decideMut.isPending}
                >
                  Sell for ${asset.net_to_player.toLocaleString()}
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => decideMut.mutate({ action: 'market_skip' })}
              disabled={decideMut.isPending}
            >
              Skip
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            You have no matching asset — waiting on other players to decide…
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
