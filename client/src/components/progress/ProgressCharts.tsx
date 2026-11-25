// Dashboard charts: score trends, weight, calories, sleep and insights.
// Charts follow one style: thin lines and bars, quiet grid, a legend whenever there's more than
// one series, a tooltip on hover/tap, and a friendly empty state when there's nothing to draw.
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, GlassWater, LineChart as LineIcon, Lightbulb, Moon, Scale, UtensilsCrossed } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { IconBubble } from '@/components/IconBubble'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { useFetch } from '@/hooks/useFetch'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { addDays, todayInTimezone } from '@/lib/dates'
import { kcal } from '@/lib/meals'
import { litres, litres1, type WaterResponse } from '@/lib/water'
import {
  AREAS,
  shortDate,
  signed,
  tooltipDate,
  type DailyKcalResponse,
  type InsightsResponse,
  type ScoresListResponse,
  type SleepResponse,
  type WeightResponse,
} from '@/lib/progress'
import type { LucideIcon } from 'lucide-react'

/** Charts draw in smoothly, unless the person has asked for less motion. */
const useAnimate = () => !useMediaQuery('(prefers-reduced-motion: reduce)')

const CHART_CLASS = 'aspect-auto h-56 w-full sm:h-64'
const AXIS = { tickLine: false, axisLine: false, tickMargin: 8 } as const

