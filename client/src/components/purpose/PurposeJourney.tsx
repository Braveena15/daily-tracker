// The Purpose page's look back: stats, what keeps coming back ("Recurring purposes"), what mattered
// each day (with intensity), and how the purpose statement evolved.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, History as HistoryIcon, Pencil, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { PurposeDayView } from '@/components/purpose/PurposeDayView'
import { useFetch } from '@/hooks/useFetch'
import { addDays, formatDate, relativeDay, todayInTimezone } from '@/lib/dates'
import {
  daySummary,
  savedAtLabel,
  shortDaySummary,
  type PurposeDaysResponse,
  type PurposeHistoryResponse,
  type PurposeStats,
  type PurposeVersion,
  type RecurringPurpose,
} from '@/lib/purpose'
import { cn } from '@/lib/utils'


// The server starts the list at the journey start
const DAYS = 365

export function PurposeStatsRow({ stats }: { stats: PurposeStats }) {
  const perDay = stats.daysWithPurpose ? Math.round((stats.purposesTotal / stats.daysWithPurpose) * 10) / 10 : null
  const items = [
    { label: 'Days noted', value: String(stats.daysWithPurpose) },
    { label: 'Things a day', value: perDay === null ? '—' : String(perDay) },
    // Across every item with an intensity
    { label: 'Avg intensity', value: stats.avgIntensity === null ? '—' : `${stats.avgIntensity}/10` },
  ]
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 text-center">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl border px-2 py-2">
            <dt className="text-xs text-muted-foreground">{i.label}</dt>
            <dd className="font-heading text-lg font-semibold tabular-nums">{i.value}</dd>
          </div>
        ))}
      </dl>
      {stats.topValues.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          Most chosen:
          {stats.topValues.map((v) => (
            <Badge key={v.value} variant="secondary" className="bg-mental-soft text-mental-foreground">
              {v.value} · {v.days}
            </Badge>
          ))}
        </p>
      )}
    </div>
  )
}

/**
 * `onSetToday`: what "Add what matters today" does (default: go to the Today page's purpose card).
 * `todayCardAbove`: the page already shows today's purpose card right above (the Purpose page), so
 * this list doesn't repeat the "set today's purpose" prompts: with no daily purposes it isn't shown.
 */
