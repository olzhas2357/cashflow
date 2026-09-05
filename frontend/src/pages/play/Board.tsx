import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { getLobby, rollDice, listProfessions, type ChatMessage } from '@/api/play'
import { usePlayGameSocket } from '@/hooks/usePlayGameSocket'
import { BOARD_SIZE, cellLabelAt, cellColorAt } from '@/lib/board'
import { boardCellGridPosition, BOARD_GRID_ROWS, BOARD_GRID_COLS } from '@/lib/boardLayout'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DealDecisionDialog } from '@/components/play/DealDecisionDialog'
import { DealOfferDialog } from '@/components/play/DealOfferDialog'
import { DealChoiceDialog } from '@/components/play/DealChoiceDialog'
import { MarketDecisionDialog } from '@/components/play/MarketDecisionDialog'
import { StockNewsDecisionDialog } from '@/components/play/StockNewsDecisionDialog'
import { CharityDecisionDialog } from '@/components/play/CharityDecisionDialog'
import { AuctionPanel } from '@/components/play/AuctionPanel'
import { ChatPanel } from '@/components/play/ChatPanel'
import { StockPortfolioPanel } from '@/components/play/StockPortfolioPanel'
import { LoanPanel } from '@/components/play/LoanPanel'
import { FinancialStatement } from '@/components/play/FinancialStatement'
import WinnerModal from '@/components/play/WinnerModal'
import { GameFinishedBanner } from '@/components/play/GameFinishedBanner'
import type { PlayerWonPayload } from '@/api/auditorPanel'
import { ChevronDown, ChevronUp, Dice5, Info } from 'lucide-react'

