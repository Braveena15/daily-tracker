import {
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings as SettingsIcon,
  Sparkles,
  SquarePen,
  UserRound,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { Suspense, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { PageSkeleton } from '@/components/StatusViews'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SupportButton } from '@/components/mind/Support'
import { useAuth } from '@/context/useAuth'
import { useLogout } from '@/hooks/useLogout'
import { MIND_PAGES } from '@/lib/mind'
import { cn } from '@/lib/utils'
import { SproutMark } from '@/components/SproutMark'
import { DemoBanner, DemoFooter, ReadOnlyBanner } from '@/components/demo/DemoBanner'
import { useDemoConfig } from '@/hooks/useDemoConfig'

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
  // Phones keep 5 tabs: Expenses is reached from the Today card and the Dashboard
  { to: '/expenses', label: 'Expenses', icon: Wallet, sidebarOnly: true },
  // Phones get one "Mind" tab; the sidebar lists the Mind pages in their own section
  { to: '/mind', label: 'Mind', icon: Sparkles, alsoActiveOn: MIND_PATHS, mobileOnly: true },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, alsoActiveOnMobile: ['/review'] },
  { to: '/review', label: 'Weekly review', icon: CalendarRange, sidebarOnly: true },
  { to: '/history', label: 'History', icon: CalendarDays },
  // On phones, Profile is in the account menu (top right of each page)
  { to: '/profile', label: 'Profile', icon: UserRound, sidebarOnly: true },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, sidebarOnly: true },
]

/**
 * Whether a nav item is the current page: its own path (exactly, for `end`), or one of the extra
 * paths that belong to the same tab. Plain Links + this, rather than NavLink, so screen readers
 * also hear "current page" for those extra paths (NavLink only marks its own path).
 */
function useIsActive(mobile: boolean) {
  const { pathname } = useLocation()
  const under = (path: string) => pathname === path || pathname.startsWith(path.endsWith('/') ? path : `${path}/`)
  return (item: NavItem) =>
    (item.end ? pathname === item.to : under(item.to)) ||
    [...(item.alsoActiveOn ?? []), ...(mobile ? (item.alsoActiveOnMobile ?? []) : [])].some(under)
}

// The desktop sidebar's groups. Phones keep the bottom tab bar (NAV above).
const byPath = (to: string) => NAV.find((item) => item.to === to)!
const SIDEBAR_GROUPS: { label: string | null; items: NavItem[] }[] = [
  { label: null, items: [byPath('/today')] },
  { label: 'Track', items: [byPath('/meals'), byPath('/expenses'), byPath('/history'), byPath('/review'), byPath('/')] },
  { label: 'Mind', items: MIND_PAGES },
]

// "Icons only" is remembered on this device (a layout preference, not data)
const COLLAPSED_KEY = 'sidebar.collapsed'
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'yes'
  } catch {
    return false
  }
}

// Page frame for logged-in pages: a sidebar on desktop, a bottom tab bar on phones.
export function Layout() {
  const section = useLocation().pathname.split('/')[1]
  const [collapsed, setCollapsed] = useState(readCollapsed)
  // Demo accounts only ask for the demo settings: in the public demo (DEMO_MODE) they're temporary
  // sandboxes; on a normal deployment they're read-only
  const isDemo = useAuth().user?.isDemo === true
  const demo = useDemoConfig(isDemo)

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? 'no' : 'yes')
      } catch {
        // Private browsing: it just isn't remembered
      }
      return !c
    })
  }

  return (
    <div className={cn('min-h-dvh transition-[padding] duration-200', collapsed ? 'md:pl-20' : 'md:pl-64')}>
      <TooltipProvider>
        <Sidebar collapsed={collapsed} onToggle={toggle} />
      </TooltipProvider>
      {/* pb: room for the bottom tab bar, plus the iPhone home bar below it */}
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 md:px-10 md:pt-10 md:pb-12">
        {isDemo && demo?.enabled && <DemoBanner repoUrl={demo.repoUrl} className="mb-6" />}
        {isDemo && demo && !demo.enabled && <ReadOnlyBanner className="mb-6" />}
        {/* While a page's code loads the first time; the navigation stays in place */}
        <Suspense fallback={<PageSkeleton />}>
          {/* A short fade when moving between sections (opacity only, so nothing shifts). Keyed by the
              first path segment, so /thoughts/new → /thoughts/:id after the first save doesn't remount. */}
          <div key={section} className="animate-in duration-200 fade-in-0">
            <Outlet />
          </div>
        </Suspense>
        {isDemo && demo?.enabled && <DemoFooter repoUrl={demo.repoUrl} className="mt-10" />}
      </main>
      <BottomTabs />
    </div>
  )
}

