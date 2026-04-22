import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import {
  assignProfession,
  getGame,
  listPlayers,
  listProfessions,
  professionTotalExpenses,
  referenceData,
  type Profession,
  type UserPlayer,
} from '@/api/auditorPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function AssignProfessions() {
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

  const profQ = useQuery({
    queryKey: ['auditor_professions'],
    queryFn: () => listProfessions(token!),
    enabled: !!token,
  })

  /** Fallback: same professions as in game reference bundle (if global list endpoint fails or is empty). */
  const refQ = useQuery({
    queryKey: ['auditor_reference', gameId],
    queryFn: () => referenceData(token!, gameId!),
    enabled: !!token && !!gameId,
  })

  const players = playersQ.data ?? []
  const professions = useMemo(() => {
    const fromList = profQ.data ?? []
    const fromRef = refQ.data?.professions ?? []
    if (fromList.length > 0) return fromList
    return fromRef
  }, [profQ.data, refQ.data?.professions])

  const [selection, setSelection] = useState<Record<string, string>>({})

  useEffect(() => {
    setSelection((prev) => {
      const fromServer: Record<string, string> = {}
      for (const p of players) {
        if (p.profession_id) fromServer[p.id] = p.profession_id
      }
      return { ...prev, ...fromServer }
    })
  }, [players])

  const assignM = useMutation({
    mutationFn: async ({ playerId, professionId }: { playerId: string; professionId: string }) => {
      await assignProfession(token!, gameId!, playerId, professionId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['auditor_players', gameId] })
      qc.invalidateQueries({ queryKey: ['auditor_finance', gameId] })
    },
  })

  const allDone = useMemo(
    () => players.length > 0 && players.every((p) => selection[p.id]),
    [players, selection],
  )

  const loading = profQ.isLoading || refQ.isLoading
  const loadError = profQ.isError && refQ.isError

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="gap-2" asChild>
          <Link to={`/auditor/games/${gameId}/players`}>
            <ArrowLeft className="h-4 w-4" />
            Players
          </Link>
        </Button>
        <Button onClick={() => navigate(`/auditor/games/${gameId}`)} disabled={!allDone}>
          Open game dashboard
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Professions</h1>
        <p className="text-muted-foreground">
          Pick a profession card for each player — starting salary, expenses, and savings apply automatically.
        </p>
      </div>

      {loadError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Не удалось загрузить профессии</p>
              <p className="text-sm text-muted-foreground">
                Проверьте, что бэкенд запущен и вы вошли как auditor. В БД должны быть сиды профессий (
                <code className="rounded bg-muted px-1">seeds.SeedAll</code>).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && !loadError && professions.length === 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-medium">Список профессий пуст</p>
              <p className="text-sm text-muted-foreground">
                Запустите миграции и сиды на сервере, затем перезагрузите страницу.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {players.map((p: UserPlayer) => {
          const selectedProf = selection[p.id] ? professions.find((x) => x.id === selection[p.id]) : undefined
          const currentValue = selection[p.id] ?? ''

          return (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{p.name}</CardTitle>
                <CardDescription>Choose profession</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="h-10 animate-pulse rounded-md bg-muted" />
                ) : (
                  <Select
                    value={currentValue || undefined}
                    onValueChange={(professionId) => {
                      setSelection((s) => ({ ...s, [p.id]: professionId }))
                      assignM.mutate({ playerId: p.id, professionId })
                    }}
                    disabled={professions.length === 0 || assignM.isPending}
                  >
                    <SelectTrigger className="w-full" aria-label={`Profession for ${p.name}`}>
                      <SelectValue placeholder="— Выберите профессию —" />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4}>
                      {professions.map((pr: Profession) => (
                        <SelectItem key={pr.id} value={pr.id}>
                          {pr.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {assignM.isPending && <p className="text-xs text-muted-foreground">Сохранение…</p>}
                {selectedProf ? <ProfessionCard profession={selectedProf} /> : null}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {players.length === 0 && <p className="text-muted-foreground">Add players first.</p>}

      <Card>
        <CardHeader>
          <CardTitle>Profession library</CardTitle>
          <CardDescription>Reference: totals from the profession card (before children).</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[320px] pr-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {professions.map((pr) => (
                  <ProfessionCard key={pr.id} profession={pr} />
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function ProfessionCard({ profession: pr }: { profession: Profession }) {
  const totalEx = professionTotalExpenses(pr)
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
      <div className="font-semibold">{pr.name}</div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
        <span>Salary</span>
        <span className="text-foreground">${pr.salary.toLocaleString()}</span>
        <span>Total expenses</span>
        <span className="text-amber-400/90">${totalEx.toLocaleString()}</span>
        <span>Savings</span>
        <span className="text-emerald-400/90">${pr.savings.toLocaleString()}</span>
        <span>Child / baby</span>
        <span>${pr.child_expense.toLocaleString()}</span>
      </div>
      <Badge variant="outline" className="mt-2">
        Net {pr.salary - totalEx >= 0 ? '+' : ''}
        {(pr.salary - totalEx).toLocaleString()}/mo
      </Badge>
    </div>
  )
}
