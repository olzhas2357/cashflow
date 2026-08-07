import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const [askingPrice, setAskingPrice] = useState(asset.net_to_player)

  return (
    <div className="space-y-2 rounded-lg border border-border px-3 py-2 text-sm">
      <div className="font-medium">{asset.name}</div>
      <div className="space-y-1 text-muted-foreground">
        <div className="flex justify-between">
          <span>{t('game.market.offerPrice')}</span>
          <span>${asset.offer_price.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>{t('game.common.mortgage')}</span>
          <span>−${asset.mortgage.toLocaleString()}</span>
        </div>
        <div className="flex justify-between font-medium text-foreground">
          <span>{t('game.market.netPayout')}</span>
          <span>${asset.net_to_player.toLocaleString()}</span>
        </div>
      </div>
      <Button size="sm" className="w-full" onClick={onSell} disabled={disabled}>
        {t('game.market.sellToBank', { price: `$${asset.net_to_player.toLocaleString()}` })}
      </Button>

      <div className="flex items-center gap-2 pt-1">
        <Input
          type="number"
          min={0}
          value={askingPrice}
          onChange={(e) => setAskingPrice(Math.max(0, Number(e.target.value)))}
          className="h-8"
          aria-label={t('game.auction.startingPriceAria')}
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => onStartAuction(askingPrice)}
          disabled={disabled}
        >
          {t('game.auction.auctionCta')}
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
  const { t } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const myPlayerId = useAuthStore((s) => s.user?.player_id)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()

  const card = game.active_market_event
  const mine = eligible.find((p) => p.player_id === myPlayerId)

  // The roller (whoever landed on the Market cell) gets first right of
  // reply if they own a matching asset — everyone else just waits until the
  // roller has answered (sold/skipped) or isn't eligible at all, mirroring
  // the same priority enforced server-side in decideMarket (turn.go).
  const rollerId = game.current_turn_player_id
  const responded = game.market_responded_player_ids ?? []
  const rollerEligible = eligible.some((p) => p.player_id === rollerId)
  const rollerAnswered = rollerId ? responded.includes(rollerId) : true
  const isRoller = !!rollerId && myPlayerId === rollerId
  const mustWaitForRoller = rollerEligible && !rollerAnswered && !isRoller

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
          <DialogTitle>{t('game.market.titlePrefix')}: {card.name?.trim() || t('game.common.unnamedCard')}</DialogTitle>
          {card.description?.trim() ? (
            <DialogDescription className="whitespace-pre-line">{card.description}</DialogDescription>
          ) : (
            <DialogDescription className="text-destructive">
              {t('game.common.missingDescription')}
            </DialogDescription>
          )}
        </DialogHeader>

        {decideMut.isError && (
          <p className="text-sm text-destructive">
            {decideMut.error instanceof Error ? decideMut.error.message : t('game.common.couldNotRespond')}
          </p>
        )}

        {mine && mustWaitForRoller ? (
          <p className="text-sm text-muted-foreground">
            {t('game.market.waitingForRoller')}
          </p>
        ) : mine ? (
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
              {t('game.common.skip')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('game.market.noMatchingAsset')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
