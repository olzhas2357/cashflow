import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { listMyAssets, sellStockToBank } from '@/api/play'
import type { GameSession, GameAsset } from '@/api/auditorPanel'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TrendingUp } from 'lucide-react'

function StockRow({
  asset,
  sellPrice,
  onSell,
  disabled,
}: {
  asset: GameAsset
  sellPrice: number | null
  onSell: (shares: number) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const owned = asset.shares ?? 0
  const [shares, setShares] = useState(owned)
  const priceRange = asset.extra?.price_range as { min?: number; max?: number } | undefined

  return (
    <div className="space-y-1 rounded-lg border border-border px-3 py-2 text-sm">
      <div className="flex justify-between">
        <span className="font-medium">{asset.symbol}</span>
        <span className="text-muted-foreground">{t('game.common.shares')}: {owned.toLocaleString()}</span>
      </div>
      {(priceRange?.min != null || priceRange?.max != null) && (
        <p className="text-xs text-muted-foreground">
          {t('game.common.typicalRange')}: ${priceRange?.min?.toLocaleString() ?? '?'} – ${priceRange?.max?.toLocaleString() ?? '?'}
        </p>
      )}
      {sellPrice != null ? (
        <div className="flex items-center gap-2 pt-1">
          <Input
            type="number"
            min={1}
            max={owned}
            value={shares}
            onChange={(e) => setShares(Math.max(1, Math.min(owned, Number(e.target.value))))}
            className="h-8"
          />
          <Button size="sm" className="shrink-0" onClick={() => onSell(shares)} disabled={disabled}>
            {t('game.stocks.sellAt', { price: `$${sellPrice.toLocaleString()}` })}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('game.stocks.noBuyer')}</p>
      )}
    </div>
  )
}

// Always-visible portfolio widget — buying happens through the normal Small
// Deal draw/buy flow (DealDecisionDialog), this is the "sell high" half:
// while game.active_small_deal is a stock card, any holder of that symbol
// (not just whoever drew the card) can sell at the card's price. Players had
// no visibility into their own stock holdings at all before this existed.
export function StockPortfolioPanel({ game }: { game?: GameSession }) {
  const { t } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()

  const assetsQ = useQuery({
    queryKey: ['my_assets', gameId],
    queryFn: () => listMyAssets(token!),
    enabled: !!token && !!gameId,
    refetchInterval: 5000,
  })

  const sellMut = useMutation({
    mutationFn: ({ symbol, shares }: { symbol: string; shares: number }) => sellStockToBank(token!, gameId!, symbol, shares),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_assets', gameId] })
      qc.invalidateQueries({ queryKey: ['play_lobby', gameId] })
    },
  })

  const stocks = (assetsQ.data ?? []).filter((a) => a.type === 'stock' && a.symbol)
  if (stocks.length === 0) return null

  const activeCard = game?.active_small_deal
  const activeCardIsStock = activeCard?.category === 'stock' && !!activeCard.symbol

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <TrendingUp className="h-4 w-4" />
        {t('game.stocks.title')}
      </div>
      {stocks.map((s) => {
        const matches = activeCardIsStock && activeCard!.symbol.toUpperCase() === s.symbol!.toUpperCase()
        return (
          <StockRow
            key={s.id}
            asset={s}
            sellPrice={matches ? activeCard!.price : null}
            onSell={(shares) => sellMut.mutate({ symbol: s.symbol!, shares })}
            disabled={sellMut.isPending}
          />
        )
      })}
      {sellMut.isError && (
        <p className="text-xs text-destructive">
          {sellMut.error instanceof Error ? sellMut.error.message : t('game.common.couldNotSell')}
        </p>
      )}
    </div>
  )
}
