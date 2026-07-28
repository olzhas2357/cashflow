import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listMyAssets, makeDecision, sellStockToBank } from '@/api/play'
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
  // big_deal_real_estate_news cards ("Ущерб от жильца" etc.) are a mandatory
  // expense — you only ever see one if you already own a matching property
  // (checked server-side before this dialog opens), so there's no Pass, just
  // an amount due.
  const isBigDealNews = !isSmallDeal && game.active_big_deal?.deal_type === 'big_deal_real_estate_news'
  // Defaults to false — a purchase that can't be covered by cash on hand
  // should fail with "insufficient cash" unless the player explicitly opts
  // into a bank loan, not take one out silently on their behalf.
  const [allowLoan, setAllowLoan] = useState(false)

  // "Offer to all" lets this player hand the deal off to whoever accepts
  // first, for a commission on top of the bank price — not available for
  // mandatory expense cards or stock (stock purchases are restricted to
  // whoever opened the card, so a non-opener buyer could never claim it).
  const canOfferToAll = !isBigDealNews && !isStock
  const [showOfferInput, setShowOfferInput] = useState(false)
  const [commission, setCommission] = useState(0)

  const decisionMut = useMutation({
    mutationFn: (payload: { action: 'buy' | 'pass' | 'offer_deal_all'; commission?: number }) =>
      makeDecision(token!, gameId!, {
        action: payload.action,
        shares: isStock ? shares : undefined,
        allow_loan: allowLoan,
        commission: payload.commission,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
  })

  // Lets a player sell shares they already hold in this same stock while the
  // Buy/Pass dialog is open — the dialog blocks background clicks (including
  // the portfolio panel's own Sell button), so without this the only way to
  // reach it was to Pass first, losing the chance to buy at this price too.
  const symbol = game.active_small_deal?.symbol
  const assetsQ = useQuery({
    queryKey: ['my_assets', gameId],
    queryFn: () => listMyAssets(token!),
    enabled: !!token && isStock && !!symbol,
  })
  const ownedAsset = assetsQ.data?.find(
    (a) => a.type === 'stock' && a.symbol && symbol && a.symbol.toUpperCase() === symbol.toUpperCase(),
  )
  const ownedShares = ownedAsset?.shares ?? 0
  const [sellShares, setSellShares] = useState(1)

  const sellMut = useMutation({
    mutationFn: (n: number) => sellStockToBank(token!, gameId!, symbol!, n),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_assets', gameId] })
      qc.invalidateQueries({ queryKey: ['play_lobby', gameId] })
    },
  })

  if (!deal) return null

  return (
    <Dialog open>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {isSmallDeal ? 'Small Deal' : 'Big Deal'}: {deal.name?.trim() || '⚠ Unnamed card'}
          </DialogTitle>
          {deal.description?.trim() ? (
            <DialogDescription className="whitespace-pre-line">{deal.description}</DialogDescription>
          ) : (
            <DialogDescription className="text-destructive">
              ⚠ Card data is missing — description was not generated.
            </DialogDescription>
          )}
        </DialogHeader>

        {isBigDealNews ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between font-medium">
              <span className="text-muted-foreground">Amount due</span>
              <span>${deal.down_payment.toLocaleString()}</span>
            </div>
          </div>
        ) : (
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
        )}

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

        {isStock && ownedShares > 0 && (
          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
            <p className="text-sm text-muted-foreground">
              You already own {ownedShares.toLocaleString()} shares of {symbol}.
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={ownedShares}
                value={sellShares}
                onChange={(e) => setSellShares(Math.max(1, Math.min(ownedShares, Number(e.target.value))))}
                className="h-9"
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                disabled={sellMut.isPending}
                onClick={() => sellMut.mutate(sellShares)}
              >
                Sell @ ${deal.price.toLocaleString()}
              </Button>
            </div>
            {sellMut.isError && (
              <p className="text-xs text-destructive">
                {sellMut.error instanceof Error ? sellMut.error.message : 'Could not sell.'}
              </p>
            )}
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

        {canOfferToAll && showOfferInput && (
          <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
            <Label htmlFor="commission">Your commission on top of price</Label>
            <Input
              id="commission"
              type="number"
              min={0}
              value={commission}
              onChange={(e) => setCommission(Math.max(0, Number(e.target.value)))}
            />
            <p className="text-xs text-muted-foreground">
              Whoever accepts first pays ${deal.down_payment.toLocaleString()} to the bank +{' '}
              ${commission.toLocaleString()} to you = ${(deal.down_payment + commission).toLocaleString()} total.
            </p>
            <Button
              className="w-full"
              disabled={decisionMut.isPending}
              onClick={() => decisionMut.mutate({ action: 'offer_deal_all', commission })}
            >
              Send to all players
            </Button>
          </div>
        )}

        {decisionMut.isError && (
          <p className="text-sm text-destructive">
            {decisionMut.error instanceof Error ? decisionMut.error.message : 'Could not process decision.'}
          </p>
        )}

        <DialogFooter className="gap-2">
          {!isBigDealNews && (
            <Button
              variant="outline"
              onClick={() => decisionMut.mutate({ action: 'pass' })}
              disabled={decisionMut.isPending}
            >
              Pass
            </Button>
          )}
          {canOfferToAll && !showOfferInput && (
            <Button variant="outline" onClick={() => setShowOfferInput(true)} disabled={decisionMut.isPending}>
              Offer to all
            </Button>
          )}
          <Button onClick={() => decisionMut.mutate({ action: 'buy' })} disabled={decisionMut.isPending}>
            {decisionMut.isPending
              ? 'Processing…'
              : isBigDealNews
                ? `Pay $${deal.down_payment.toLocaleString()}`
                : 'Buy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
