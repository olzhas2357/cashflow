import { Trophy, Medal, Building2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { WinnerStats } from '@/api/auditorPanel'

type Props = {
  playerName: string
  placement: number // 1, 2, 3
  finishedTurn: number
  stats: WinnerStats
  isMe: boolean
  gameOver: boolean
  onClose: () => void
  onWatch: () => void // "watch the game" — close the modal, stay a spectator
}

export default function WinnerModal({
  playerName, placement, finishedTurn, stats, isMe, gameOver, onClose, onWatch,
}: Props) {
  const { t } = useTranslation()
  const placeLabel = t(`game.winner.place_${placement}`, {
    defaultValue: t('game.winner.place_other', { n: placement }),
    n: placement,
  })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-primary/40 bg-card">
        {/* Header */}
        <div className="relative border-b border-primary/20 px-6 py-6 text-center">
          <button
            onClick={onClose}
            className="absolute right-3.5 top-3.5 flex h-6 w-6 items-center justify-center rounded-md border border-primary/40 text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="mx-auto mb-3.5 flex h-13 w-13 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Trophy className="h-6 w-6" />
          </div>
          <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[11px] text-primary ring-1 ring-primary/25">
            <Medal className="h-3 w-3" />
            {placeLabel}
          </div>
          <h2 className="text-lg font-medium">
            {isMe ? t('game.winner.escapedTitleMe') : t('game.winner.escapedTitleOther', { name: playerName })}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {playerName} &middot; {t('game.winner.turnLabel', { n: finishedTurn })}
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Formula */}
          <div className="mb-4 flex items-center justify-center gap-2.5 rounded-lg border border-primary/20 bg-primary/[0.04] py-3 text-[13px]">
            <span className="font-medium text-primary">
              {t('game.winner.formula', {
                passive: `$${stats.passive_income.toLocaleString()}`,
                expenses: `$${stats.total_expenses.toLocaleString()}`,
              })}
            </span>
          </div>

          {/* Stats grid */}
          <div className="mb-4 grid grid-cols-2 gap-2.5">
            <Stat value={`+$${stats.surplus.toLocaleString()}`} label={t('game.winner.surplus')} green />
            <Stat value={String(stats.assets_count)} label={t('game.winner.assetsPurchased')} />
            <Stat value={`$${Math.round(stats.portfolio_value / 1000)}K`} label={t('game.winner.portfolioValue')} />
            <Stat value={String(finishedTurn)} label={t('game.winner.turnsToFinish')} />
          </div>

          {/* Best asset */}
          {stats.best_asset_name && (
            <div className="mb-4 rounded-lg border border-border bg-background/50 p-3.5">
              <p className="mb-2 text-[10px] tracking-wider text-muted-foreground">{t('game.winner.bestDeal')}</p>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/25">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[13px] font-medium">{stats.best_asset_name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {t('game.winner.boughtFor', { price: `$${stats.best_asset_cost.toLocaleString()}` })}
                  </div>
                </div>
                <div className="ml-auto text-[13px] font-medium text-primary">
                  {t('game.winner.perMonth', { amount: `+$${stats.best_asset_income.toLocaleString()}` })}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {gameOver ? (
              <Button className="w-full" onClick={onClose}>{t('game.winner.finalResults')}</Button>
            ) : (
              <>
                <Button className="w-full" onClick={onWatch}>{t('game.winner.watchGame')}</Button>
                <p className="text-center text-[10px] text-muted-foreground">
                  {t('game.winner.continuesNote')}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, green }: { value: string; label: string; green?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className={`text-lg font-medium ${green ? 'text-primary' : 'text-foreground'}`}>{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}
