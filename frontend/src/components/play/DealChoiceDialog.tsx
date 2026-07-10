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
import { Building2, Landmark } from 'lucide-react'

// Shown only to the current-turn player when turn_status ===
// 'AWAITING_DEAL_CHOICE' — landing on a Deal cell lets the player pick which
// deck to draw from before the usual buy/pass flow (DealDecisionDialog) begins.
export function DealChoiceDialog() {
  const token = useAuthStore((s) => s.token)
  const gameId = usePlayStore((s) => s.gameId)
  const qc = useQueryClient()

  const choiceMut = useMutation({
    mutationFn: (action: 'small' | 'big') => makeDecision(token!, gameId!, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['play_lobby', gameId] }),
  })

  return (
    <Dialog open>
      <DialogContent onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Choose a deal</DialogTitle>
          <DialogDescription>Pick which deck to draw a card from.</DialogDescription>
        </DialogHeader>

        {choiceMut.isError && (
          <p className="text-sm text-destructive">
            {choiceMut.error instanceof Error ? choiceMut.error.message : 'Could not choose.'}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => choiceMut.mutate('small')}
            disabled={choiceMut.isPending}
          >
            <Building2 className="h-4 w-4" />
            Small Deal
          </Button>
          <Button className="flex-1 gap-2" onClick={() => choiceMut.mutate('big')} disabled={choiceMut.isPending}>
            <Landmark className="h-4 w-4" />
            Big Deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
