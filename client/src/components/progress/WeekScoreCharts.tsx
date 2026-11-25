// The weekly review's two score charts (loaded on their own, with Recharts, only on that page).
// They only ever plot what was logged: unlogged days stay empty (a dashed line only bridges them),
// and a missing week shows no bar.
import type { ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { BarChart3, LineChart as LineIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { IconBubble } from '@/components/IconBubble'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { AREAS, tooltipDate, type ReviewDay, type WeeklyReviewResponse } from '@/lib/progress'
import { fixedAxis } from '@/lib/chartAxis'

const scoreAxis = fixedAxis([0, 50, 100])

const CHART_CLASS = 'aspect-auto h-56 w-full sm:h-64'
const AXIS = { tickLine: false, axisLine: false, tickMargin: 8 } as const
const weekday = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })

function ChartCard({ icon, title, description, children }: { icon: typeof LineIcon; title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-3">
        <IconBubble icon={icon} />
        <div className="min-w-0">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ---------- Daily scores this week ----------

const dailyConfig = Object.fromEntries(AREAS.map((a) => [a.key, { label: a.label, color: a.chartColor }])) satisfies ChartConfig

function dailySummary(days: ReviewDay[]): string {
  const logged = days.filter((d) => d.overall !== null)
  const parts = logged.map((d) => `${tooltipDate(d.date)}: physical ${d.physical}, mental ${d.mental}, learning ${d.learning}`)
  return `Daily scores on the ${logged.length} logged days. ${parts.join('; ')}. Dashed lines bridge days without a check-in.`
}

export function DailyScoresChart({ days }: { days: ReviewDay[] }) {
  const animate = !useMediaQuery('(prefers-reduced-motion: reduce)')
  const logged = days.filter((d) => d.overall !== null).length
  return (
    <ChartCard icon={LineIcon} title="Scores day by day" description={`${logged} of ${days.length} days logged · dashed lines bridge days without a check-in`}>
      <ChartContainer config={dailyConfig} className={CHART_CLASS} summary={dailySummary(days)}>
        <LineChart data={days} margin={{ left: 0, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} />
          {/* Padding keeps the first and last weekday labels inside the chart */}
          <XAxis dataKey="date" {...AXIS} tickFormatter={weekday} interval={0} padding={{ left: 12, right: 12 }} />
          <YAxis {...AXIS} width={scoreAxis.width} domain={scoreAxis.domain} ticks={scoreAxis.ticks} tickFormatter={scoreAxis.format} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => tooltipDate(String(p[0]?.payload.date))} />} />
          <ChartLegend content={<ChartLegendContent />} />
          {/* Bottom layer: a faint dashed line across days without a check-in (no dots, tooltip or legend entry) */}
          {AREAS.map((a) => (
            <Line
              key={`${a.key}-bridge`}
              dataKey={a.key}
              type="monotone"
              stroke={`var(--color-${a.key})`}
              strokeOpacity={0.4}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              connectNulls
              dot={false}
              activeDot={false}
              legendType="none"
              tooltipType="none"
              isAnimationActive={animate}
            />
          ))}
          {/* Top layer: solid only between consecutive logged days, with a dot on each real score */}
          {AREAS.map((a) => (
            <Line
              key={a.key}
              dataKey={a.key}
              type="monotone"
              stroke={`var(--color-${a.key})`}
              strokeWidth={2}
              connectNulls={false}
              dot={{ r: 3, strokeWidth: 0, fill: `var(--color-${a.key})` }}
              activeDot={{ r: 5 }}
              isAnimationActive={animate}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </ChartCard>
  )
}

// ---------- This week vs last week ----------

const compareConfig = {
  lastWeek: { label: 'Last week', color: 'var(--muted-foreground)' },
  thisWeek: { label: 'This week', color: 'var(--primary)' },
} satisfies ChartConfig

export function WeekCompareChart({ data }: { data: WeeklyReviewResponse }) {
  const animate = !useMediaQuery('(prefers-reduced-motion: reduce)')
  const { thisWeek: w, lastWeek: p } = data
  // A missing average stays null (no bar), never 0
  const rows = [
    { area: 'Overall', thisWeek: w.avgOverall, lastWeek: p.avgOverall },
    { area: 'Physical', thisWeek: w.avgPhysical, lastWeek: p.avgPhysical },
    { area: 'Mental', thisWeek: w.avgMental, lastWeek: p.avgMental },
    { area: 'Learning', thisWeek: w.avgLearning, lastWeek: p.avgLearning },
  ]
  const fmt = (n: number | null) => (n === null ? 'no data' : String(n))
  const summary = `Average scores, this week vs last week. ${rows.map((r) => `${r.area}: ${fmt(r.thisWeek)} vs ${fmt(r.lastWeek)}`).join('; ')}.`

  return (
    <ChartCard icon={BarChart3} title="This week vs last week" description={`Averages over ${w.daysLogged} and ${p.daysLogged} logged days`}>
      <ChartContainer config={compareConfig} className={CHART_CLASS} summary={summary}>
        <BarChart data={rows} margin={{ left: 0, right: 8, top: 8 }} barGap={4}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="area" {...AXIS} interval={0} />
          <YAxis {...AXIS} width={scoreAxis.width} domain={scoreAxis.domain} ticks={scoreAxis.ticks} tickFormatter={scoreAxis.format} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="lastWeek" fill="var(--color-lastWeek)" fillOpacity={0.45} radius={[4, 4, 0, 0]} isAnimationActive={animate} />
          <Bar dataKey="thisWeek" fill="var(--color-thisWeek)" radius={[4, 4, 0, 0]} isAnimationActive={animate} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}
