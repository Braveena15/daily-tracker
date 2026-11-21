// The Purpose page's look back: stats, a timeline of daily purposes and how the purpose statement evolved.
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, History as HistoryIcon, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { PurposeDayView } from '@/components/purpose/PurposeDayView'
import { useFetch } from '@/hooks/useFetch'
import { addDays, formatDate, relativeDay, todayInTimezone } from '@/lib/dates'
import {
  intentionsDone,
  savedAtLabel,
  type PurposeDaysResponse,
  type PurposeHistoryResponse,
  type PurposeStats,
  type PurposeVersion,
} from '@/lib/purpose'
import { cn } from '@/lib/utils'


// The server starts the list at the journey start
const DAYS = 365

export function PurposeStatsRow({ stats }: { stats: PurposeStats }) {
  const items = [
    { label: 'Days with a purpose', value: String(stats.daysWithPurpose) },
    { label: 'Intentions done', value: stats.intentionsDonePercent === null ? '—' : `${stats.intentionsDonePercent}%` },
    { label: 'Evening rating', value: stats.avgRating === null ? '—' : `${stats.avgRating} / 5` },
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

export function DailyPurposes() {
  const navigate = useNavigate()
  const today = todayInTimezone()
  const { data, error } = useFetch<PurposeDaysResponse>(`/purpose/days?from=${addDays(today, -(DAYS - 1))}&to=${today}`)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Daily purposes</CardTitle>
        <CardDescription>What each day was about, and how it went. Tap a day to open it.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : !data ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : data.days.length === 0 ? (
          <EmptyState
            icon={Target}
            tone="mental"
            title="No daily purposes yet"
            className="py-6"
            action={
              // #purpose: the Today page scrolls to its purpose card
              <Button onClick={() => navigate('/today#purpose')}>
                <Target aria-hidden /> Set today's purpose
              </Button>
            }
          >
            Set a purpose for today at the top of the Today page
          </EmptyState>
        ) : (
          <>
            <PurposeStatsRow stats={data.stats} />
            <ol className="space-y-3">
              {data.days.map((day) => (
                <li key={day.date}>
                  <Link
                    to={`/history/${day.date}`}
                    className="block space-y-2 rounded-2xl bg-muted/50 p-4 transition-all outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-heading font-semibold">
                        {relativeDay(day.date, today)}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{formatDate(day.date, today)}</span>
                      </p>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {intentionsDone(day) && `🎯 ${intentionsDone(day)}`}
                        <ArrowRight className="size-3.5" aria-hidden />
                      </span>
                    </div>
                    <PurposeDayView purpose={day} />
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
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
