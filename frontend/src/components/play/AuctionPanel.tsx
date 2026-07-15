import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listAuctionOffers, bidOnAuction, confirmAuctionTransaction } from '@/api/play'
import type { MarketOfferAuction } from '@/api/auditorPanel'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Gavel } from 'lucide-react'

function useCountdown(expiresAt?: string | null) {
  const [msLeft, setMsLeft] = useState(() => (expiresAt ? new Date(expiresAt).getTime() - Date.now() : 0))

  useEffect(() => {
    if (!expiresAt) return
    const id = setInterval(() => setMsLeft(new Date(expiresAt).getTime() - Date.now()), 500)
    return () => clearInterval(id)
  }, [expiresAt])

  return Math.max(0, msLeft)
}

function AuctionCard({ offer }: { offer: MarketOfferAuction }) {
  const token = useAuthStore((s) => s.token)
  const myPlayerId = useAuthStore((s) => s.user?.player_id)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()

  const msLeft = useCountdown(offer.expires_at)
  const expired = !!offer.expires_at && msLeft <= 0
  const topBid = offer.bids?.[0]
  const isSeller = offer.seller_id === myPlayerId
  const myBid = offer.bids?.find((b) => b.buyer_id === myPlayerId)
  const [bidPrice, setBidPrice] = useState((topBid?.offer_price ?? offer.price) + 1)

  const bidMut = useMutation({
    mutationFn: (price: number) => bidOnAuction(token!, gameId!, offer.id, price),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auction_offers', gameId] }),
  })

  const confirmMut = useMutation({
    mutationFn: (txId: string) => confirmAuctionTransaction(token!, gameId!, txId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auction_offers', gameId] })
      qc.invalidateQueries({ queryKey: ['play_lobby', gameId] })
    },
  })

  const secondsLeft = Math.ceil(msLeft / 1000)

  return (
    <div className="space-y-2 rounded-lg border border-border px-3 py-2 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-medium">{offer.asset?.name ?? 'Asset'}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Gavel className="h-3 w-3" />
          {expired ? 'Ended' : `${secondsLeft}s left`}
        </div>
      </div>
      <div className="text-muted-foreground">Seller: {offer.seller?.name ?? '—'}</div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Starting price</span>
        <span>${offer.price.toLocaleString()}</span>
      </div>
      <div className="flex justify-between font-medium">
        <span className="text-muted-foreground">Highest bid</span>
        <span>{topBid ? `$${topBid.offer_price.toLocaleString()}` : 'No bids yet'}</span>
      </div>

      {!expired && !isSeller && (
        <div className="flex items-center gap-2 pt-1">
          <Input
            type="number"
            min={(topBid?.offer_price ?? offer.price) + 1}
            value={bidPrice}
            onChange={(e) => setBidPrice(Number(e.target.value))}
            className="h-8"
            aria-label="Bid amount"
          />
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => bidMut.mutate(bidPrice)}
            disabled={bidMut.isPending}
          >
            {myBid ? 'Raise bid' : 'Bid'}
          </Button>
        </div>
      )}
      {!expired && isSeller && (
        <p className="text-xs text-muted-foreground">Waiting for the timer to run out…</p>
      )}

      {expired && topBid && (isSeller || topBid.buyer_id === myPlayerId) && (
        <Button
          size="sm"
          className="w-full"
          onClick={() => confirmMut.mutate(topBid.id)}
          disabled={confirmMut.isPending || (isSeller ? !!topBid.seller_confirmed : !!topBid.buyer_confirmed)}
        >
          {(isSeller ? topBid.seller_confirmed : topBid.buyer_confirmed)
            ? 'Waiting on the other side…'
            : `Confirm sale for $${topBid.offer_price.toLocaleString()}`}
        </Button>
      )}
      {expired && !topBid && <p className="text-xs text-muted-foreground">No bids — listing closed.</p>}

      {(bidMut.isError || confirmMut.isError) && (
        <p className="text-xs text-destructive">
          {(bidMut.error ?? confirmMut.error) instanceof Error
            ? (bidMut.error ?? confirmMut.error as Error).message
            : 'Something went wrong.'}
        </p>
      )}
    </div>
  )
}

// Visible to every player whenever at least one asset is up for a timed
// player-vs-player auction (started from MarketDecisionDialog's "Auction"
// button) — polls frequently since bids need to feel live even without a
// fresh WS event, and the WS AUCTION_* handlers in Board.tsx also invalidate
// this query for near-instant updates.
export function AuctionPanel() {
  const token = useAuthStore((s) => s.token)
  const gameId = usePlayStore((s) => s.gameId)

  const offersQ = useQuery({
    queryKey: ['auction_offers', gameId],
    queryFn: () => listAuctionOffers(token!, gameId!),
    enabled: !!token && !!gameId,
    refetchInterval: 3000,
  })

  const offers = offersQ.data ?? []
  if (offers.length === 0) return null

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Gavel className="h-4 w-4" />
        Player auctions
      </div>
      {offers.map((offer) => (
        <AuctionCard key={offer.id} offer={offer} />
      ))}
    </div>
  )
}
