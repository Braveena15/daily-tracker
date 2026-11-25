import { Suspense, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, BookOpen, Brain, CalendarCheck, ChevronLeft, ChevronRight, Dumbbell, Flag, Gauge, GlassWater, LineChart as LineChartIcon, Moon, Smile, Sparkles, Target, Trophy, UtensilsCrossed, Wheat, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/InfoTip'
import { WeeklyGoalsCard, type GoalSuggestion } from '@/components/progress/WeeklyGoals'
import { SCORE_HELP, type ScoreKey } from '@/lib/scoreHelp'
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
import { kcal } from '@/lib/meals'
import type { WeeklyReviewResponse } from '@/lib/progress'
import type { Tone } from '@/lib/tones'
import { cn } from '@/lib/utils'
import { lazyPage } from '@/lib/lazyPage'
import { CardChevron } from '@/components/CardChevron'
import { litres } from '@/lib/water'

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

type Direction = 'higher-is-good' | 'neutral'

function Delta({ diff, unit = '', direction = 'higher-is-good', digits = 0 }: { diff: number | null; unit?: string; direction?: Direction; digits?: number }) {
  if (diff === null) return null
  const rounded = Number(diff.toFixed(digits))
  if (rounded === 0) return <span className="text-xs text-muted-foreground">Same as last week</span>

  const up = rounded > 0
  const Icon = up ? ArrowUp : ArrowDown
  // Up on a "more is better" number is a soft green; down is shown calmly in grey, never red
  const colour = direction === 'neutral' || !up ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success'
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums', colour)}>
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{up ? 'up' : 'down'}</span>
      {Math.abs(rounded).toFixed(digits)}
      {unit}
      <span className="max-sm:sr-only">&nbsp;vs last week</span>
    </span>
  )
}

