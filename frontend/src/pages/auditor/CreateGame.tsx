import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { createGame } from '../../api/auditorPanel'
import { GlassCard, GradientButton } from '../../components/ui'

export default function AuditorCreateGame() {
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()
  const [name, setName] = useState('Cashflow Session')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => createGame(token!, { name, max_players: maxPlayers }),
    onSuccess: (res) => {
      navigate(`/auditor/games/${res.game.id}/players`)
    },
    onError: (e) => {
      setError((e as Error).message)
    },
  })

  const options = useMemo(() => [2, 3, 4, 5, 6], [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Create Game</h1>
      <GlassCard className="max-w-xl">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Game name
            <input className="mt-1 w-full rounded-xl border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Number of players (max 6)
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            >
              {options.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          {error ? <div className="text-sm text-rose-600">{error}</div> : null}

          <GradientButton onClick={() => mutation.mutate()} disabled={mutation.isPending as any} className="w-full">
            {mutation.isPending ? 'Creating...' : 'Create Game'}
          </GradientButton>
        </div>
      </GlassCard>
    </div>
  )
}