export default function Board() {
  const { t } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const myPlayerId = useAuthStore((s) => s.user?.player_id)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()
  const [lastRoll, setLastRoll] = useState<{ die1: number; die2: number | null; total: number } | null>(null)
  const [winnerModal, setWinnerModal] = useState<PlayerWonPayload | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isCellGuideOpen, setIsCellGuideOpen] = useState(true)

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
    BIG_DEAL_NEWS_SKIPPED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    DEAL_CHOICE_REQUIRED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    MARKET_OPEN: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    MARKET_SKIPPED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    MARKET_FORCED_APPLIED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    MARKET_DECISION: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    STOCK_NEWS_OPEN: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    STOCK_NEWS_DECISION: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    AUCTION_STARTED: () => qc.invalidateQueries({ queryKey: ['auction_offers', gameId] }),
    AUCTION_BID: () => qc.invalidateQueries({ queryKey: ['auction_offers', gameId] }),
    AUCTION_ENDED: () => {
      qc.invalidateQueries({ queryKey: ['auction_offers', gameId] })
      qc.invalidateQueries({ queryKey: ['play_lobby', gameId] })
      qc.invalidateQueries({ queryKey: ['my_assets', gameId] })
    },
    STOCK_SOLD: () => {
      qc.invalidateQueries({ queryKey: ['my_assets', gameId] })
      qc.invalidateQueries({ queryKey: ['play_lobby', gameId] })
    },
    DECISION_MADE: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    TURN_CHANGED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    DEAL_OFFERED_ALL: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    OFFER_CLAIMED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    OFFER_CANCELLED: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
    CHAT_MESSAGE: (payload) => {
      setChatMessages((msgs) =>
        [
          ...msgs,
          {
            id: `${payload.player_id}-${payload.ts}`,
            playerId: payload.player_id as string,
            name: payload.name as string,
            text: payload.text as string | undefined,
            emoji: payload.emoji as string | undefined,
            ts: payload.ts as number,
          },
        ].slice(-100),
      )
    },
    PLAYER_WON: (payload) => {
      // Only the player who just won gets the personal stats modal — everyone
      // else just gets the generic toast (handled by usePlayGameSocket's push)
      // plus the lobby refetch below. Also guards against an older backend
      // still broadcasting the pre-stats shape ({ player_id } only).
      if (payload.stats && typeof payload.placement === 'number' && payload.player_id === myPlayerId) {
        setWinnerModal(payload as unknown as PlayerWonPayload)
      }
      qc.invalidateQueries({ queryKey: ['play_lobby', gameId] })
    },
  })

  const professionsQ = useQuery({
    queryKey: ['play_professions'],
    queryFn: () => listProfessions(token!),
    enabled: !!token,
  })

  const game = gameQ.data?.game
  const players = gameQ.data?.players ?? []
  const isMyTurn = game?.current_turn_player_id === myPlayerId
  const canRoll = isMyTurn && game?.turn_status === 'WAITING_ROLL' && game?.status === 'in_progress'
  const me = players.find((p) => p.id === myPlayerId)
  const myProfessionName = professionsQ.data?.find((p) => p.id === me?.profession_id)?.name

  const tokenColors = ['bg-red-500', 'bg-blue-500', 'bg-yellow-400', 'bg-green-500', 'bg-pink-500', 'bg-cyan-400']
  const colorForPlayer = (playerId: string) => {
    const idx = players.findIndex((p) => p.id === playerId)
    return tokenColors[idx % tokenColors.length]
  }
  const turnStatusLabel = (status?: string) =>
    status ? (t(`game.turnStatus.${status}`, { defaultValue: status }) as string) : '—'
  const cellGuideItems = [
    { key: 'deal', color: 'bg-[#e5dc3f]/20 border-[#e5dc3f] text-[#e5dc3f]' },
    { key: 'doodad', color: 'bg-[#ef4444]/20 border-[#ef4444] text-[#ef4444]' },
    { key: 'charity', color: 'bg-[#8b5cf6]/20 border-[#8b5cf6] text-[#8b5cf6]' },
    { key: 'payday', color: 'bg-[#10b981]/20 border-[#10b981] text-[#10b981]' },
    { key: 'market', color: 'bg-[#06b6d4]/20 border-[#06b6d4] text-[#06b6d4]' },
    { key: 'downsized', color: 'bg-[#f97316]/20 border-[#f97316] text-[#f97316]' },
    { key: 'baby', color: 'bg-[#ec4899]/20 border-[#ec4899] text-[#ec4899]' },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:grid lg:grid-cols-[1fr_320px] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('game.board.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('game.board.turn', { n: game?.turn_number ?? 0 })} &middot; {turnStatusLabel(game?.turn_status)}
            {lastRoll != null && (
              <>
                {' '}
                &middot;{' '}
                {t('game.board.lastRoll', {
                  roll:
                    lastRoll.die2 != null ? `${lastRoll.die1} + ${lastRoll.die2} = ${lastRoll.total}` : lastRoll.total,
                })}
              </>
            )}
            {me != null && me.charity_turns > 0 && (
              <> &middot; {t('game.board.doubleDice', { count: me.charity_turns })}</>
            )}
          </p>
        </div>
        {canRoll && (
          <Button onClick={() => rollMut.mutate()} disabled={rollMut.isPending} className="gap-2">
            <Dice5 className="h-4 w-4" />
            {rollMut.isPending ? t('game.board.rolling') : t('game.board.rollDice')}
          </Button>
        )}
        {isMyTurn &&
          (game?.turn_status === 'AWAITING_DECISION' ||
            game?.turn_status === 'AWAITING_DEAL_CHOICE' ||
            game?.turn_status === 'AWAITING_CHARITY_DECISION') && (
            <p className="text-sm font-medium text-amber-400">{t('game.board.awaitingDecision')}</p>
          )}
        {!isMyTurn &&
          game?.status === 'in_progress' &&
          game?.turn_status !== 'AWAITING_MARKET_DECISIONS' &&
          game?.turn_status !== 'AWAITING_STOCK_NEWS_DECISIONS' &&
          game?.turn_status !== 'AWAITING_DEAL_OFFER_CLAIM' && (
            <p className="text-sm text-muted-foreground">{t('game.board.waitingForTurn')}</p>
          )}
      </div>
      {rollMut.isError && (
        <p className="text-sm text-destructive">
          {rollMut.error instanceof Error ? rollMut.error.message : t('game.board.rollError')}
        </p>
      )}

      {game?.status === 'completed' && <GameFinishedBanner players={players} />}

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
              <span className="text-xs font-semibold leading-tight">{cellLabelAt(position)}</span>
              <span className="text-[10px] opacity-70">#{position}</span>
              {occupants.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1">
                  {occupants.map((p) => (
                    <span
                      key={p.id}
                      className={cn(
                        'h-5 w-5 rounded-full border-2 border-background shadow-sm',
                        colorForPlayer(p.id),
                      )}
                      title={p.name}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div
          className="flex min-h-0 flex-col gap-2 overflow-hidden rounded-lg border border-dashed border-border/60 bg-muted/10 p-2"
          style={{ gridRow: '2 / 6', gridColumn: '2 / 8' }}
        >
          <div className="shrink-0 text-center">
            <div className="text-sm font-semibold text-muted-foreground">{t('game.board.ratRace')}</div>
            <div className="text-lg font-bold tracking-tight">{game?.name ?? t('game.board.title')}</div>
            <div className="text-xs text-muted-foreground">
              {t('game.board.turn', { n: game?.turn_number ?? 0 })} &middot; {turnStatusLabel(game?.turn_status)}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-center gap-2">
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
          {token && gameId && (
            <ChatPanel
              gameId={gameId}
              token={token}
              messages={chatMessages}
              players={players}
              embedded
              className="min-h-0 flex-1"
            />
          )}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Info className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold">{t('game.board.cellGuideTitle')}</h2>
              <p className="truncate text-sm text-muted-foreground">{t('game.board.cellGuideSubtitle')}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsCellGuideOpen((isOpen) => !isOpen)}
            aria-expanded={isCellGuideOpen}
            aria-controls="board-cell-guide"
            className="shrink-0 gap-1.5"
          >
            {isCellGuideOpen ? t('game.board.hideCellGuide') : t('game.board.showCellGuide')}
            {isCellGuideOpen ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </div>

        {isCellGuideOpen && (
          <div id="board-cell-guide" className="grid gap-2 border-t border-border px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
            {cellGuideItems.map(({ key, color }) => (
              <div key={key} className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/40 p-3">
                <span className={cn('mt-0.5 h-3 w-3 shrink-0 rounded-full border-2', color)} />
                <div className="min-w-0">
                  <div className="font-medium">{t(`game.board.cellGuide.${key}.name`)}</div>
                  <p className="text-sm leading-snug text-muted-foreground">{t(`game.board.cellGuide.${key}.description`)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>

      <div className="space-y-4">
        {me && <FinancialStatement player={me} professionName={myProfessionName} />}
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
      {game && game.turn_status === 'AWAITING_DEAL_OFFER_CLAIM' && <DealOfferDialog game={game} />}

      {winnerModal && (
        <WinnerModal
          playerName={winnerModal.player_name}
          placement={winnerModal.placement}
          finishedTurn={winnerModal.finished_turn}
          stats={winnerModal.stats}
          isMe={winnerModal.player_id === myPlayerId}
          gameOver={winnerModal.game_over}
          onClose={() => setWinnerModal(null)}
          onWatch={() => setWinnerModal(null)}
        />
      )}
    </div>
  )
}
