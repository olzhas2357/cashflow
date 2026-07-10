import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutList, Dice5, LogOut } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/play/lobby', label: 'Lobby', icon: LayoutList },
  { to: '/play/board', label: 'Board', icon: Dice5 },
]

export function PlayLayout() {
  const navigate = useNavigate()
  const logoutStore = useAuthStore((s) => s.logout)
  const clearGameId = usePlayStore((s) => s.clearGameId)

  function logout() {
    logoutStore()
    clearGameId()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-56 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <Dice5 className="h-6 w-6 text-primary" />
          <div>
            <div className="text-sm font-semibold text-sidebar-foreground">Cashflow 101</div>
            <div className="text-xs text-muted-foreground">Player</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-2 py-4">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-sidebar-foreground/80 hover:bg-accent hover:text-accent-foreground',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <Separator />
        <div className="mt-auto p-3">
          <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
          <span className="text-sm font-semibold">Cashflow 101</span>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
