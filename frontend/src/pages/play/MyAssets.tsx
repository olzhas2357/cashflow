import { useQuery } from '@tanstack/react-query'
import { Building2, Briefcase } from 'lucide-react'
import { listMyAssets, listAuctionOffers } from '@/api/play'
import type { GameAsset } from '@/api/auditorPanel'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const money = (n: number) => `$${n.toLocaleString()}`

function extraText(extra: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = extra?.[key]
  return typeof v === 'string' && v.trim() ? v : undefined
}

function AssetCard({
  asset,
  listed,
  showDescription,
}: {
  asset: GameAsset
  listed: boolean
  showDescription: boolean
}) {
  const description = showDescription
    ? (extraText(asset.extra, 'description') ?? extraText(asset.extra, 'notes'))
    : undefined

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-tight">{asset.name}</CardTitle>
          <Badge variant={listed ? 'warning' : 'success'}>{listed ? 'Listed for auction' : 'Owned'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Price</span>
          <span className="font-mono">{money(asset.price)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Down payment</span>
          <span className="font-mono">{money(asset.down_payment)}</span>
        </div>
        {asset.mortgage > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Mortgage</span>
            <span className="font-mono">{money(asset.mortgage)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cash flow</span>
          <span className="font-mono text-emerald-400/90">{money(asset.income)}/mo</span>
        </div>
        {description && <p className="pt-2 text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  )
}

function AssetSection({
  title,
  icon: Icon,
  assets,
  listedAssetIds,
  showDescription,
  emptyText,
}: {
  title: string
  icon: typeof Building2
  assets: GameAsset[]
  listedAssetIds: Set<string>
  showDescription: boolean
  emptyText: string
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4" />
        {title}
      </div>
      {assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((a) => (
            <AssetCard key={a.id} asset={a} listed={listedAssetIds.has(a.id)} showDescription={showDescription} />
          ))}
        </div>
      )}
    </section>
  )
}

// Player-facing inventory screen — "My assets" nav item. listMyAssets already
// returns every owned asset type (stocks are shown separately in
// StockPortfolioPanel on the Board), we just split real_estate/business into
// their own sections here. "Status" isn't a stored Asset field, so it's
// derived by cross-referencing the player's own open auction listings.
export default function MyAssets() {
  const token = useAuthStore((s) => s.token)
  const gameId = usePlayStore((s) => s.gameId)
  const myPlayerId = useAuthStore((s) => s.user?.player_id)

  const assetsQ = useQuery({
    queryKey: ['my_assets', gameId],
    queryFn: () => listMyAssets(token!),
    enabled: !!token && !!gameId,
    refetchInterval: 5000,
  })

  const auctionQ = useQuery({
    queryKey: ['auction_offers', gameId],
    queryFn: () => listAuctionOffers(token!, gameId!),
    enabled: !!token && !!gameId,
    refetchInterval: 5000,
  })

  const assets = assetsQ.data ?? []
  const listedAssetIds = new Set(
    (auctionQ.data ?? []).filter((o) => o.seller_id === myPlayerId).map((o) => o.asset_id),
  )

  const realEstate = assets.filter((a) => a.type === 'real_estate')
  const business = assets.filter((a) => a.type === 'business')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My assets</h1>
        <p className="text-sm text-muted-foreground">Everything you own on the board — real estate and businesses.</p>
      </div>

      {assetsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <AssetSection
        title="Real estate"
        icon={Building2}
        assets={realEstate}
        listedAssetIds={listedAssetIds}
        showDescription={false}
        emptyText="No real estate yet."
      />

      <AssetSection
        title="Business"
        icon={Briefcase}
        assets={business}
        listedAssetIds={listedAssetIds}
        showDescription
        emptyText="No businesses yet."
      />
    </div>
  )
}