function StatCard({
  icon,
  tone = 'primary',
  label,
  value,
  previous,
  delta,
  emptyHint,
  help,
}: {
  icon: LucideIcon
  tone?: Tone
  label: string
  /** null: nothing logged this week (shows `emptyHint`) */
  value: string | null
  /** null: no data from last week */
  previous: string | null
  delta?: ReactNode
  emptyHint?: string
  /** Adds an ⓘ that explains the number */
  help?: ScoreKey
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <IconBubble icon={icon} tone={tone} className="size-8 shrink-0 rounded-lg [&_svg]:size-4" />
          <p className="min-w-0 flex-1 text-sm leading-tight text-muted-foreground">{label}</p>
          {help && <InfoTip title={SCORE_HELP[help].title}>{SCORE_HELP[help].text}</InfoTip>}
        </div>
        {value === null ? (
          <p className="text-sm text-muted-foreground">
            <span className="block font-heading text-xl font-semibold text-foreground/40 sm:text-2xl" aria-hidden>
              —
            </span>
            {emptyHint ?? 'Nothing logged this week'}
          </p>
        ) : (
          <p className="font-heading text-xl font-semibold text-balance tabular-nums sm:text-2xl">{value}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {value !== null && previous !== null && delta}
          <span className="text-xs text-muted-foreground">{previous === null ? 'No data from last week yet' : `Last week: ${previous}`}</span>
        </div>
      </CardContent>
    </Card>
  )
}

const show = (n: number | null, suffix = '') => (n === null ? null : `${n.toLocaleString()}${suffix}`)
/** Last week's figure, or null when last week had nothing logged (or was before the journey) */
const before = (n: number | null, hasData: boolean, suffix = '') => (hasData ? show(n, suffix) : null)

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

      <section aria-labelledby="scores-heading" className="space-y-3">
        <div>
          <h2 id="scores-heading" className="text-xl font-semibold">
            Average scores
          </h2>
          <p className="text-sm text-muted-foreground">Out of 100, over the days you logged. Tap ⓘ to see what each one counts.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Gauge} label="Overall" help="overall" value={show(w.avgOverall)} previous={before(p.avgOverall, hasLastWeek)} delta={<Delta diff={d.avgOverall} />} emptyHint="Log a day to see it" />
          <StatCard icon={Dumbbell} tone="physical" label="Physical" help="physical" value={show(w.avgPhysical)} previous={before(p.avgPhysical, hasLastWeek)} delta={<Delta diff={d.avgPhysical} />} emptyHint="Log a day to see it" />
          <StatCard icon={Brain} tone="mental" label="Mental" help="mental" value={show(w.avgMental)} previous={before(p.avgMental, hasLastWeek)} delta={<Delta diff={d.avgMental} />} emptyHint="Log a day to see it" />
          <StatCard icon={BookOpen} tone="learning" label="Learning" help="learning" value={show(w.avgLearning)} previous={before(p.avgLearning, hasLastWeek)} delta={<Delta diff={d.avgLearning} />} emptyHint="Log a day to see it" />
        </div>
      </section>

      <ScoreCharts data={data} hasLastWeek={hasLastWeek} />

      <section aria-labelledby="week-heading" className="space-y-3">
        <h2 id="week-heading" className="text-xl font-semibold">
          Your week
        </h2>
        {/* Two columns even on phones (one below 360px), so the page stays short */}
        <div className="grid grid-cols-2 gap-3 max-[360px]:grid-cols-1 lg:grid-cols-3">
          <StatCard
            icon={Dumbbell}
            tone="physical"
            label="Workouts"
            value={w.workouts > 0 ? `${w.workouts} · ${w.workoutMinutes} min` : null}
            emptyHint="Add workouts on Today"
            previous={hasLastWeek ? `${p.workouts} · ${p.workoutMinutes} min` : null}
            delta={<Delta diff={d.workoutMinutes} unit=" min" />}
          />
          <StatCard
            icon={BookOpen}
            tone="learning"
            label="Learning time"
            value={w.learningMinutes > 0 ? `${w.learningMinutes} min` : null}
            emptyHint="Add learnings with minutes on Today"
            previous={hasLastWeek ? `${p.learningMinutes} min` : null}
            delta={<Delta diff={d.learningMinutes} unit=" min" />}
          />
          <StatCard
            icon={Moon}
            tone="mental"
            label="Average sleep"
            value={show(w.avgSleepHours, ' h')}
            emptyHint="Sync your watch or add sleep hours"
            previous={before(p.avgSleepHours, hasLastWeek, ' h')}
            delta={<Delta diff={d.avgSleepHours} unit=" h" digits={1} direction="neutral" />}
          />
          <StatCard
            icon={Moon}
            tone="mental"
            label="Average sleep score"
            value={show(w.avgSleepScore, '/100')}
            emptyHint="Comes from your Apple Watch sleep"
            previous={before(p.avgSleepScore, hasLastWeek, '/100')}
            delta={<Delta diff={d.avgSleepScore} />}
          />
          <StatCard icon={Smile} tone="mental" label="Average mood" value={show(w.avgMood, '/10')} previous={before(p.avgMood, hasLastWeek, '/10')} delta={<Delta diff={d.avgMood} digits={1} />} emptyHint="Do a quick mood check-in" />
          <StatCard
            icon={UtensilsCrossed}
            label="Average calories"
            value={w.avgKcal === null ? null : `${kcal(w.avgKcal)} kcal`}
            emptyHint="Log your meals"
            previous={hasLastWeek && p.avgKcal !== null ? `${kcal(p.avgKcal)} kcal` : null}
            delta={
              <span className="text-xs text-muted-foreground">
                {data.calorieTarget === null
                  ? 'No target set'
                  : w.avgKcal === null
                    ? `Target ${kcal(data.calorieTarget)}`
                    : `${kcal(Math.abs(w.avgKcal - data.calorieTarget))} ${w.avgKcal >= data.calorieTarget ? 'over' : 'under'} target`}
              </span>
            }
          />
          <StatCard
            icon={Wheat}
            tone="outdoor"
            label="Average fibre"
            value={show(w.avgFiberG, ' g / day')}
            emptyHint="Shows once your meals have fibre info"
            previous={before(p.avgFiberG, hasLastWeek, ' g')}
            delta={<Delta diff={d.avgFiberG} unit=" g" digits={1} />}
          />
          <StatCard
            icon={GlassWater}
            tone="outdoor"
            label="Average water"
            value={w.avgWaterMl === null ? null : `${litres(w.avgWaterMl)} / day`}
            emptyHint="Tap “+1 glass” on Today"
            previous={p.daysTracked > 0 && p.avgWaterMl !== null ? litres(p.avgWaterMl) : null}
            delta={<Delta diff={d.avgWaterMl === null ? null : d.avgWaterMl / 1000} unit=" L" digits={2} />}
          />
          <StatCard
            icon={GlassWater}
            tone="outdoor"
            label={`Water goal (${litres(data.waterGoalMl)})`}
            value={w.waterDays === 0 ? null : `${w.waterGoalDays} of ${w.daysTracked} ${w.daysTracked === 1 ? 'day' : 'days'}`}
            emptyHint="Reached days show here"
            previous={p.daysTracked > 0 && p.waterDays > 0 ? `${p.waterGoalDays} of ${p.daysTracked}` : null}
            delta={<Delta diff={d.waterGoalDays} unit={Math.abs(d.waterGoalDays ?? 0) === 1 ? ' day' : ' days'} />}
          />
          <StatCard
            icon={CalendarCheck}
            label="Days logged"
            value={`${w.daysLogged} of ${w.daysTracked}`}
            previous={p.daysTracked === 0 ? null : `${p.daysLogged} of ${p.daysTracked}`}
            delta={<Delta diff={d.daysLogged} unit={Math.abs(d.daysLogged ?? 0) === 1 ? ' day' : ' days'} />}
          />
        </div>
      </section>

      <section aria-labelledby="purpose-heading" className="space-y-3">
        <h2 id="purpose-heading" className="text-xl font-semibold">
          Purpose this week
        </h2>
        <Card>
          <CardContent className="space-y-4">
            {data.purpose.days.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No daily purposes set this week.{' '}
                <Link to="/today" className="font-medium text-primary underline-offset-4 hover:underline">
                  Set today's purposes
                </Link>
              </p>
            ) : (
              <>
                <PurposeStatsRow stats={data.purpose.stats} />
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
