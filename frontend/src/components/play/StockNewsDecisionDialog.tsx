import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { makeDecision } from '@/api/play'
import type { StockNewsEligiblePlayer } from '@/api/play'
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
import { Label } from '@/components/ui/label'

// Shown to every current holder of the affected symbol once turn_status ===
// 'AWAITING_STOCK_NEWS_DECISIONS' — the split/reverse-split itself already
// ran automatically; this only offers a chance to sell at the resulting
// price. Non-holders of the symbol just wait, same as MarketDecisionDialog.
export function StockNewsDecisionDialog({
  game,
  eligible,
}: {
  game: GameSession
  eligible: StockNewsEligiblePlayer[]
}) {
  const { t } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const myPlayerId = useAuthStore((s) => s.user?.player_id)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()

  const card = game.active_stock_news_deal
  const mine = eligible.find((p) => p.player_id === myPlayerId)
  const [shares, setShares] = useState(mine?.shares ?? 1)

  const decideMut = useMutation({
    mutationFn: (payload: { action: 'stock_news_sell' | 'stock_news_skip'; shares?: number }) =>
      makeDecision(token!, gameId!, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
  })

  if (!card) return null

  return (
    <Dialog open>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('game.stockNews.titlePrefix')}: {card.title || card.name}</DialogTitle>
          <DialogDescription>{card.description}</DialogDescription>
        </DialogHeader>

        {decideMut.isError && (
          <p className="text-sm text-destructive">
            {decideMut.error instanceof Error ? decideMut.error.message : t('game.common.couldNotRespond')}
          </p>
        )}

        {mine ? (
          <div className="space-y-3">
            <div className="space-y-1 rounded-lg border border-border px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('game.common.symbol')}</span>
                <span className="font-medium">{mine.symbol}</span>
              </div>
              <div className="text-muted-foreground">{t('game.stockNews.youHold', { count: mine.shares })}</div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('game.stockNews.newPrice')}</span>
                <span>${mine.unit_price.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="stock-news-shares">{t('game.stockNews.sharesToSell')}</Label>
              <Input
                id="stock-news-shares"
                type="number"
                min={1}
                max={mine.shares}
                value={shares}
                onChange={(e) => setShares(Math.max(1, Math.min(mine.shares, Number(e.target.value))))}
              />
              <p className="text-xs text-muted-foreground">
                {t('game.stockNews.proceeds', { amount: `$${(shares * mine.unit_price).toLocaleString()}` })}
              </p>
            </div>

            <Button
              className="w-full"
              onClick={() => decideMut.mutate({ action: 'stock_news_sell', shares })}
              disabled={decideMut.isPending}
            >
              {t('game.stockNews.sellFor', {
                count: shares,
                amount: `$${(shares * mine.unit_price).toLocaleString()}`,
              })}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => decideMut.mutate({ action: 'stock_news_skip' })}
              disabled={decideMut.isPending}
            >
              {t('game.stockNews.hold')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('game.stockNews.notHolding')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
