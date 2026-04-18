import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { assignProfession, getGame, listPlayers, referenceData, type Profession } from '../../api/auditorPanel'
import { GlassCard, GradientButton } from '../../components/ui'
import type { UserPlayer } from '../../api/auditorPanel'

export default function AuditorAssignProfessions() {
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

  const refQ = useQuery({
    queryKey: ['auditor_reference', gameId],
    queryFn: () => referenceData(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const professions = refQ.data?.professions ?? []
  const players = playersQ.data ?? []

  const initial = useMemo(() => {
    const map: Record<string, string> = {}
    for (const p of players) map[p.id] = p.profession_id ?? ''
    return map
  }, [players])

  const [selected, setSelected] = useState<Record<string, string>>(initial)

  useEffect(() => {
    // Sync once when players are loaded or when the list changes significantly.
    const hasAny = Object.keys(selected).length > 0
    if (!hasAny) setSelected(initial)
  }, [initial, selected])

  const mutation = useMutation({
    mutationFn: (payload: { playerId: string; professionId: string }) =>
      assignProfession(token!, gameId!, payload.playerId, payload.professionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auditor_players', gameId] })
      qc.invalidateQueries({ queryKey: ['auditor_finance', gameId] })
    },
  })

  const allAssigned = players.length > 0 && players.every((p: UserPlayer) => (selected[p.id] ?? '') !== '')
  const maxPlayers = gameQ.data?.max_players ?? 6

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Assign Professions</h1>
          <div className="text-sm text-slate-600">
            {players.length}/{maxPlayers} players • choose a profession for each player
          </div>
        </div>
        <GradientButton onClick={() => navigate(`/auditor/games/${gameId}`)} disabled={!allAssigned}>
          Open Control Panel
        </GradientButton>
      </div>

      <GlassCard>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {players.map((p: UserPlayer) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="font-semibold">{p.name}</div>
              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-600">Profession</label>
                <select
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                  value={selected[p.id] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setSelected((prev) => ({ ...prev, [p.id]: v }))
                    if (v) mutation.mutate({ playerId: p.id, professionId: v })
                  }}
                >
                  <option value="">Select...</option>
                  {professions.map((prof: Profession) => (
                    <option key={prof.id} value={prof.id}>
                      {prof.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 text-sm text-slate-600">
                {mutation.isPending ? 'Saving...' : p.profession_id ? 'Assigned' : 'Not assigned'}
              </div>
            </div>
          ))}
          {players.length === 0 ? <div className="text-slate-500">No players. Add players first.</div> : null}
        </div>
      </GlassCard>
    </div>
  )
}

