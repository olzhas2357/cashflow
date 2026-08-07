import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { makeDecision } from '@/api/play'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import type { GameSession } from '@/api/auditorPanel'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// Shown to everyone once turn_status === 'AWAITING_DEAL_OFFER_CLAIM'. The
// offering player (A) sees a "waiting to be claimed" view with a Cancel
// button; everyone else sees the card + total price with an Accept button —
// first to accept wins, everyone else gets a 409 (offer_already_claimed),
// rendered inline like AuctionPanel's bid errors.
export function DealOfferDialog({ game }: { game: GameSession }) {
  const { t } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const myPlayerId = useAuthStore((s) => s.user?.player_id)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()
  const [dismissed, setDismissed] = useState(false)

  const deal = game.active_small_deal ?? game.active_big_deal
  const isOpener = game.deal_offered_by_player_id === myPlayerId
  const commission = game.deal_offer_commission ?? 0

  const cancelMut = useMutation({
    mutationFn: () => makeDecision(token!, gameId!, { action: 'cancel_offer' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
  })

  const acceptMut = useMutation({
    mutationFn: () => makeDecision(token!, gameId!, { action: 'accept_offer' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
  })

  if (!deal || dismissed) return null

  const total = deal.down_payment + commission

  return (
    <Dialog open>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{deal.name?.trim() || t('game.common.unnamedCard')}</DialogTitle>
          {deal.description?.trim() && (
            <DialogDescription className="whitespace-pre-line">{deal.description}</DialogDescription>
          )}
        </DialogHeader>

        {isOpener ? (
          <p className="text-sm text-muted-foreground">{t('game.dealOffer.waitingClaim')}</p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('game.dealOffer.priceToBank')}</span>
              <span>${deal.down_payment.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('game.dealOffer.commissionToPlayer')}</span>
              <span>${commission.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>{t('game.common.total')}</span>
              <span>${total.toLocaleString()}</span>
            </div>
          </div>
        )}

        {(cancelMut.isError || acceptMut.isError) && (
          <p className="text-sm text-destructive">
            {(cancelMut.error ?? acceptMut.error) instanceof Error
              ? ((cancelMut.error ?? acceptMut.error) as Error).message
              : t('game.common.somethingWrong')}
          </p>
        )}

        <DialogFooter className="gap-2">
          {isOpener ? (
            <Button variant="outline" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>
              {t('game.dealOffer.cancelOffer')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setDismissed(true)} disabled={acceptMut.isPending}>
                {t('game.common.skip')}
              </Button>
              <Button onClick={() => acceptMut.mutate()} disabled={acceptMut.isPending}>
                {acceptMut.isPending
                  ? t('game.common.processing')
                  : t('game.dealOffer.acceptFor', { price: `$${total.toLocaleString()}` })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
