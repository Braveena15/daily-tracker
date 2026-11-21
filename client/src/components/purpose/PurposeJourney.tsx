// The Purpose page's look back: stats, a timeline of daily purposes and how the purpose statement evolved.
import { Link } from 'react-router-dom'
import { ArrowRight, History as HistoryIcon, Target } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { PurposeDayView } from '@/components/purpose/PurposeDayView'
import { useFetch } from '@/hooks/useFetch'
import { addDays, formatDate, relativeDay, todayInTimezone } from '@/lib/dates'
import { intentionsDone, type PurposeDaysResponse, type PurposeHistoryResponse, type PurposeStats } from '@/lib/purpose'

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
          <EmptyState icon={Target} tone="mental" title="No daily purposes yet" className="py-6">
            Set today's purpose at the top of the Today page and it will appear here.
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
        <CardDescription>Earlier versions of your purpose statement, kept each time you change it.</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : !data ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : data.history.length === 0 ? (
          <EmptyState icon={HistoryIcon} title="Just one version so far" className="py-6">
            When you change your purpose statement, the earlier one is saved here.
          </EmptyState>
        ) : (
          <ol className="space-y-3">
            {data.history.map((h) => (
              <li key={h.savedAt} className="border-l-2 border-mental/40 pl-3">
                <p className="text-xs text-muted-foreground">Until {formatDate(h.savedAt.slice(0, 10))}</p>
                <p className="font-serif text-base leading-snug">{h.statement}</p>
                {h.coreValues.length > 0 && <p className="mt-0.5 text-xs text-muted-foreground">{h.coreValues.join(' · ')}</p>}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
