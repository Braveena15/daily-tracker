import { Suspense, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarCheck, ChevronLeft, ChevronRight, Flag, Repeat, Sparkles, Target, Trophy, LineChart as LineChartIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WeeklyGoalsCard, type GoalSuggestion } from '@/components/progress/WeeklyGoals'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AiMessageCard } from '@/components/ai/AiMessageCard'
import { IconBubble } from '@/components/IconBubble'
import { WeekDayList, WeekMoodChart } from '@/components/progress/WeekDays'
import { PurposeDayView } from '@/components/purpose/PurposeDayView'
import { PurposeStatsRow } from '@/components/purpose/PurposeJourney'
import { shortDaySummary } from '@/lib/purpose'
import { aiRequests } from '@/lib/ai'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { useFetch } from '@/hooks/useFetch'
import { addDays, formatDate, isValidDateString, relativeDay, todayInTimezone, toLocalDate } from '@/lib/dates'
import { journeyDate } from '@/lib/journey'
import type { WeeklyReviewResponse } from '@/lib/progress'
import { lazyPage } from '@/lib/lazyPage'
import { CardChevron } from '@/components/CardChevron'
import { ProgramWeekCard } from '@/components/journey/ProgramWeekCard'
import { Delta, YourWeek } from '@/components/progress/YourWeek'

// Recharts loads only when the charts are shown
const DailyScoresChart = lazyPage(() => import('@/components/progress/WeekScoreCharts').then((m) => m.DailyScoresChart))
const WeekCompareChart = lazyPage(() => import('@/components/progress/WeekScoreCharts').then((m) => m.WeekCompareChart))