export function DailyPurposes({ onSetToday, todayCardAbove = false }: { onSetToday?: () => void; todayCardAbove?: boolean } = {}) {
  const navigate = useNavigate()
  const today = todayInTimezone()
  // The server decides what "today" is (Asia/Colombo) and always includes it
  const { data, error } = useFetch<PurposeDaysResponse>(`/purpose/days?from=${addDays(today, -(DAYS - 1))}`)
  const setToday = () => (onSetToday ? onSetToday() : navigate('/today#purpose'))
  const setTodayButton = (
    <Button onClick={setToday}>
      <Target aria-hidden /> Add what matters today
    </Button>
  )

  if (todayCardAbove && data?.isEmpty) return null

  return (
    <>
      {data && data.recurring.some((r) => r.count > 1) && <RecurringPurposes items={data.recurring} />}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">What mattered, day by day</CardTitle>
          <CardDescription>What each day was about, and how strongly. Tap a day to open it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <ErrorNotice>{error}</ErrorNotice>
          ) : !data ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : data.isEmpty ? (
            // Only when there are no daily purposes at all
            <EmptyState icon={Target} tone="mental" title="No daily purposes yet" className="py-6" action={setTodayButton}>
              {onSetToday ? 'Set a purpose for today above, or at the top of the Today page' : 'Set a purpose for today at the top of the Today page'}
            </EmptyState>
          ) : (
            <>
              <PurposeStatsRow stats={data.stats} />
              <ol className="space-y-3">
                {data.today ? (
                  // Today first: editable until midnight
                  <li className="space-y-2 rounded-2xl bg-mental-soft/50 p-4 ring-1 ring-mental/20">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-heading font-semibold">Today</span>
                        </p>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/today#purpose">
                          <Pencil aria-hidden /> Edit
                        </Link>
                      </Button>
                    </div>
                    {data.today.purposes.length > 0 && <p className="text-xs text-muted-foreground">{daySummary(data.today)}</p>}
                    <PurposeDayView day={data.today} />
                  </li>
                ) : (
                  // Past days exist but today has no purpose yet (unless the card above already offers it)
                  !todayCardAbove && (
                    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-4">
                      <p className="text-sm text-muted-foreground">No purpose set for today yet.</p>
                      {setTodayButton}
                    </li>
                  )
                )}
                {data.past.map((day) => (
                  <li key={day.date}>
                    <Link
                      to={`/history/${day.date}`}
                      className="block space-y-2 rounded-2xl bg-muted/50 p-4 transition-all outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-heading font-semibold">
                          {relativeDay(day.date, data.todayDate)}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">{formatDate(day.date, data.todayDate)}</span>
                        </p>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          {day.purposes.length > 0 && shortDaySummary(day)}
                          <ArrowRight className="size-4" aria-hidden />
                        </span>
                      </div>
                      <PurposeDayView day={day} />
                      </Link>
                  </li>
                ))}
              </ol>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}

export function PurposeEvolution() {
  const { data, error } = useFetch<PurposeHistoryResponse>('/purpose/history')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">How my purpose evolved</CardTitle>
        <CardDescription>Your purpose now, and the versions it replaced.</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : !data ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : !data.current && data.history.length === 0 ? (
          <EmptyState icon={HistoryIcon} title="Nothing saved yet" className="py-6">
            Each time you save your purpose, the version it replaces is kept here.
          </EmptyState>
        ) : (
          <ol className="space-y-4">
            {data.current && <VersionItem version={data.current} label={`Current · saved ${savedAtLabel(data.current.savedAt)}`} current />}
            {data.history.map((h) => (
              <VersionItem key={h.savedAt} version={h} label={`Saved ${savedAtLabel(h.savedAt)}`} />
            ))}
            {data.history.length === 0 && (
              <li className="text-sm text-muted-foreground">When you change your purpose, this version moves down here.</li>
            )}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

/** One version: date, statement, values and goals. The current one stands out. */
function VersionItem({ version, label, current = false }: { version: PurposeVersion; label: string; current?: boolean }) {
  return (
    <li className={cn('space-y-1.5 border-l-2 pl-3', current ? 'border-primary' : 'border-mental/40')}>
      <p className={cn('text-xs', current ? 'font-semibold text-primary' : 'text-muted-foreground')}>{label}</p>
      {version.statement && <p className={cn('font-serif leading-snug', current ? 'text-lg' : 'text-base')}>{version.statement}</p>}
      {version.coreValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {version.coreValues.map((v) => (
            <Badge key={v} variant="secondary" className="bg-mental-soft text-mental-foreground">
              {v}
            </Badge>
          ))}
        </div>
      )}
      {version.goals.length > 0 && (
        <ul className="space-y-0.5 text-sm">
          {version.goals.map((g, i) => (
            <li key={`${g.title}-${i}`}>
              <span className="font-medium">{g.title}</span>
              {g.why && <span className="text-muted-foreground"> · {g.why}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// ---------- Recurring purposes ----------

/** The last 30 days as tiny bars: each day's intensity (0–10), a dot on days it didn't come up. */
function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const W = 4
  const GAP = 1
  const H = 24
  return (
    <svg width={values.length * (W + GAP) - GAP} height={H} viewBox={`0 0 ${values.length * (W + GAP) - GAP} ${H}`} role="img" aria-label={label} className="shrink-0">
      {values.map((v, i) =>
        v === null ? (
          <rect key={i} x={i * (W + GAP)} y={H - 2} width={W} height={2} rx={1} className="fill-muted-foreground/25" />
        ) : (
          <rect key={i} x={i * (W + GAP)} y={H - Math.max(3, (v / 10) * H)} width={W} height={Math.max(3, (v / 10) * H)} rx={1} className="fill-mental" />
        ),
      )}
    </svg>
  )
}

/** What keeps coming back: grouped by wording (ignoring case and spaces), most frequent first. */
export function RecurringPurposes({ items }: { items: RecurringPurpose[] }) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? items : items.slice(0, 5)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Recurring purposes</CardTitle>
        <CardDescription>What keeps mattering to you, how often, and how strongly. Bars show the last 30 days.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {shown.map((r) => {
            const daysIn30 = r.last30.filter((v) => v !== null).length
            return (
              <li key={r.text} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-muted/50 px-3 py-2.5">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-serif text-base leading-snug break-words">{r.text}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {r.count} {r.count === 1 ? 'day' : 'days'}
                    {r.avgIntensity !== null && ` · avg intensity ${r.avgIntensity}/10`}
                  </p>
                </div>
                <Sparkline values={r.last30} label={`Last 30 days: on ${daysIn30} ${daysIn30 === 1 ? 'day' : 'days'}`} />
              </li>
            )
          })}
        </ol>
        {items.length > 5 && (
          <Button type="button" variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Show fewer' : `Show all ${items.length}`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
