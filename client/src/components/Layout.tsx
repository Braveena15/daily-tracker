import {
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  LogOut,
  Sparkles,
  SquarePen,
  UserRound,
  UtensilsCrossed,
} from 'lucide-react'
import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/StatusViews'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAuth } from '@/context/useAuth'
import { useLogout } from '@/hooks/useLogout'
import { MIND_PAGES } from '@/lib/mind'
import { cn } from '@/lib/utils'

type NavItem = {
  to: string
  label: string
  icon: typeof SquarePen
  end?: boolean
  /** Other paths that highlight this item */
  alsoActiveOn?: string[]
  /** Paths that highlight this item only in the phone tab bar (where the page has no tab of its own) */
  alsoActiveOnMobile?: string[]
  /** Desktop sidebar only; on phones it's reached another way */
  sidebarOnly?: boolean
  /** Phone tab bar only */
  mobileOnly?: boolean
}

const MIND_PATHS = ['/mind', ...MIND_PAGES.map((p) => p.to)]

const NAV: NavItem[] = [
  { to: '/today', label: 'Today', icon: SquarePen },
  // My Foods lives inside Meals, so the Meals tab stays highlighted there
  { to: '/meals', label: 'Meals', icon: UtensilsCrossed, alsoActiveOn: ['/foods'] },
  // Phones get one "Mind" tab; the sidebar lists the Mind pages in their own section
  { to: '/mind', label: 'Mind', icon: Sparkles, alsoActiveOn: MIND_PATHS, mobileOnly: true },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, alsoActiveOnMobile: ['/review'] },
  { to: '/review', label: 'Weekly review', icon: CalendarRange, sidebarOnly: true },
  { to: '/history', label: 'History', icon: CalendarDays },
  // On phones, Profile is in the account menu (top right of each page)
  { to: '/profile', label: 'Profile', icon: UserRound, sidebarOnly: true },
]

/** NavLink's own match, plus any extra paths that belong to the same tab. */
function useIsActive(mobile: boolean) {
  const { pathname } = useLocation()
  return (item: NavItem, isActive: boolean) =>
    isActive ||
    [...(item.alsoActiveOn ?? []), ...(mobile ? (item.alsoActiveOnMobile ?? []) : [])].some((p) => pathname.startsWith(p))
}

// Page frame for logged-in pages: a sidebar on desktop, a bottom tab bar on phones.
export function Layout() {
  return (
    <div className="min-h-dvh md:pl-64">
      <Sidebar />
      {/* pb: room for the bottom tab bar, plus the iPhone home bar below it */}
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 md:px-10 md:pt-10 md:pb-12">
        {/* While a page's code loads the first time; the navigation stays in place */}
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <BottomTabs />
    </div>
  )
}

function SidebarLink({ item, isOn }: { item: NavItem; isOn: (item: NavItem, matched: boolean) => boolean }) {
  const { to, label, icon: Icon, end } = item
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]',
          isOn(item, isActive)
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-5 transition-colors', isOn(item, isActive) && 'text-primary')} aria-hidden />
          {label}
        </>
      )}
    </NavLink>
  )
}

function Sidebar() {
  const isOn = useIsActive(false)
  const { user } = useAuth()
  const { loggingOut, logout } = useLogout()

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex">
      <p className="px-3 font-heading text-xl font-semibold tracking-tight">🌱 Daily Tracker</p>

      <nav aria-label="Main" className="mt-6 flex flex-col gap-0.5">
        {NAV.filter((item) => !item.mobileOnly).map((item) => (
          <SidebarLink key={item.to} item={item} isOn={isOn} />
        ))}

        <p className="mt-5 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Mind</p>
        {MIND_PAGES.map((page) => (
          <SidebarLink key={page.to} item={page} isOn={isOn} />
        ))}
      </nav>

      <div className="mt-auto space-y-4 pt-6">
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
  const isOn = useIsActive(true)
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {NAV.filter((item) => !item.sidebarOnly).map((item) => {
          const { to, label, icon: Icon, end } = item
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group flex flex-col items-center gap-1 pt-2 pb-2.5 text-xs font-medium transition-colors outline-none focus-visible:bg-muted',
                  isOn(item, isActive) ? 'text-foreground' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'grid h-8 w-12 place-items-center rounded-full transition-all group-active:scale-90',
                      isOn(item, isActive) && 'bg-secondary text-primary',
                    )}
                    aria-hidden
                  >
                    <Icon className="size-5" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
