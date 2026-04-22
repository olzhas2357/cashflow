import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { createGame } from '@/api/auditorPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'

export default function AuditorCreateGame() {
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()
  const [name, setName] = useState('Session')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => createGame(token!, { name, max_players: maxPlayers }),
    onSuccess: (res) => {
      navigate(`/auditor/games/${res.game.id}/players`)
    },
    onError: (e: Error) => setError(e.message),
  })

  const options = useMemo(() => [1, 2, 3, 4, 5, 6], [])

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Button variant="ghost" size="sm" className="gap-2" asChild>
        <Link to="/auditor/dashboard">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>New game session</CardTitle>
          <CardDescription>Name the table and set how many seats (max 6, Cashflow 101).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gname">Game name</Label>
            <Input id="gname" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxp">Players (max 6)</Label>
            <select
              id="maxp"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            >
              {options.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
