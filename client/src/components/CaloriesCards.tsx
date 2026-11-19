// Dashboard cards for food: today's calories and the last 7 days.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, UtensilsCrossed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBubble } from '@/components/IconBubble'
import { ProgressRing } from '@/components/ProgressRing'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { api } from '@/lib/api'
import { todayInTimezone, toLocalDate } from '@/lib/dates'
import { kcal, type MealDayResponse, type WeeklyStats } from '@/lib/meals'
import { cn } from '@/lib/utils'

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

function CardSkeleton() {
  return (
    <Card className="min-h-64" aria-busy="true">
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex items-center gap-5">
          <Skeleton className="size-[120px] rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function CaloriesTodayCard() {
  const [data, setData] = useState<MealDayResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<MealDayResponse>(`/meals/${todayInTimezone()}`)
      .then(setData)
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load today’s meals')))
  }, [])

  if (!data && !error) return <CardSkeleton />

  const eaten = data?.summary.totals.kcal ?? 0
  const target = data?.summary.calorieTarget ?? null
  const remaining = target !== null ? target - eaten : null

  return (
    <Card className="min-h-64">
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconBubble icon={UtensilsCrossed} />
          <CardTitle className="text-lg font-semibold">Calories today</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {error || !data ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : (
          <>
            <div className="flex items-center gap-5">
              <ProgressRing
                value={eaten}
                max={target ?? 0}
                size={120}
                stroke={11}
                className={remaining !== null && remaining < 0 ? 'stroke-muted-foreground/60' : undefined}
                label={target !== null ? `${eaten} of ${target} kcal eaten today` : `${eaten} kcal eaten today`}
              >
                <div>
                  <p className="font-heading text-2xl font-semibold tabular-nums">{kcal(eaten)}</p>
                  <p className="text-[11px] text-muted-foreground">kcal</p>
                </div>
              </ProgressRing>
              <div className="min-w-0 text-sm">
                {target === null ? (
                  <p className="text-muted-foreground">Complete your profile to see a daily target.</p>
                ) : (
                  <>
                    <p className="font-semibold">
                      {remaining! >= 0 ? `${kcal(remaining!)} kcal left` : `Over by ${kcal(-remaining!)} kcal`}
                    </p>
                    <p className="text-muted-foreground">Target {kcal(target)} kcal</p>
                  </>
                )}
                {eaten === 0 && <p className="mt-1 text-muted-foreground">Nothing logged yet today.</p>}
              </div>
            </div>
            <Button asChild variant="outline" className="mt-auto self-start">
              <Link to="/meals">
                {eaten === 0 ? 'Log a meal' : 'Open meals'} <ArrowRight aria-hidden />
              </Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const weekday = (date: string) => toLocalDate(date).toLocaleDateString(undefined, { weekday: 'short' })

/** Last 7 days as a list of thin bars, one per day, with a dashed line at the target. */
export function WeekCaloriesCard() {
  const [data, setData] = useState<WeeklyStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<WeeklyStats>('/meals/stats/weekly')
      .then(setData)
      .catch((err: unknown) => setError(errorMessage(err, 'Could not load this week')))
  }, [])

  if (!data && !error) return <CardSkeleton />

  return (
    <Card className="min-h-64">
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconBubble icon={BarChart3} />
          <CardTitle className="text-lg font-semibold">Last 7 days</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {error || !data ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : data.loggedDays === 0 ? (
          <EmptyState icon={BarChart3} title="No meals logged this week" className="py-2">
            Your daily calories will show up here.
          </EmptyState>
        ) : (
          <WeekBars data={data} />
        )}
      </CardContent>
    </Card>
  )
}

function WeekBars({ data }: { data: WeeklyStats }) {
  const target = data.calorieTarget
  const largest = Math.max(...data.days.map((d) => d.kcal ?? 0), 0)
  // Leave headroom so the target line sits inside the track even on big days
  const scale = Math.max(largest, (target ?? 0) * 1.25, 1)
  const pct = (n: number) => `${Math.min((n / scale) * 100, 100)}%`

  return (
    <>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/60 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Average</dt>
          <dd className="font-semibold tabular-nums">{data.average === null ? '—' : `${kcal(data.average)} kcal`}</dd>
        </div>
        <div className="rounded-xl bg-muted/60 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Days on target</dt>
          <dd className="font-semibold tabular-nums">
            {data.daysOnTarget === null ? '—' : `${data.daysOnTarget} of ${data.loggedDays}`}
          </dd>
        </div>
      </dl>

      <ul className="space-y-1.5" aria-label="Calories per day">
        {data.days.map((day) => (
          <li
            key={day.date}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-xs"
            title={day.kcal === null ? `${weekday(day.date)}: nothing logged` : `${weekday(day.date)}: ${kcal(day.kcal)} kcal`}
          >
            <span className="text-muted-foreground">{weekday(day.date)}</span>
            <span className="relative h-2.5 rounded-full bg-muted">
              {day.kcal !== null && day.kcal > 0 && (
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-700"
                  style={{ width: pct(day.kcal) }}
                />
              )}
              {target !== null && (
                <span
                  aria-hidden
                  className="absolute -inset-y-1 border-l-2 border-dashed border-foreground/35"
                  style={{ left: pct(target) }}
                />
              )}
            </span>
            <span className={cn('text-right tabular-nums', day.kcal === null ? 'text-muted-foreground' : 'font-medium')}>
              {day.kcal === null ? '—' : kcal(day.kcal)}
            </span>
          </li>
        ))}
      </ul>
      {target !== null && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-hidden className="h-3 border-l-2 border-dashed border-foreground/35" />
          Target {kcal(target)} kcal · on target means within 10%
        </p>
      )}
    </>
  )
}
