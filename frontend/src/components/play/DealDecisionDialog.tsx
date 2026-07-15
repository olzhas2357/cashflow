import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Shown only to the current-turn player when turn_status === 'AWAITING_DECISION'.
// The deal ID is never sent by the client — the server resolves it from
// game.active_small_deal_id / active_big_deal_id, so this dialog only needs
// to render what's already attached to the game object.
export function DealDecisionDialog({ game }: { game: GameSession }) {
  const token = useAuthStore((s) => s.token)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()
  const [shares, setShares] = useState(1)

  const isSmallDeal = !!game.active_small_deal
  const deal = game.active_small_deal ?? game.active_big_deal
  const isStock = isSmallDeal && game.active_small_deal?.category === 'stock'
  // Defaults to false — a purchase that can't be covered by cash on hand
  // should fail with "insufficient cash" unless the player explicitly opts
  // into a bank loan, not take one out silently on their behalf.
  const [allowLoan, setAllowLoan] = useState(false)

  const decisionMut = useMutation({
    mutationFn: (action: 'buy' | 'pass') =>
      makeDecision(token!, gameId!, {
        action,
        shares: isStock ? shares : undefined,
        allow_loan: allowLoan,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
  })

  if (!deal) return null

  return (
    <Dialog open>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {isSmallDeal ? 'Small Deal' : 'Big Deal'}: {deal.name}
          </DialogTitle>
          <DialogDescription>{deal.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Price</span>
            <span>${deal.price.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Down payment</span>
            <span>${deal.down_payment.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cashflow / mo</span>
            <span>${deal.cashflow.toLocaleString()}</span>
          </div>
        </div>

        {isStock && (
          <div className="space-y-2">
            <Label htmlFor="shares">Shares</Label>
            <Input
              id="shares"
              type="number"
              min={1}
              value={shares}
              onChange={(e) => setShares(Math.max(1, Number(e.target.value)))}
            />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={allowLoan}
            onChange={(e) => setAllowLoan(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Take a bank loan if I don't have enough cash
        </label>

        {decisionMut.isError && (
          <p className="text-sm text-destructive">
            {decisionMut.error instanceof Error ? decisionMut.error.message : 'Could not process decision.'}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => decisionMut.mutate('pass')} disabled={decisionMut.isPending}>
            Pass
          </Button>
          <Button onClick={() => decisionMut.mutate('buy')} disabled={decisionMut.isPending}>
            {decisionMut.isPending ? 'Processing…' : 'Buy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
