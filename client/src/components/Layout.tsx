import { CalendarDays, LayoutDashboard, LogOut, SquarePen, UserRound } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAuth } from '@/context/useAuth'
import { useLogout } from '@/hooks/useLogout'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/today', label: 'Today', icon: SquarePen },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/history', label: 'History', icon: CalendarDays },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

// Page frame for logged-in pages: a sidebar on desktop, a bottom tab bar on phones.
export function Layout() {
  return (
    <div className="min-h-dvh md:pl-64">
      <Sidebar />
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:px-6 md:px-10 md:pt-10 md:pb-12">
        <Outlet />
      </main>
      <BottomTabs />
    </div>
  )
}

function Sidebar() {
  const { user } = useAuth()
  const { loggingOut, logout } = useLogout()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex">
      <p className="px-3 font-heading text-xl font-semibold tracking-tight">🌱 Daily Tracker</p>

      <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('size-5 transition-colors', isActive && 'text-primary')} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-4">
        <div className="px-3">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <div className="flex items-center justify-between gap-2 px-3">
          <span className="text-xs font-medium text-muted-foreground">Theme</span>
          <ThemeToggle />
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 text-muted-foreground"
          onClick={() => void logout()}
          disabled={loggingOut}
        >
          <LogOut className="size-5" aria-hidden />
          {loggingOut ? 'Logging out…' : 'Log out'}
        </Button>
      </div>
    </aside>
  )
}

function BottomTabs() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'group flex flex-col items-center gap-1 pt-2 pb-2.5 text-[11px] font-medium transition-colors outline-none focus-visible:bg-muted',
                isActive ? 'text-foreground' : 'text-muted-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'grid h-8 w-14 place-items-center rounded-full transition-all group-active:scale-90',
                    isActive && 'bg-secondary text-primary',
                  )}
                  aria-hidden
                >
                  <Icon className="size-5" />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
