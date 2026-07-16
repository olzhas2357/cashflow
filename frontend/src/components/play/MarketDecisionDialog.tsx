import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { makeDecision } from '@/api/play'
import type { MarketEligiblePlayer, MarketEligibleAsset } from '@/api/play'
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
import { Input } from '@/components/ui/input'

function AssetOfferRow({
  asset,
  onSell,
  onStartAuction,
  disabled,
}: {
  asset: MarketEligibleAsset
  onSell: () => void
  onStartAuction: (askingPrice: number) => void
  disabled: boolean
}) {
  const [askingPrice, setAskingPrice] = useState(asset.net_to_player)

  return (
    <div className="space-y-2 rounded-lg border border-border px-3 py-2 text-sm">
      <div className="font-medium">{asset.name}</div>
      <div className="space-y-1 text-muted-foreground">
        <div className="flex justify-between">
          <span>Offer price</span>
          <span>${asset.offer_price.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Mortgage</span>
          <span>−${asset.mortgage.toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-medium text-foreground">
          <span>Net payout</span>
          <span>${asset.net_to_player.toLocaleString()}</span>
        </div>
      </div>
      <Button size="sm" className="w-full" onClick={onSell} disabled={disabled}>
        Sell to bank for ${asset.net_to_player.toLocaleString()}
      </Button>

      <div className="flex items-center gap-2 pt-1">
        <Input
          type="number"
          min={0}
          value={askingPrice}
          onChange={(e) => setAskingPrice(Math.max(0, Number(e.target.value)))}
          className="h-8"
          aria-label="Starting price for the auction"
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => onStartAuction(askingPrice)}
          disabled={disabled}
        >
          Auction (2 min)
        </Button>
      </div>
    </div>
  )
}

// Shown to EVERY player once turn_status === 'AWAITING_MARKET_DECISIONS' —
// market cards are is_global, so any eligible player (not just whoever
// rolled) may sell. Players with no matching asset just see the card and a
// waiting message. Net payout is always offer_price - mortgage, per the
// Cashflow external-buyer rule. Instead of selling to the bank, an eligible
// owner may put one asset up for a 2-minute player auction instead (see
// AuctionPanel) — either way counts as this player's answer to the card.
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
    mutationFn: (payload: {
      action: 'market_sell' | 'market_skip' | 'market_auction_start'
      asset_id?: string
      asking_price?: number
    }) => makeDecision(token!, gameId!, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
  })

  if (!card) return null

  return (
    <Dialog open>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Market: {card.name?.trim() || '⚠ Unnamed card'}</DialogTitle>
          {card.description?.trim() ? (
            <DialogDescription className="whitespace-pre-line">{card.description}</DialogDescription>
          ) : (
            <DialogDescription className="text-destructive">
              ⚠ Card data is missing — description was not generated.
            </DialogDescription>
          )}
        </DialogHeader>

        {decideMut.isError && (
          <p className="text-sm text-destructive">
            {decideMut.error instanceof Error ? decideMut.error.message : 'Could not respond.'}
          </p>
        )}

        {mine ? (
          <div className="space-y-3">
            {mine.assets.map((asset) => (
              <AssetOfferRow
                key={asset.asset_id}
                asset={asset}
                disabled={decideMut.isPending}
                onSell={() => decideMut.mutate({ action: 'market_sell', asset_id: asset.asset_id })}
                onStartAuction={(askingPrice) =>
                  decideMut.mutate({
                    action: 'market_auction_start',
                    asset_id: asset.asset_id,
                    asking_price: askingPrice,
                  })
                }
              />
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
