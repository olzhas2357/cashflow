import { Trophy, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LobbyPlayer } from '@/api/play'

export function GameFinishedBanner({ players }: { players: LobbyPlayer[] }) {
  const { t } = useTranslation()
  const finished = players.filter((p) => p.placement > 0).sort((a, b) => a.placement - b.placement)
  const stillPlaying = players.filter((p) => p.placement === 0)

  const placeLabel = (placement: number) =>
    t(`game.finished.place_${placement}`, { defaultValue: t('game.finished.place_other', { n: placement }), n: placement })

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/[0.04] p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
        <Trophy className="h-4 w-4" />
        {t('game.finished.title')}
      </div>

      <div className="space-y-1.5">
        {finished.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm">
            <span>
              {placeLabel(p.placement)} &middot; {p.name}
            </span>
            <span className="text-xs text-muted-foreground">{t('game.finished.turnLabel', { n: p.finished_turn })}</span>
          </div>
        ))}
      </div>

      {stillPlaying.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-primary/20 pt-3 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {t('game.finished.stillInRace', { names: stillPlaying.map((p) => p.name).join(', ') })}
        </div>
      )}
    </div>
  )
}
