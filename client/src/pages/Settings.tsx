// Settings: app settings in sections. Desktop shows a section menu on the left and the chosen section
// beside it; phones show the list of sections, and each one opens on its own screen (/settings/:section).
import type { ReactNode } from 'react'
import { ChevronRight, Database, Palette, ShieldCheck, Wallet, Watch, type LucideIcon } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppleWatchSync } from '@/components/AppleWatchSync'
import { DataCleanup } from '@/components/DataCleanup'
import { IconBubble } from '@/components/IconBubble'
import { PageHeader } from '@/components/PageHeader'
import { AiSettings } from '@/components/ai/AiSettings'
import { ExpenseSettingsCard } from '@/components/expenses/ExpenseCards'
import { DataExport } from '@/components/settings/DataExport'
import { JourneyActions } from '@/components/settings/JourneyActions'
import { useAuth } from '@/context/useAuth'
import { useTheme } from '@/context/useTheme'
import { THEME_OPTIONS } from '@/lib/themeOptions'
import { cn } from '@/lib/utils'

type Section = { id: string; label: string; description: string; icon: LucideIcon }

const SECTIONS: Section[] = [
  { id: 'apple-watch', label: 'Apple Watch sync', description: 'Sleep from Apple Health', icon: Watch },
  { id: 'expenses', label: 'Expenses', description: 'Currency, budget, receipt storage', icon: Wallet },
  { id: 'privacy', label: 'Privacy & AI', description: 'What the AI may see', icon: ShieldCheck },
  { id: 'appearance', label: 'Appearance', description: 'Light, dark or system', icon: Palette },
  { id: 'data', label: 'Data', description: 'Journey, export, clean up', icon: Database },
]
const DEFAULT_SECTION = SECTIONS[0]!.id

function Appearance() {
  const { theme, setTheme } = useTheme()
  return (
    <Card className="max-w-3xl">
      <CardHeader className="flex items-center gap-3">
        <IconBubble icon={Palette} />
        <div>
          <CardTitle className="text-lg font-semibold">Appearance</CardTitle>
          <CardDescription>System follows your device's light or dark setting.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-all outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50',
                theme === value && 'border-primary bg-primary/5 ring-1 ring-primary',
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <Card className="max-w-3xl">
      <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
        <Watch className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p>{children}</p>
      </CardContent>
    </Card>
  )
}

function SectionContent({ id, isDemo }: { id: string; isDemo: boolean }) {
  switch (id) {
    case 'apple-watch':
      // The server refuses token changes in the demo, so they aren't offered
      return isDemo ? (
        <DemoNotice>
          Apple Watch sync is turned off in this demo. In your own copy of Daily Tracker, your sleep arrives automatically
          from an iOS Shortcut.
        </DemoNotice>
      ) : (
        <AppleWatchSync />
      )
    case 'expenses':
      return <ExpenseSettingsCard />
    case 'privacy':
      return <AiSettings />
    case 'appearance':
      return <Appearance />
    default:
      return (
        <div className="max-w-3xl space-y-4 md:space-y-6">
          {!isDemo && <JourneyActions />}
          <DataExport />
          {isDemo ? <DemoNotice>Deleting data is turned off in this demo.</DemoNotice> : <DataCleanup />}
        </div>
      )
  }
}

export function Settings() {
  const isDemo = useAuth().user?.isDemo === true
  const { section } = useParams()
  if (section && !SECTIONS.some((s) => s.id === section)) return <Navigate to="/settings" replace />
  const current = SECTIONS.find((s) => s.id === (section ?? DEFAULT_SECTION))!

  return (
    <>
      <div className={cn(section && 'hidden md:block')}>
        <PageHeader title="Settings" description="How the app works for you. Your details and goals are on your Profile." />
      </div>
      {/* Phones: a section's own screen, with a way back to the list */}
      {section && (
        <div className="md:hidden">
          <PageHeader title={current.label} back={{ to: '/settings', label: 'Settings' }} />
        </div>
      )}

      <div className="md:grid md:grid-cols-[13rem_1fr] md:items-start md:gap-8">
        <nav aria-label="Settings sections" className={cn('md:sticky md:top-10', section && 'hidden md:block')}>
          <ul className="surface divide-y overflow-hidden md:divide-y-0 md:bg-transparent md:p-0 md:shadow-none md:ring-0">
            {SECTIONS.map((s) => {
              // On desktop the default section is "current" even at /settings
              const active = s.id === current.id
              return (
                <li key={s.id}>
                  <Link
                    to={`/settings/${s.id}`}
                    aria-current={section === s.id || (!section && active) ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3.5 outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 md:rounded-xl md:px-3 md:py-2',
                      active && 'md:bg-accent md:font-medium md:text-accent-foreground',
                    )}
                  >
                    <s.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block">{s.label}</span>
                      <span className="block text-xs text-muted-foreground md:hidden">{s.description}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground md:hidden" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <section aria-label={current.label} className={cn('min-w-0', !section && 'hidden md:block')}>
          <SectionContent id={current.id} isDemo={isDemo} />
        </section>
      </div>
    </>
  )
}
