import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Gamepad2,
  Users,
  ArrowLeftRight,
  TrendingUp,
  ScrollText,
  Settings,
  LogOut,
  ClipboardList,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/auditor/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/auditor/games', label: 'Games', icon: Gamepad2 },
  { to: '/auditor/players', label: 'Players', icon: Users },
  { to: '/auditor/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/auditor/market', label: 'Market', icon: TrendingUp },
  { to: '/auditor/logs', label: 'Logs', icon: ScrollText },
  { to: '/auditor/settings', label: 'Settings', icon: Settings },
]

export function AuditorLayout() {
  const navigate = useNavigate()
  const logoutStore = useAuthStore((s) => s.logout)

  function logout() {
    logoutStore()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <div className="text-sm font-semibold text-sidebar-foreground">Cashflow 101</div>
            <div className="text-xs text-muted-foreground">Auditor console</div>
          </div>
        </div>
        <ScrollArea className="flex-1 py-4">
          <nav className="flex flex-col gap-1 px-2">
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
        </ScrollArea>
        <Separator />
        <div className="p-3">
          <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
          <span className="text-sm font-semibold">Cashflow Auditor</span>
        </header>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
