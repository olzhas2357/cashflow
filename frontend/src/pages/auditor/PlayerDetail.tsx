import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import {
  gameAssets,
  gameLogs,
  getPlayer,
  getPlayerFinance,
  listProfessions,
  professionTotalExpenses,
  type GameAsset,
} from '@/api/auditorPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'

const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default function PlayerDetail() {
  const token = useAuthStore((s) => s.token)
  const { gameId, playerId } = useParams()

  const playerQ = useQuery({
    queryKey: ['player', playerId],
    queryFn: () => getPlayer(token!, playerId!),
    enabled: !!token && !!playerId,
  })

  const financeQ = useQuery({
    queryKey: ['player_finance', playerId],
    queryFn: () => getPlayerFinance(token!, playerId!),
    enabled: !!token && !!playerId,
  })

  const profQ = useQuery({
    queryKey: ['auditor_professions'],
    queryFn: () => listProfessions(token!),
    enabled: !!token,
  })

  const assetsQ = useQuery({
    queryKey: ['auditor_assets', gameId],
    queryFn: () => gameAssets(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const logsQ = useQuery({
    queryKey: ['auditor_logs', gameId],
    queryFn: () => gameLogs(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const p = playerQ.data
  const prof = profQ.data?.find((x) => x.id === p?.profession_id)
  const report = financeQ.data
  const myAssets = (assetsQ.data ?? []).filter((a: GameAsset) => a.owner_id === playerId)
  const myLogs = (logsQ.data ?? []).filter((l) => l.player_id === playerId).slice(-20).reverse()

  const byType = (t: string) => myAssets.filter((a) => a.type === t)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button variant="ghost" size="sm" className="gap-2" asChild>
        <Link to={`/auditor/games/${gameId}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to game
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold">{p?.name ?? 'Player'}</h1>
        <p className="text-muted-foreground">Full financial card — Rat Race statement.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cash</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-3xl font-semibold tracking-tight">{money(p?.cash ?? 0)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly cashflow</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-3xl font-semibold text-emerald-400/90">
            {money(report?.income_statement.net_income ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Children</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{p?.children_count ?? 0}</CardContent>
        </Card>
      </div>

      {prof && (
        <Card>
          <CardHeader>
            <CardTitle>Profession: {prof.name}</CardTitle>
            <CardDescription>Starting card totals (before extra assets).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 font-mono text-sm sm:grid-cols-2">
            <Row label="Salary" value={money(prof.salary)} />
            <Row label="Taxes" value={money(prof.tax)} />
            <Row label="Mortgage payment" value={money(prof.mortgage_payment)} />
            <Row label="School loan" value={money(prof.school_loan_payment)} />
            <Row label="Car loan" value={money(prof.car_loan_payment)} />
            <Row label="Credit card" value={money(prof.credit_card_payment)} />
            <Row label="Retail" value={money(prof.retail_payment)} />
            <Row label="Other expenses" value={money(prof.other_expenses)} />
            <Row label="Child expense (each)" value={money(prof.child_expense)} />
            <Row label="Total expenses (excl. children)" value={money(professionTotalExpenses(prof))} highlight />
            <Row label="Savings (starting cash)" value={money(prof.savings)} highlight />
          </CardContent>
        </Card>
      )}

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>Report snapshot</CardTitle>
            <CardDescription>From balance / income engine (assets you own on the table).</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 font-mono text-sm sm:grid-cols-2">
            <Row label="Assets (book)" value={money(report.balance_sheet.assets)} />
            <Row label="Liabilities" value={money(report.balance_sheet.liabilities)} />
            <Row label="Equity" value={money(report.balance_sheet.equity)} />
            <Row label="Total income" value={money(report.income_statement.total_income)} />
            <Row label="Base expenses" value={money(report.income_statement.base_expenses)} />
            <Row label="Child expense each" value={money(report.income_statement.child_expense_each)} />
            <Row label="Children expense total" value={money(report.income_statement.children_expense_total)} />
            <Row label="Total expenses" value={money(report.income_statement.total_expenses)} />
            <Row label="Net income (monthly cashflow)" value={money(report.income_statement.net_income)} highlight />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Assets</CardTitle>
          <CardDescription>Grouped by type — stocks, real estate, business.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AssetBlock title="Stocks & paper" items={byType('stocks')} />
          <AssetBlock title="Real estate" items={byType('real_estate')} />
          <AssetBlock title="Business" items={byType('business')} />
          <AssetBlock title="Other" items={myAssets.filter((a) => !['stocks', 'real_estate', 'business'].includes(a.type))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent log</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[240px] pr-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myLogs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Badge variant="outline">{l.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{money(l.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{l.description ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {myLogs.length === 0 && <p className="text-sm text-muted-foreground">No entries yet.</p>}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 border-b border-border/50 py-1 ${highlight ? 'text-primary' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function AssetBlock({ title, items }: { title: string; items: GameAsset[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-muted-foreground">{title}</div>
      <div className="space-y-2">
        {items.map((a) => (
          <div key={a.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
            <span className="font-medium">{a.name}</span>
            <span className="font-mono text-muted-foreground">
              {money(a.price)} · +{money(a.income)}/mo
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
