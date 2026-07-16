import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { getLobby, rollDice } from '@/api/play'
import { usePlayGameSocket } from '@/hooks/usePlayGameSocket'
import { BOARD_SIZE, cellLabelAt, cellColorAt } from '@/lib/board'
import { boardCellGridPosition, BOARD_GRID_ROWS, BOARD_GRID_COLS } from '@/lib/boardLayout'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DealDecisionDialog } from '@/components/play/DealDecisionDialog'
import { DealChoiceDialog } from '@/components/play/DealChoiceDialog'
import { MarketDecisionDialog } from '@/components/play/MarketDecisionDialog'
import { StockNewsDecisionDialog } from '@/components/play/StockNewsDecisionDialog'
import { CharityDecisionDialog } from '@/components/play/CharityDecisionDialog'
import { AuctionPanel } from '@/components/play/AuctionPanel'
import { StockPortfolioPanel } from '@/components/play/StockPortfolioPanel'
import { LoanPanel } from '@/components/play/LoanPanel'
import { FinancialStatement } from '@/components/play/FinancialStatement'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Dice5, Trophy } from 'lucide-react'

export default function Board() {
  const token = useAuthStore((s) => s.token)
  const myPlayerId = useAuthStore((s) => s.user?.player_id)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()
  const [lastRoll, setLastRoll] = useState<{ die1: number; die2: number | null; total: number } | null>(null)

  const gameQ = useQuery({
    queryKey: ['play_lobby', gameId],
    queryFn: () => getLobby(token!, gameId!),
    enabled: !!token && !!gameId,
    refetchInterval: 4000,
  })

  const rollMut = useMutation({
    mutationFn: () => rollDice(token!, gameId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
  })

  usePlayGameSocket(token, gameId, {
    DICE_ROLLED: (payload) => {
      if (typeof payload.die === 'number') {
        setLastRoll({
          die1: payload.die,
          die2: typeof payload.die2 === 'number' ? payload.die2 : null,
          total: typeof payload.total === 'number' ? payload.total : payload.die,
        })
      }
      qc.invalidateQueries({ queryKey: ['play_lobby', gameId] })
    },
    PAYDAY_RECEIVED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    DOODAD_PAID: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    BABY_BORN: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    PLAYER_DOWNSIZED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    CHARITY_CHOICE_REQUIRED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    CHARITY_PAID: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    DEAL_DRAWN: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    DEAL_CHOICE_REQUIRED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    MARKET_OPEN: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    MARKET_SKIPPED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    MARKET_DECISION: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    STOCK_NEWS_OPEN: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    STOCK_NEWS_DECISION: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    AUCTION_STARTED: () => qc.invalidateQueries({ queryKey: ['auction_offers', gameId] }),
    AUCTION_BID: () => qc.invalidateQueries({ queryKey: ['auction_offers', gameId] }),
    AUCTION_ENDED: () => {
      qc.invalidateQueries({ queryKey: ['auction_offers', gameId] })
      qc.invalidateQueries({ queryKey: ['play_lobby', gameId] })
    },
    STOCK_SOLD: () => {
      qc.invalidateQueries({ queryKey: ['my_assets', gameId] })
      qc.invalidateQueries({ queryKey: ['play_lobby', gameId] })
    },
    DECISION_MADE: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    TURN_CHANGED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    PLAYER_WON: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
  })

  const game = gameQ.data?.game
  const players = gameQ.data?.players ?? []
  const isMyTurn = game?.current_turn_player_id === myPlayerId
  const canRoll = isMyTurn && game?.turn_status === 'WAITING_ROLL' && game?.status === 'in_progress'
  const me = players.find((p) => p.id === myPlayerId)
  const winner = game?.status === 'completed' ? players.find((p) => p.id === game.current_turn_player_id) : undefined

  const tokenColors = ['bg-red-500', 'bg-blue-500', 'bg-yellow-400', 'bg-green-500', 'bg-pink-500', 'bg-cyan-400']
  const colorForPlayer = (playerId: string) => {
    const idx = players.findIndex((p) => p.id === playerId)
    return tokenColors[idx % tokenColors.length]
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
          <p className="text-sm text-muted-foreground">
            Turn {game?.turn_number ?? 0} &middot; {game?.turn_status ?? '—'}
            {lastRoll != null && (
              <>
                {' '}
                &middot; Last roll:{' '}
                {lastRoll.die2 != null ? `${lastRoll.die1} + ${lastRoll.die2} = ${lastRoll.total}` : lastRoll.total}
              </>
            )}
            {me != null && me.charity_turns > 0 && (
              <> &middot; 🎲🎲 Double dice: {me.charity_turns} turn{me.charity_turns === 1 ? '' : 's'} left</>
            )}
          </p>
        </div>
        {canRoll && (
          <Button onClick={() => rollMut.mutate()} disabled={rollMut.isPending} className="gap-2">
            <Dice5 className="h-4 w-4" />
            {rollMut.isPending ? 'Rolling…' : 'Roll dice'}
          </Button>
        )}
        {isMyTurn &&
          (game?.turn_status === 'AWAITING_DECISION' ||
            game?.turn_status === 'AWAITING_DEAL_CHOICE' ||
            game?.turn_status === 'AWAITING_CHARITY_DECISION') && (
            <p className="text-sm font-medium text-amber-400">Awaiting your decision…</p>
          )}
        {!isMyTurn &&
          game?.status === 'in_progress' &&
          game?.turn_status !== 'AWAITING_MARKET_DECISIONS' &&
          game?.turn_status !== 'AWAITING_STOCK_NEWS_DECISIONS' && (
            <p className="text-sm text-muted-foreground">Waiting for your turn…</p>
          )}
      </div>
      {rollMut.isError && (
        <p className="text-sm text-destructive">
          {rollMut.error instanceof Error ? rollMut.error.message : 'Could not roll.'}
        </p>
      )}

      <div
        className="grid grid-rows-6 grid-cols-8 gap-1 rounded-xl border border-border bg-card p-3"
        style={{ aspectRatio: `${BOARD_GRID_COLS} / ${BOARD_GRID_ROWS}` }}
      >
        {Array.from({ length: BOARD_SIZE }, (_, position) => {
          const occupants = players.filter((p) => p.position === position)
          const isCurrentTurn = game?.current_turn_player_id != null && occupants.some((p) => p.id === game.current_turn_player_id)
          const { row, col } = boardCellGridPosition(position)
          return (
            <div
              key={position}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-lg border p-1 text-center',
                cellColorAt(position),
                isCurrentTurn && 'ring-2 ring-primary',
              )}
              style={{ gridRow: row, gridColumn: col }}
              title={cellLabelAt(position)}
            >
              <span className="text-[10px] font-semibold leading-tight">{cellLabelAt(position)}</span>
              <span className="text-[9px] opacity-70">#{position}</span>
              {occupants.length > 0 && (
                <div className="flex flex-wrap justify-center gap-0.5">
                  {occupants.map((p) => (
                    <span
                      key={p.id}
                      className={cn('h-2.5 w-2.5 rounded-full', colorForPlayer(p.id))}
                      title={p.name}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div
          className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/10 p-2 text-center"
          style={{ gridRow: '2 / 6', gridColumn: '2 / 8' }}
        >
          <div>
            <div className="text-sm font-semibold text-muted-foreground">Rat Race</div>
            <div className="text-lg font-bold tracking-tight">{game?.name ?? 'Board'}</div>
            <div className="text-xs text-muted-foreground">
              Turn {game?.turn_number ?? 0} &middot; {game?.turn_status ?? '—'}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {players.map((p) => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs',
                  p.id === game?.current_turn_player_id && 'border-primary/60 bg-primary/10',
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', colorForPlayer(p.id))} />
                <span className={p.id === game?.current_turn_player_id ? 'font-semibold text-primary' : ''}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>

      <div className="space-y-4">
        {me && <FinancialStatement player={me} />}
        {me && <LoanPanel player={me} />}
        <StockPortfolioPanel game={game} />
        <AuctionPanel />
      </div>

      {game && isMyTurn && game.turn_status === 'AWAITING_DECISION' && <DealDecisionDialog game={game} />}
      {isMyTurn && game?.turn_status === 'AWAITING_DEAL_CHOICE' && <DealChoiceDialog />}
      {isMyTurn && game?.turn_status === 'AWAITING_CHARITY_DECISION' && <CharityDecisionDialog />}
      {game && game.turn_status === 'AWAITING_MARKET_DECISIONS' && (
        <MarketDecisionDialog game={game} eligible={gameQ.data?.market_eligible ?? []} />
      )}
      {game && game.turn_status === 'AWAITING_STOCK_NEWS_DECISIONS' && (
        <StockNewsDecisionDialog game={game} eligible={gameQ.data?.stock_news_eligible ?? []} />
      )}

      <Dialog open={!!winner}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-400" />
              {winner?.id === myPlayerId ? 'You won!' : `${winner?.name ?? 'A player'} won!`}
            </DialogTitle>
            <DialogDescription>
              {winner?.id === myPlayerId
                ? 'Your passive income now exceeds your total expenses — you are financially free.'
                : `${winner?.name}'s passive income now exceeds their total expenses.`}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  )
}
