import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { addPlayers, getGame, listPlayers } from '../../api/auditorPanel'
import { GlassCard, GradientButton } from '../../components/ui'
import type { UserPlayer } from '../../api/auditorPanel'

export default function AuditorAddPlayers() {
  const token = useAuthStore((s) => s.token)
  const { gameId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const gameQ = useQuery({
    queryKey: ['auditor_game', gameId],
    queryFn: () => getGame(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const playersQ = useQuery({
    queryKey: ['auditor_players', gameId],
    queryFn: () => listPlayers(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const [rawNames, setRawNames] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => addPlayers(token!, gameId!, { names: parseNames(rawNames) }),
    onSuccess: () => {
      setRawNames('')
      qc.invalidateQueries({ queryKey: ['auditor_players', gameId] })
    },
    onError: (e) => setError((e as Error).message),
  })

  const players = playersQ.data ?? []
  const maxPlayers = gameQ.data?.max_players ?? 6

  const ready = players.length > 0 && players.length <= maxPlayers

  const canGo = players.length >= maxPlayers || players.length === gameQ.data?.max_players

  useEffect(() => {
    setError(null)
  }, [rawNames])

  const subtitle = useMemo(() => (playersQ.data ? `${players.length}/${maxPlayers} players` : 'Loading...'), [players.length, playersQ.data, maxPlayers])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Add Players</h1>
          <div className="text-sm text-slate-600">{subtitle}</div>
        </div>
        <div className="flex gap-2">
          <GradientButton onClick={() => navigate(`/auditor/games/${gameId}/professions`)} disabled={!ready}>
            Assign Professions
          </GradientButton>
        </div>
      </div>

      <GlassCard className="max-w-2xl">
        <label className="block text-sm font-medium text-slate-700">
          Enter player names
          <textarea
            className="mt-2 h-28 w-full rounded-xl border px-3 py-2 font-mono text-sm"
            placeholder={`Alex\nDana\nTimur\nAli`}
            value={rawNames}
            onChange={(e) => setRawNames(e.target.value)}
          />
        </label>

        {error ? <div className="mt-2 text-sm text-rose-600">{error}</div> : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <GradientButton onClick={() => mutation.mutate()} disabled={mutation.isPending || parseNames(rawNames).length === 0}>
            {mutation.isPending ? 'Adding...' : 'Add Players'}
          </GradientButton>
          <button className="rounded-xl border px-4 py-2 text-sm" onClick={() => setRawNames('')}>
            Clear
          </button>
        </div>
      </GlassCard>

      <GlassCard className="max-w-2xl">
        <h2 className="text-lg font-semibold">Current Players</h2>
        <div className="mt-3 overflow-auto rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 text-left font-semibold">Name</th>
                <th className="p-2 text-left font-semibold">Profession</th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 ? (
                <tr>
                  <td className="p-2 text-slate-500" colSpan={2}>
                    No players yet.
                  </td>
                </tr>
              ) : (
                players.map((p: UserPlayer) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="p-2 font-medium">{p.name}</td>
                    <td className="p-2 text-slate-600">{p.profession_id ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}

function parseNames(raw: string): string[] {
  return raw
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
}

