import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { takeBankLoan, repayBankLoan } from '@/api/play'
import type { LobbyPlayer } from '@/api/play'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Landmark } from 'lucide-react'

// Always visible — bank loans are $1000-multiples at 10%/month interest
// (baked into loan_expense, part of total expenses every Payday). Borrowing
// happens automatically during purchases that need it, but this lets a
// player take a loan voluntarily, and — the point raised — repay principal
// early whenever they have spare cash instead of only via the auditor panel.
export function LoanPanel({ player }: { player: LobbyPlayer }) {
  const { t } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()
  const [amount, setAmount] = useState(1000)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] })

  const takeMut = useMutation({
    mutationFn: (amt: number) => takeBankLoan(token!, gameId!, amt),
    onSuccess: invalidate,
  })
  const repayMut = useMutation({
    mutationFn: (amt: number) => repayBankLoan(token!, gameId!, amt),
    onSuccess: invalidate,
  })

  const roundedAmount = Math.max(1000, Math.round(amount / 1000) * 1000)
  const loanBalance = player.loan_balance ?? 0
  const loanExpense = player.loan_expense ?? 0
  const pending = takeMut.isPending || repayMut.isPending
  const error = takeMut.error ?? repayMut.error

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Landmark className="h-4 w-4" />
        {t('game.loan.title')}
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{t('game.loan.balance')}</span>
        <span>${loanBalance.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{t('game.loan.interest')}</span>
        <span>${loanExpense.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Input
          type="number"
          step={1000}
          min={1000}
          value={roundedAmount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="h-8"
        />
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => takeMut.mutate(roundedAmount)} disabled={pending}>
          {t('game.loan.borrow')}
        </Button>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => repayMut.mutate(roundedAmount)}
          disabled={pending || loanBalance <= 0}
        >
          {t('game.loan.repay')}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive">{error instanceof Error ? error.message : t('game.loan.errorDefault')}</p>
      )}
    </div>
  )
}
