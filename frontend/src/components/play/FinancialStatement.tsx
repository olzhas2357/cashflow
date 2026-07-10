import type { LobbyPlayer } from '@/api/play'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function FinancialStatement({ player }: { player: LobbyPlayer }) {
  const positive = player.monthly_cashflow >= 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial Statement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-primary/10 p-4 text-center">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Cash on hand</div>
          <div className="text-3xl font-bold">${player.cash.toLocaleString()}</div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="mb-1 font-semibold text-emerald-400">Income</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Salary</span>
              <span>${player.salary.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Passive</span>
              <span>${player.passive_income.toLocaleString()}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
              <span>Total</span>
              <span>${player.total_income.toLocaleString()}</span>
            </div>
          </div>
          <div>
            <div className="mb-1 font-semibold text-rose-400">Expenses</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base</span>
              <span>${player.expenses.toLocaleString()}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
              <span>Total</span>
              <span>${player.total_expenses.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div
          className={cn(
            'rounded-lg border p-3 text-center',
            positive ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-rose-500/30 bg-rose-500/10',
          )}
        >
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Monthly Cashflow</div>
          <div className={cn('text-xl font-bold', positive ? 'text-emerald-400' : 'text-rose-400')}>
            {positive ? '+' : ''}${player.monthly_cashflow.toLocaleString()}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Assets</span>
            <span>${player.assets_total.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Liabilities</span>
            <span>${player.liabilities_total.toLocaleString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
