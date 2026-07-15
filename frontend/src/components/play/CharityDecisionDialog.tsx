import { useMutation, useQueryClient } from '@tanstack/react-query'
import { makeDecision } from '@/api/play'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { HeartHandshake } from 'lucide-react'

// Shown only to the current-turn player when turn_status ===
// 'AWAITING_CHARITY_DECISION'. Donating pays 10% of total income (salary +
// passive) and grants 3 turns of rolling 2 dice instead of 1 (see Board.tsx's
// dice display and the double-roll logic in turn.go's Roll handler).
export function CharityDecisionDialog() {
  const token = useAuthStore((s) => s.token)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()

  const decisionMut = useMutation({
    mutationFn: (action: 'charity_donate' | 'charity_skip') => makeDecision(token!, gameId!, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
  })

  return (
    <Dialog open>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartHandshake className="h-5 w-5" />
            Charity
          </DialogTitle>
          <DialogDescription>
            Donate 10% of your total income (salary + passive) to charity, and roll 2 dice for your next 3 turns.
            Or skip and keep rolling 1 die as usual.
          </DialogDescription>
        </DialogHeader>

        {decisionMut.isError && (
          <p className="text-sm text-destructive">
            {decisionMut.error instanceof Error ? decisionMut.error.message : 'Could not process decision.'}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => decisionMut.mutate('charity_skip')}
            disabled={decisionMut.isPending}
          >
            Skip
          </Button>
          <Button onClick={() => decisionMut.mutate('charity_donate')} disabled={decisionMut.isPending}>
            {decisionMut.isPending ? 'Processing…' : 'Donate 10%'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
