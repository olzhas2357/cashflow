import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Account and session preferences (minimal for MVP).</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>About this build</CardTitle>
          <CardDescription>Cashflow 101 auditor / accountant console — no online board or dice.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          API base: same origin <code className="rounded bg-muted px-1">/api</code> (Vite proxy to backend). Set{' '}
          <code className="rounded bg-muted px-1">VITE_API_BASE_URL</code> for production if needed.
        </CardContent>
      </Card>
    </div>
  )
}