/** "13–19 Nov" or "28 Oct – 3 Nov". */
function weekLabel(from: string, to: string): string {
  const a = toLocalDate(from)
  const b = toLocalDate(to)
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' })
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${month(b)}`
    : `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)}`
}

export function Review() {
  const [params, setParams] = useSearchParams()
  const today = todayInTimezone()
  const requested = params.get('week')
  const weekEnding = isValidDateString(requested) && requested <= today ? requested : today
  const { data, error } = useFetch<WeeklyReviewResponse>(`/progress/weekly-review?weekEnding=${weekEnding}`)

  function goTo(next: string) {
    setParams(next >= today ? {} : { week: next })
  }

  // "Add as next week's goal" on the reflection hands its focus line to the goals card
  const [goalSuggestion, setGoalSuggestion] = useState<GoalSuggestion | null>(null)
  // Same rule as the server: next week's goal only from weeks in the journey whose next week isn't over
  const canSetNextGoal = addDays(weekEnding, 7) >= today && (data === null || weekEnding >= data.journeyStartDate)

  return (
    <>
      <PageHeader title="Weekly review" description="This week compared with the week before." />

      <div className="space-y-4 md:space-y-6">
        <Card size="sm" className="flex-row items-center justify-between gap-2 px-(--card-spacing)">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous week"
            // Weeks before the journey start have nothing to show
            disabled={data !== null && addDays(weekEnding, -6) <= data.journeyStartDate}
            onClick={() => goTo(addDays(weekEnding, -7))}
          >
            <ChevronLeft />
          </Button>
          <div className="text-center">
            <p className="font-heading text-lg font-semibold">{weekLabel(addDays(weekEnding, -6), weekEnding)}</p>
            <p className="text-xs text-muted-foreground">{weekEnding === today ? 'The last 7 days' : `Week ending ${formatDate(weekEnding)}`}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next week"
            disabled={weekEnding >= today}
            onClick={() => goTo(addDays(weekEnding, 7))}
          >
            <ChevronRight />
          </Button>
        </Card>

        <AiMessageCard
          key={weekEnding}
          title="AI reflection"
          request={aiRequests.weekly(weekEnding)}
          // This week's reflection appears straight away; past weeks wait for a tap, to save AI calls
          autoLoad={weekEnding === today}
          startLabel="Reflect on this week"
          footer={(message) =>
            message.focus && canSetNextGoal ? (
              <Button variant="outline" size="sm" className="bg-card" onClick={() => setGoalSuggestion({ text: message.focus!, id: Date.now() })}>
                <Flag aria-hidden /> Add as next week's goal
              </Button>
            ) : null
          }
        />

        <WeeklyGoalsCard key={`goals-${weekEnding}`} weekEnding={weekEnding} suggestion={goalSuggestion} />

        {error ? <ErrorNotice>{error}</ErrorNotice> : !data ? <ReviewSkeleton /> : <ReviewBody data={data} today={today} />}
      </div>
    </>
  )
}

function ReviewBody({ data, today }: { data: WeeklyReviewResponse; today: string }) {
  const { thisWeek: w, lastWeek: p, differences: d } = data
  // Last week counts as "has data" only if something was logged (and it wasn't before the journey)
  const hasLastWeek = p.daysTracked > 0 && p.daysLogged > 0

  if (w.daysTracked === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarCheck} title="Before your journey">
          Your journey started on {journeyDate(data.journeyStartDate)}. Weeks before that are hidden.
        </EmptyState>
      </Card>
    )
  }

  return (
    <>
      {data.program && <ProgramWeekCard program={data.program} />}
      <Card className="bg-secondary/60 ring-primary/15">
        <CardContent className="flex items-start gap-3">
          <IconBubble icon={Sparkles} className="bg-card" />
          <div className="min-w-0 space-y-2">
            <p className="font-heading text-lg leading-snug font-semibold text-secondary-foreground">{data.message}</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-0.5 font-medium text-foreground">
                <CalendarCheck className="size-4 text-primary" aria-hidden />
                {w.daysLogged} of {w.daysTracked} {w.daysTracked === 1 ? 'day' : 'days'} logged
              </span>
              {hasLastWeek && <Delta diff={d.daysLogged} unit={Math.abs(d.daysLogged ?? 0) === 1 ? ' day' : ' days'} />}
              {w.daysTracked < 7 && <span>Your journey started {journeyDate(data.journeyStartDate)}</span>}
              {w.mealDays > 0 && <span>Meals on {w.mealDays}</span>}
            </p>
            {w.daysLogged < 3 && (
              <p className="text-sm text-muted-foreground">
                A few more check-ins — a mood, a workout or something you learned — will make this review more useful.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {w.bestDay && (
        <Link
          to={`/history/${w.bestDay.date}`}
          className="group flex items-center gap-3 surface p-4 transition-all outline-none hover:bg-accent/40 hover:ring-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <IconBubble icon={Trophy} tone="learning" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">{w.daysLogged === 1 ? 'Only logged day' : 'Best day'}</p>
            <p className="font-medium">
              {relativeDay(w.bestDay.date, today)} · overall score {w.bestDay.overall}
            </p>
          </div>
          <CardChevron />
        </Link>
      )}

      <YourWeek data={data} today={today} />

      <ScoreCharts data={data} hasLastWeek={hasLastWeek} />

      <section aria-labelledby="purpose-heading" className="space-y-3">
        <h2 id="purpose-heading" className="text-xl font-semibold">
          What mattered this week
        </h2>
        <Card>
          <CardContent className="space-y-4">
            {data.purpose.days.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing noted this week.{' '}
                <Link to="/today#purpose" className="font-medium text-primary underline-offset-4 hover:underline">
                  Add what matters today
                </Link>
              </p>
            ) : (
              <>
                <PurposeStatsRow stats={data.purpose.stats} />
                {data.purpose.mostFrequent && (
                  // The thing that came up most often this week
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-mental-soft/60 px-4 py-3 ring-1 ring-mental/20">
                    <Repeat className="size-4 shrink-0 text-mental" aria-hidden />
                    <p className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-mental-foreground">Most frequent this week</span>
                      <span className="font-serif text-lg leading-snug break-words">{data.purpose.mostFrequent.text}</span>
                    </p>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {data.purpose.mostFrequent.count} days
                      {data.purpose.mostFrequent.avgIntensity !== null && ` · avg ${data.purpose.mostFrequent.avgIntensity}/10`}
                    </span>
                  </div>
                )}
                <ol className="space-y-3">
                  {[...data.purpose.days].reverse().map((day) => (
                    <li key={day.date} className="space-y-1.5 border-t pt-3 first:border-t-0 first:pt-0">
                      <p className="flex items-baseline justify-between gap-2 text-sm">
                        <Link to={`/history/${day.date}`} className="font-heading font-semibold hover:underline">
                          {relativeDay(day.date, today)}
                        </Link>
                        {day.purposes.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                            <Target className="size-4 text-mental" aria-hidden /> {shortDaySummary(day)}
                          </span>
                        )}
                      </p>
                      <PurposeDayView day={day} />
                    </li>
                  ))}
                </ol>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <WeekMoodChart days={data.days} />

      <section aria-labelledby="days-heading" className="space-y-3">
        <div>
          <h2 id="days-heading" className="text-xl font-semibold">
            Day by day
          </h2>
          <p className="text-sm text-muted-foreground">Tap a day to see everything you logged, in time order.</p>
        </div>
        <WeekDayList days={data.days} today={today} />
      </section>
    </>
  )
}

/**
 * Daily scores (needs 2+ logged days this week) and this week vs last week (needs a logged day in
 * each week, 2+ in total). Otherwise a hint — never a chart of made-up or empty data.
 */
function ScoreCharts({ data, hasLastWeek }: { data: WeeklyReviewResponse; hasLastWeek: boolean }) {
  const loggedDays = data.days.filter((d) => d.overall !== null).length
  const showDaily = loggedDays >= 2
  const showCompare = hasLastWeek && data.thisWeek.daysLogged > 0 && data.thisWeek.daysLogged + data.lastWeek.daysLogged >= 2
  if (!showDaily && !showCompare) {
    return (
      <p className="flex items-start gap-2 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
        <LineChartIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        Score charts appear once you've logged at least two days. Each check-in on Today adds a day.
      </p>
    )
  }
  const placeholder = <Skeleton className="h-80 w-full rounded-2xl" aria-label="Loading chart" />
  return (
    <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
      {showDaily ? (
        <Suspense fallback={placeholder}>
          <DailyScoresChart days={data.days} />
        </Suspense>
      ) : (
        <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          The day-by-day chart appears once you've logged two days this week.
        </p>
      )}
      {showCompare ? (
        <Suspense fallback={placeholder}>
          <WeekCompareChart data={data} />
        </Suspense>
      ) : (
        <p className="rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          No data from last week yet, so there's nothing to compare. Next week you'll see this week side by side.
        </p>
      )}
    </div>
  )
}

function ReviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading weekly review">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}
