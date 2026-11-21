// Dashboard charts: score trends, weight, calories, sleep and insights.
// Charts follow one style: thin lines and bars, quiet grid, a legend whenever there's more than
// one series, a tooltip on hover/tap, and a friendly empty state when there's nothing to draw.
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, LineChart as LineIcon, Lightbulb, Moon, Scale, UtensilsCrossed } from 'lucide-react'
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <IconBubble icon={icon} />
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

const ChartSkeleton = () => <Skeleton className="h-56 w-full rounded-xl sm:h-64" aria-busy="true" />

// ---------- Score trends ----------

const RANGES = [7, 30, 90] as const
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
      description={data ? `${logged} of ${range} days logged` : undefined}
      action={
        <Tabs value={String(range)} onValueChange={(v) => setRange(Number(v) as Range)}>
          <TabsList className="h-9 rounded-xl bg-muted p-1" aria-label="Time range">
            {RANGES.map((r) => (
              <TabsTrigger key={r} value={String(r)} className="rounded-lg px-2.5">
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
        <ChartContainer config={scoreConfig} className={CHART_CLASS}>
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

const weightConfig = {
  weightKg: { label: 'Daily weight', color: 'var(--muted-foreground)' },
  averageKg: { label: '7-day average', color: 'var(--primary)' },
} satisfies ChartConfig

/** "−1.8" kg with a real minus sign, or "—". */
const kg = (n: number | null, digits = 1) => (n === null ? '—' : `${signed(n, digits)} kg`)

export function WeightCard() {
  const animate = useAnimate()
  const { data, error } = useFetch<WeightResponse>('/progress/weight?days=90')
  const weights = data?.points.filter((p) => p.weightKg !== null) ?? []
  // Start the chart at the first weigh-in rather than weeks of empty space
  const firstIndex = data?.points.findIndex((p) => p.weightKg !== null) ?? -1
  const points = data && firstIndex > 0 ? data.points.slice(firstIndex) : (data?.points ?? [])

  // Show the goal line only when it's near the data, so the trend isn't squashed flat
  const values = weights.map((p) => p.weightKg!)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const goal = data?.goalWeightKg ?? null
  const goalOnChart = goal !== null && values.length > 0 && goal >= min - 4 && goal <= max + 4
  const lo = Math.floor(Math.min(min, goalOnChart ? goal! : min) - 0.5)
  const hi = Math.ceil(Math.max(max, goalOnChart ? goal! : max) + 0.5)

  return (
    <ChartCard icon={Scale} title="Weight" description={data?.latestKg != null ? `Latest ${data.latestKg} kg` : undefined}>
      {error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : !data ? (
        <ChartSkeleton />
      ) : weights.length === 0 ? (
        <EmptyState icon={Scale} title="No weigh-ins yet" className="py-10">
          Add your weight in the daily check-in to see your trend.
        </EmptyState>
      ) : (
        <>
          <ChartContainer config={weightConfig} className={CHART_CLASS}>
            <ComposedChart data={points} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" {...AXIS} minTickGap={28} tickFormatter={shortDate} />
              <YAxis {...AXIS} width={34} domain={[lo, hi]} allowDecimals={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, p) => tooltipDate(String(p[0]?.payload.date))}
                    formatter={(value, name) => (
                      <div className="flex w-full justify-between gap-4">
                        <span className="text-muted-foreground">{weightConfig[name as keyof typeof weightConfig]?.label}</span>
                        <span className="font-medium tabular-nums">{Number(value).toFixed(1)} kg</span>
                      </div>
                    )}
                  />
                }
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
              {/* Daily weigh-ins: dots only */}
              <Line
                dataKey="weightKg"
                stroke="transparent"
                dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--color-weightKg)', fillOpacity: 0.55 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
              {/* The smooth trend */}
              <Line dataKey="averageKg" type="monotone" stroke="var(--color-averageKg)" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={animate} />
            </ComposedChart>
          </ChartContainer>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{kg(data.changeSinceStartKg)}</span> since you started
            {data.weeklyChangeKg !== null && (
              <>
                {' · '}avg <span className="font-medium text-foreground">{kg(data.weeklyChangeKg)}/week</span>
              </>
            )}
            {data.expectedWeeklyChangeKg !== null && <> (plan: {kg(data.expectedWeeklyChangeKg)})</>}
            {!goalOnChart && goal !== null && <> · goal {goal} kg</>}
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
          <ChartContainer config={caloriesConfig} className={CHART_CLASS}>
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
            {logged.length} of 14 days logged · days without meals are left blank
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
          <ChartContainer config={sleepConfig} className={CHART_CLASS}>
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
            {nights} of 14 nights logged
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