/** When the sidebar is icons-only, its controls show their name in a tooltip (hover or keyboard focus). */
function WithTip({ show, label, children }: { show: boolean; label: string; children: ReactNode }) {
  if (!show) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function SidebarLink({ item, isOn, collapsed }: { item: NavItem; isOn: (item: NavItem) => boolean; collapsed: boolean }) {
  const { to, label, icon: Icon } = item
  const on = isOn(item)
  return (
    <WithTip show={collapsed} label={label}>
      <Link
        to={to}
        aria-current={on ? 'page' : undefined}
        aria-label={collapsed ? label : undefined}
        className={cn(
          'flex min-h-10 items-center gap-3 rounded-xl py-2 text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]',
          collapsed ? 'justify-center px-0' : 'px-3',
          on ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
        )}
      >
        <Icon className={cn('size-5 shrink-0 transition-colors', on && 'text-primary')} aria-hidden />
        {!collapsed && label}
      </Link>
    </WithTip>
  )
}

function GroupLabel({ children, collapsed }: { children: ReactNode; collapsed: boolean }) {
  // Icons-only: a thin divider instead of the heading (still named for screen readers)
  return collapsed ? (
    <div className="mx-3 mt-4 mb-2 border-t border-sidebar-border" role="presentation">
      <span className="sr-only">{children}</span>
    </div>
  ) : (
    <p className="mt-5 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</p>
  )
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const isOn = useIsActive(false)
  const { user } = useAuth()
  const { loggingOut, logout } = useLogout()
  const profile = byPath('/profile')
  const settings = byPath('/settings')

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 hidden flex-col overflow-x-hidden overflow-y-auto border-r border-sidebar-border bg-sidebar py-6 transition-[width] duration-200 md:flex',
        collapsed ? 'w-20 px-3' : 'w-64 px-4',
      )}
    >
      <div className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between pl-3')}>
        <p className="flex min-w-0 items-center gap-2 font-heading text-xl font-semibold tracking-tight">
          <SproutMark className="size-7" />
          <span className={cn(collapsed && 'sr-only')}>Daily Tracker</span>
        </p>
        <WithTip show label={collapsed ? 'Expand sidebar' : 'Collapse to icons'}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar to icons'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </WithTip>
      </div>

      <nav aria-label="Main" className="mt-6 flex flex-col gap-0.5">
        {SIDEBAR_GROUPS.map((group) => (
          <div key={group.label ?? 'top'} role={group.label ? 'group' : undefined} aria-label={group.label ?? undefined} className="flex flex-col gap-0.5">
            {group.label && <GroupLabel collapsed={collapsed}>{group.label}</GroupLabel>}
            {group.items.map((item) => (
              <SidebarLink key={item.to} item={item} isOn={isOn} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5 pt-6">
        {/* Always in reach, above the account controls */}
        {collapsed ? (
          <SupportButton compact tooltip="Need support now" className="mx-auto" />
        ) : (
          <SupportButton className="w-full justify-start" />
        )}

        <div role="group" aria-label="Account" className="flex flex-col gap-0.5">
          <GroupLabel collapsed={collapsed}>Account</GroupLabel>
          {!collapsed && (
            <div className="mb-2 px-3">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
          )}
          <SidebarLink item={profile} isOn={isOn} collapsed={collapsed} />
          <SidebarLink item={settings} isOn={isOn} collapsed={collapsed} />
          <div className={cn('flex items-center gap-2 py-1', collapsed ? 'justify-center' : 'justify-between px-3')}>
            {!collapsed && <span className="text-sm font-medium text-muted-foreground">Theme</span>}
            <ThemeToggle className={cn(collapsed && 'flex-col')} />
          </div>
          <WithTip show={collapsed} label="Log out">
            <Button
              variant="ghost"
              className={cn('w-full gap-3 text-muted-foreground', collapsed ? 'justify-center px-0' : 'justify-start px-3')}
              onClick={() => void logout()}
              disabled={loggingOut}
              aria-label={collapsed ? 'Log out' : undefined}
            >
              <LogOut className="size-5" aria-hidden />
              {!collapsed && (loggingOut ? 'Logging out…' : 'Log out')}
            </Button>
          </WithTip>
        </div>
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
          const { to, label, icon: Icon } = item
          const on = isOn(item)
          return (
            <Link
              key={to}
              to={to}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'group flex min-h-14 flex-col items-center justify-center gap-1 pt-2 pb-2 text-xs transition-colors outline-none focus-visible:bg-muted',
                on ? 'font-semibold text-primary' : 'font-medium text-muted-foreground',
              )}
            >
              <span
                className={cn('grid h-8 w-14 place-items-center rounded-full transition-all group-active:scale-90', on && 'bg-secondary')}
                aria-hidden
              >
                <Icon className="size-5" />
              </span>
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