function ChartCard({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card>
      {/* The action (e.g. the range picker) wraps under the title on narrow phones instead of squeezing it */}
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-52 items-center gap-3">
          <IconBubble icon={icon} />
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

const ChartSkeleton = () => <Skeleton className="h-56 w-full rounded-xl sm:h-64" aria-busy="true" />

// ---------- Score trends ----------

const RANGES = [7, 30, 90] as const

/** "Over 7 days, 5 logged: average overall score 68. Latest (Sat, Nov 21): physical 90, mental 67, learning 60." */
function scoreSummary(days: ScoresListResponse['days']): string {
  const logged = days.filter((d) => d.overall !== null)
  const avg = Math.round(logged.reduce((s, d) => s + d.overall!, 0) / logged.length)
  const last = logged.at(-1)!
  const area = (name: string, v: number | null) => (v === null ? null : `${name} ${v}`)
  const parts = [area('physical', last.physical), area('mental', last.mental), area('learning', last.learning)].filter(Boolean)
  return `Over ${days.length} days, ${logged.length} logged: average overall score ${avg}. Latest (${tooltipDate(last.date)}): ${parts.join(', ')}.`
}
type Range = (typeof RANGES)[number]

const scoreConfig = Object.fromEntries(AREAS.map((a) => [a.key, { label: a.label, color: a.chartColor }])) satisfies ChartConfig

export function ScoreTrendCard() {
  const animate = useAnimate()
  // A week reads best on a phone; desktops have room for a month
  const [range, setRange] = useState<Range>(() => (window.matchMedia('(min-width: 768px)').matches ? 30 : 7))
  const to = todayInTimezone()
  const { data, error } = useFetch<ScoresListResponse>(`/scores?from=${addDays(to, -(range - 1))}&to=${to}`)
  const logged = data?.days.filter((d) => d.overall !== null).length ?? 0

  return (
    <ChartCard
      icon={LineIcon}
      title="Score trends"
      // The range starts at the journey start when that's more recent
      description={data ? `${logged} of ${data.days.length} ${data.days.length === 1 ? 'day' : 'days'} logged` : undefined}
      action={
        <Tabs value={String(range)} onValueChange={(v) => setRange(Number(v) as Range)}>
          <TabsList className="h-9 rounded-xl bg-muted p-1" aria-label="Time range">
            {RANGES.map((r) => (
              <TabsTrigger key={r} value={String(r)} className="rounded-lg px-2.5" aria-controls={undefined}>
                {r}d
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      {error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : !data ? (
        <ChartSkeleton />
      ) : logged === 0 ? (
        <EmptyState icon={LineIcon} title="No scores yet" className="py-10">
          Check in for a few days and your trends will show up here.
        </EmptyState>
      ) : (
        <ChartContainer config={scoreConfig} className={CHART_CLASS} summary={scoreSummary(data.days)}>
          <LineChart data={data.days} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" {...AXIS} minTickGap={28} tickFormatter={shortDate} />
            <YAxis {...AXIS} width={36} domain={[0, 100]} ticks={[0, 50, 100]} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => tooltipDate(String(p[0]?.payload.date))} />} />
            <ChartLegend content={<ChartLegendContent />} />
            {AREAS.map((a) => (
              <Line
                key={a.key}
                dataKey={a.key}
                type="monotone"
                stroke={`var(--color-${a.key})`}
                strokeWidth={2}
                // Gaps on unlogged days instead of pretending they were 0
                connectNulls={false}
                dot={range <= 30 ? { r: 2.5, strokeWidth: 0, fill: `var(--color-${a.key})` } : false}
                activeDot={{ r: 4 }}
                isAnimationActive={animate}
              />
            ))}
          </LineChart>
        </ChartContainer>
      )}
    </ChartCard>
  )
}

// ---------- Weight ----------

/** Legend marks that look like what's drawn: a dot for each weigh-in, a line for the average. */
const DotIcon = () => <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-[var(--color-weightKg)]" />
const LineMarkIcon = () => <span aria-hidden className="h-0.5 w-3.5 shrink-0 rounded-full bg-[var(--color-averageKg)]" />

const weightConfig = {
  weightKg: { label: 'Daily weight', color: 'var(--muted-foreground)', icon: DotIcon },
  averageKg: { label: '7-day average', color: 'var(--primary)', icon: LineMarkIcon },
} satisfies ChartConfig

/** "−1.8" kg with a real minus sign, or "—". */
const kg = (n: number | null, digits = 1) => (n === null ? '—' : `${signed(n, digits)} kg`)

type WeightPoint = WeightResponse['points'][number]

/**
 * For screen readers: only real weigh-ins, never days without one.
 * "2 weigh-ins: 54.2 kg on Sat, Nov 21 and 53.8 kg on Wed, Nov 25; goal 52 kg."
 */
function weightSummary(readings: (WeightPoint & { weightKg: number })[], latestAverage: number | null, goal: number | null): string {
  const at = (p: WeightPoint & { weightKg: number }) => `${p.weightKg} kg on ${tooltipDate(p.date)}`
  const first = readings[0]!
  const last = readings.at(-1)!
  const values = readings.map((p) => p.weightKg)
  const parts =
    readings.length === 1
      ? [`1 weigh-in: ${at(first)}`]
      : readings.length <= 4
        ? [`${readings.length} weigh-ins: ${readings.slice(0, -1).map(at).join(', ')} and ${at(last)}`]
        : [`${readings.length} weigh-ins, from ${at(first)} to ${at(last)}`, `lowest ${Math.min(...values)} kg, highest ${Math.max(...values)} kg`]
  if (latestAverage !== null) parts.push(`latest 7-day average ${latestAverage.toFixed(1)} kg`)
  if (goal !== null) parts.push(`goal ${goal} kg`)
  return `${parts.join('; ')}.`
}

export function WeightCard() {
  const animate = useAnimate()
  const { data, error } = useFetch<WeightResponse>('/progress/weight?days=90')
  // Real weigh-ins only: a day without one is null and is never filled from another day
  const readings = (data?.points ?? []).filter((p): p is WeightPoint & { weightKg: number } => p.weightKg !== null)
  const averages = (data?.points ?? []).filter((p) => p.averageKg !== null)
  // Start the chart at the first weigh-in rather than weeks of empty space
  const firstIndex = data?.points.findIndex((p) => p.weightKg !== null) ?? -1
  const points = data && firstIndex > 0 ? data.points.slice(firstIndex) : (data?.points ?? [])

  // The y-axis fits the real readings; the goal is drawn only when it already falls inside
  const values = readings.map((p) => p.weightKg)
  const lo = Math.floor(Math.min(...values) - 0.5)
  const hi = Math.ceil(Math.max(...values) + 0.5)
  const goal = data?.goalWeightKg ?? null
  const goalOnChart = goal !== null && values.length > 0 && goal >= lo && goal <= hi
  const goalText = goal !== null && !goalOnChart ? <> · goal {goal} kg</> : null

  return (
    <ChartCard icon={Scale} title="Weight" description={data?.latestKg != null ? `Latest ${data.latestKg} kg` : undefined}>
      {error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : !data ? (
        <ChartSkeleton />
      ) : readings.length === 0 ? (
        <EmptyState icon={Scale} title="No weigh-ins yet" className="py-10">
          Add your weight in the daily check-in to see your trend.
        </EmptyState>
      ) : (
        <>
          <ChartContainer
            config={weightConfig}
            className={CHART_CLASS}
            summary={weightSummary(readings, averages.at(-1)?.averageKg ?? null, goal)}
          >
            <ComposedChart data={points} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" {...AXIS} minTickGap={28} tickFormatter={shortDate} />
              <YAxis {...AXIS} width={34} domain={[lo, hi]} allowDecimals={false} />
              <ChartTooltip
                content={(props) => {
                  // Days without a weigh-in have nothing to show (never a made-up value)
                  const payload = props.payload?.filter((p) => p.value !== null && p.value !== undefined)
                  if (!props.active || !payload?.length) return null
                  return (
                    <ChartTooltipContent
                      active={props.active}
                      payload={payload}
                      label={props.label}
                      labelFormatter={(_, p) => tooltipDate(String(p[0]?.payload.date))}
                      formatter={(value, name) => (
                        <div className="flex w-full justify-between gap-4">
                          <span className="text-muted-foreground">{weightConfig[name as keyof typeof weightConfig]?.label}</span>
                          <span className="font-medium tabular-nums">{Number(value).toFixed(1)} kg</span>
                        </div>
                      )}
                    />
                  )
                }}
              />
              <ChartLegend content={<ChartLegendContent />} />
              {goalOnChart && (
                <ReferenceLine
                  y={goal!}
                  stroke="var(--foreground)"
                  strokeOpacity={0.45}
                  strokeDasharray="5 4"
                  label={{ value: `Goal ${goal} kg`, position: 'insideBottomRight', fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
              )}
              {/* Daily weigh-ins: clearly visible dots, never joined across days without one */}
              <Line
                dataKey="weightKg"
                stroke="none"
                dot={{ r: 4, strokeWidth: 1.5, stroke: 'var(--card)', fill: 'var(--color-weightKg)' }}
                activeDot={{ r: 5.5 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              {/* The 7-day average: only on weigh-in days with 2+ readings in the week, joined between those
                  real points only (it can't reach past the first or last reading, as there are no points there) */}
              {averages.length > 0 && (
                <Line
                  dataKey="averageKg"
                  type="monotone"
                  stroke="var(--color-averageKg)"
                  strokeWidth={2.5}
                  dot={averages.length === 1 ? { r: 3, strokeWidth: 0, fill: 'var(--color-averageKg)' } : false}
                  connectNulls
                  isAnimationActive={animate}
                />
              )}
            </ComposedChart>
          </ChartContainer>
          {readings.length === 1 && <p className="text-sm text-muted-foreground">Log your weight on a few more days to see your trend.</p>}
          <p className="text-sm text-muted-foreground">
            {data.changeSinceStartKg === null ? (
              <>
                Log a second weigh-in to see your change
                {goal !== null && <> · goal {goal} kg</>}
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{kg(data.changeSinceStartKg)}</span> since you started
                {data.weeklyChangeKg !== null && (
                  <>
                    {' · '}avg <span className="font-medium text-foreground">{kg(data.weeklyChangeKg)}/week</span>
                  </>
                )}
                {data.expectedWeeklyChangeKg !== null && <> (plan: {kg(data.expectedWeeklyChangeKg)})</>}
                {goalText}
              </>
            )}
          </p>
        </>
      )}
    </ChartCard>
  )
}

// ---------- Calories ----------

const caloriesConfig = { kcal: { label: 'Eaten', color: 'var(--primary)' } } satisfies ChartConfig

export function CaloriesChartCard() {
  const animate = useAnimate()
  const { data, error } = useFetch<DailyKcalResponse>('/meals/stats/daily?days=14')
  const logged = data?.days.filter((d) => d.kcal !== null) ?? []
  const today = data?.days.at(-1)
  const target = data?.calorieTarget ?? null

  return (
    <ChartCard
      icon={UtensilsCrossed}
      title="Calories"
      description={
        today && today.kcal !== null
          ? `Today ${kcal(today.kcal)}${target !== null ? ` of ${kcal(target)}` : ''} kcal`
          : 'Last 14 days'
      }
      action={
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link to="/meals">
            Meals <ArrowRight aria-hidden />
          </Link>
        </Button>
      }
    >
      {error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : !data ? (
        <ChartSkeleton />
      ) : logged.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="No meals logged yet"
          className="py-10"
          action={
            <Button asChild variant="outline">
              <Link to="/meals">Log a meal</Link>
            </Button>
          }
        >
          Your daily calories for the last two weeks will show up here.
        </EmptyState>
      ) : (
        <>
          <ChartContainer
            config={caloriesConfig}
            className={CHART_CLASS}
            summary={`Calories on ${logged.length} of the last ${data.days.length} days, ${kcal(Math.round(logged.reduce((s, d) => s + d.kcal!, 0) / logged.length))} kcal a day on average${target !== null ? `; target ${kcal(target)} kcal` : ''}.`}
          >
            <BarChart data={data.days} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" {...AXIS} minTickGap={20} tickFormatter={shortDate} />
              <YAxis
                {...AXIS}
                width={40}
                tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
                domain={[0, (dataMax: number) => Math.max(dataMax, (target ?? 0) * 1.15)]}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_, p) => tooltipDate(String(p[0]?.payload.date))}
                    formatter={(value) => <span className="font-medium tabular-nums">{kcal(Number(value))} kcal</span>}
                  />
                }
              />
              <Bar dataKey="kcal" fill="var(--color-kcal)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animate} />
              {target !== null && (
                <ReferenceLine
                  y={target}
                  stroke="var(--foreground)"
                  strokeOpacity={0.45}
                  strokeDasharray="5 4"
                />
              )}
            </BarChart>
          </ChartContainer>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {target !== null && (
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="w-4 border-t-2 border-dashed border-foreground/45" />
                Target {kcal(target)} kcal ·
              </span>
            )}
            {logged.length} of {data.days.length} {data.days.length === 1 ? 'day' : 'days'} logged · days without meals are left blank
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Average fibre </span>
            {data.averageFiberG === null ? (
              <span className="text-muted-foreground">— add fibre to your foods to track it</span>
            ) : (
              <span className="font-medium tabular-nums">
                {data.averageFiberG} g / day
                {data.fiberGoalG !== null && <span className="font-normal text-muted-foreground"> · goal {data.fiberGoalG} g</span>}
              </span>
            )}
          </p>
        </>
      )}
    </ChartCard>
  )
}

// ---------- Sleep ----------

const sleepConfig = {
  hours: { label: 'Hours slept', color: 'var(--chart-mental)' },
  score: { label: 'Sleep score', color: 'var(--chart-learning)' },
} satisfies ChartConfig

/** Hours slept as bars, our sleep score as a line, for the last 14 nights. */
export function SleepChartCard() {
  const animate = useAnimate()
  const { data, error } = useFetch<SleepResponse>('/progress/sleep?days=14')
  const nights = data?.days.filter((d) => d.hours !== null).length ?? 0
  const scored = data?.days.some((d) => d.score !== null) ?? false

  return (
    <ChartCard
      icon={Moon}
      title="Sleep"
      description={
        data && nights > 0
          ? [data.avgHours !== null && `Avg ${data.avgHours} h`, data.avgScore !== null && `score ${data.avgScore}`].filter(Boolean).join(' · ')
          : 'Last 14 nights'
      }
    >
      {error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : !data ? (
        <ChartSkeleton />
      ) : nights === 0 ? (
        <EmptyState icon={Moon} title="No sleep logged yet" className="py-10">
          Log your hours in the check-in, or sync sleep from Apple Health.
        </EmptyState>
      ) : (
        <>
          <ChartContainer
            config={sleepConfig}
            className={CHART_CLASS}
            summary={`Sleep on ${nights} of the last ${data.days.length} nights${data.avgHours !== null ? `, ${data.avgHours} hours on average` : ''}${data.avgScore !== null ? `, average sleep score ${data.avgScore}` : ''}.`}
          >
            <ComposedChart data={data.days} margin={{ left: 0, right: 0, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" {...AXIS} minTickGap={20} tickFormatter={shortDate} />
              <YAxis
                yAxisId="hours"
                {...AXIS}
                width={30}
                allowDecimals={false}
                domain={[0, (dataMax: number) => Math.max(10, Math.ceil(dataMax))]}
                tickFormatter={(v: number) => `${v}h`}
              />
              <YAxis yAxisId="score" orientation="right" {...AXIS} width={30} domain={[0, 100]} ticks={[0, 50, 100]} hide={!scored} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, p) => tooltipDate(String(p[0]?.payload.date))}
                    formatter={(value, name) => (
                      <div className="flex w-full justify-between gap-4">
                        <span className="text-muted-foreground">{sleepConfig[name as keyof typeof sleepConfig]?.label}</span>
                        <span className="font-medium tabular-nums">{name === 'hours' ? `${value} h` : `${value}/100`}</span>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar yAxisId="hours" dataKey="hours" fill="var(--color-hours)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animate} />
              {scored && (
                <Line
                  yAxisId="score"
                  dataKey="score"
                  type="monotone"
                  stroke="var(--color-score)"
                  strokeWidth={2}
                  dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--color-score)' }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={animate}
                />
              )}
            </ComposedChart>
          </ChartContainer>
          <p className="text-xs text-muted-foreground">
            {nights} of {data.days.length} {data.days.length === 1 ? 'night' : 'nights'} logged
            {scored ? ' · the score is calculated by Daily Tracker from Apple Health sleep' : ' · sync sleep from Apple Health to see a sleep score'}
          </p>
        </>
      )}
    </ChartCard>
  )
}

// ---------- Insights ----------

/** Only shown when there's at least one pattern. */
export function InsightsCard() {
  const { data } = useFetch<InsightsResponse>('/progress/insights')
  if (!data || data.insights.length === 0) return null

  return (
    <ChartCard icon={Lightbulb} title="Patterns in your days" description={`From ${data.daysAnalysed} check-ins`}>
      <ul className="space-y-3">
        {data.insights.map((insight) => (
          <li key={insight.key} className="flex gap-3 rounded-xl bg-muted/60 p-3 text-sm leading-relaxed">
            <BarChart3 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{insight.text}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        These are patterns in your own logs, not proof that one thing causes another. Many things change from day to day.
      </p>
    </ChartCard>
  )
}

// ---------- Water (last 7 days) ----------

const waterConfig = { ml: { label: 'Water', color: 'var(--outdoor)' } } satisfies ChartConfig

export function WaterChartCard() {
  const animate = useAnimate()
  const { data, error } = useFetch<WaterResponse>('/progress/water?days=7')
  const goal = data?.goalMl ?? null
  const today = data?.days.at(-1)

  return (
    <ChartCard
      icon={GlassWater}
      title="Water"
      description={today ? `Today ${litres(today.ml)}${goal !== null ? ` of ${litres1(goal)}` : ''}` : 'Last 7 days'}
    >
      {error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : !data ? (
        <ChartSkeleton />
      ) : data.waterDays === 0 ? (
        <EmptyState icon={GlassWater} tone="outdoor" title="No water logged yet" className="py-10">
          Tap “+1 glass” on Today and your week will show up here.
        </EmptyState>
      ) : (
        <>
          <ChartContainer
            config={waterConfig}
            className={CHART_CLASS}
            summary={`Water on ${data.waterDays} of the last ${data.days.length} days, ${litres(data.avgWaterMl ?? 0)} a day on average; goal ${litres1(data.goalMl)}, reached on ${data.waterGoalDays} ${data.waterGoalDays === 1 ? 'day' : 'days'}.`}
          >
            <BarChart data={data.days} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" {...AXIS} interval={0} tickFormatter={shortDate} />
              <YAxis
                {...AXIS}
                width={36}
                tickFormatter={(v: number) => `${v / 1000}L`}
                domain={[0, (dataMax: number) => Math.max(dataMax, data.goalMl * 1.15)]}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    hideIndicator
                    labelFormatter={(_, p) => tooltipDate(String(p[0]?.payload.date))}
                    formatter={(value) => <span className="font-medium tabular-nums">{litres(Number(value))}</span>}
                  />
                }
              />
              <Bar dataKey="ml" fill="var(--color-ml)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animate} />
              <ReferenceLine y={data.goalMl} stroke="var(--foreground)" strokeOpacity={0.45} strokeDasharray="5 4" />
            </BarChart>
          </ChartContainer>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="w-4 border-t-2 border-dashed border-foreground/45" />
              Goal {litres1(data.goalMl)} ·
            </span>
            reached on {data.waterGoalDays} of {data.days.length} {data.days.length === 1 ? 'day' : 'days'}
          </p>
        </>
      )}
    </ChartCard>
  )
}
