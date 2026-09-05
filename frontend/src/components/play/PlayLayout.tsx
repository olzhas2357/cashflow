import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LayoutList, Dice5, LogOut, Briefcase } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePlayStore } from '@/store/usePlayStore'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { MyActivityPanel } from '@/components/play/MyActivityPanel'
import { cn } from '@/lib/utils'

export function PlayLayout() {
  const { t } = useTranslation()
  const nav = [
    { to: '/play/lobby', label: t('game.layout.navLobby'), icon: LayoutList },
    { to: '/play/board', label: t('game.layout.navBoard'), icon: Dice5 },
    { to: '/play/assets', label: t('game.layout.navAssets'), icon: Briefcase },
  ]
  const navigate = useNavigate()
  const logoutStore = useAuthStore((s) => s.logout)
  const clearGameId = usePlayStore((s) => s.clearGameId)

  function logout() {
    logoutStore()
    clearGameId()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden h-screen w-80 flex-col border-r border-border bg-sidebar lg:flex">
  <div className="border-b border-border p-6">
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Dice5 className="h-6 w-6 text-primary" />
      </div>

      <div>
        <h1 className="text-2xl font-bold">CashYOU</h1>
        <p className="text-muted-foreground">
          {t("game.layout.player")}
        </p>
      </div>
    </div>
  </div>

  <nav className="space-y-2 p-4">
    {nav.map(({ to, label, icon: Icon }) => (
      <NavLink
        key={to}
        to={to}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isActive
              ? "bg-primary/15 text-primary"
              : "text-sidebar-foreground/80 hover:bg-accent hover:text-accent-foreground"
          )
        }
      >
        <Icon className="h-5 w-5" />
        {label}
      </NavLink>
    ))}
  </nav>

  <div className="min-h-0 flex-1 px-4 pb-4">
    <MyActivityPanel />
  </div>

  <Separator />

  <div className="p-4">
    <Button
      variant="ghost"
      onClick={logout}
      className="w-full justify-start gap-2"
    >
      <LogOut className="h-4 w-4" />
      {t("game.layout.signOut")}
    </Button>
  </div>
</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
          <span className="text-sm font-semibold">CashYOU</span>
        </header>
        <main className="flex-1 p-4 pb-24 lg:p-8 lg:pb-8">
          <Outlet />
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-sidebar/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur lg:hidden">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium',
                isActive ? 'bg-primary/15 text-primary' : 'text-sidebar-foreground/70',
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span className="max-w-full truncate">{label}</span>
          </NavLink>
        ))}
        <Button variant="ghost" onClick={logout} className="min-h-12 flex-col gap-1 px-1 text-[11px] text-sidebar-foreground/70">
          <LogOut className="h-5 w-5" />
          <span>Sign out</span>
        </Button>
      </nav>
    </div>
  )
}
