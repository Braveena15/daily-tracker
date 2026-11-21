// How a day progressed: mood & energy through the day, and steps & active calories from the watch syncs.
// The x-axis is the time of day (minutes since midnight, Asia/Colombo).
import { Activity, Smile } from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { MoodDot } from '@/components/day/MoodDot'
import { energyBand, moodBand } from '@/lib/mood'
import { IconBubble } from '@/components/IconBubble'
import { EmptyState } from '@/components/StatusViews'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { timeOf } from '@/lib/healthSync'
import type { HealthSnapshot, MoodLog } from '@/lib/entries'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

const CHART_CLASS = 'aspect-auto h-52 w-full sm:h-60'
const AXIS = { tickLine: false, axisLine: false, tickMargin: 8 } as const

/** Minutes since midnight in the app's timezone. */
function minuteOfDay(iso: string): number {
  const [h, m] = timeOf(iso).split(':').map(Number) as [number, number]
  return h * 60 + m
}
const clock = (minute: number) => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

/** The x-axis range: whole hours around the data, at least 3 hours wide. */
function hourDomain(minutes: number[]): [number, number] {
  const lo = Math.floor(Math.min(...minutes) / 60) * 60
  const hi = Math.max(Math.ceil(Math.max(...minutes) / 60) * 60, lo + 180)
  return [lo, Math.min(hi, 24 * 60)]
}

function hourTicks([lo, hi]: [number, number]): number[] {
  const hours = (hi - lo) / 60
  const step = hours <= 6 ? 60 : hours <= 12 ? 180 : 240
  const ticks: number[] = []
  for (let t = lo; t <= hi; t += step) ticks.push(t)
  return ticks
}

function DayChartCard({ icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <IconBubble icon={icon} />
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ---------- Mood & energy ----------

/** "3 check-ins. Mood from Okay 5 to Good 8; latest Good 7 at 20:58, with some energy (6/10)." */
function moodSummary(points: { minute: number; mood: number; energy: number }[]): string {
  const moods = points.map((p) => p.mood)
  const lo = Math.min(...moods)
  const hi = Math.max(...moods)
  const last = points.at(-1)!
  const range = lo === hi ? `Mood ${moodBand(lo).word} ${lo}` : `Mood from ${moodBand(lo).word} ${lo} to ${moodBand(hi).word} ${hi}`
  return `${points.length} check-in${points.length === 1 ? '' : 's'}. ${range}; latest ${moodBand(last.mood).word} ${last.mood} at ${clock(last.minute)}, ${energyBand(last.energy).word.toLowerCase()} (${last.energy}/10).`
}

/** "By 18:30: 8,712 steps and 194 active kcal, over 6 syncs." */
function activitySummary(points: { minute: number; steps: number | null; activeCalories: number | null }[]): string {
  const last = points.at(-1)!
  const steps = [...points].reverse().find((p) => p.steps !== null)?.steps
  const kcal = [...points].reverse().find((p) => p.activeCalories !== null)?.activeCalories
  const parts = [steps != null && `${steps.toLocaleString()} steps`, kcal != null && `${kcal.toLocaleString()} active kcal`].filter(Boolean)
  return `By ${clock(last.minute)}: ${parts.join(' and ')}, over ${points.length} syncs.`
}

const moodConfig = {
  mood: { label: 'Mood', color: 'var(--chart-mental)' },
  energy: { label: 'Energy', color: 'var(--chart-learning)' },
} satisfies ChartConfig

export function MoodDayChart({ moodLogs }: { moodLogs: MoodLog[] }) {
  const animate = !useMediaQuery('(prefers-reduced-motion: reduce)')
  const points = moodLogs
    .map((m) => ({ minute: minuteOfDay(m.loggedAt), mood: m.mood, energy: m.energy, note: m.note }))
    .sort((a, b) => a.minute - b.minute)
  const domain = points.length > 0 ? hourDomain(points.map((p) => p.minute)) : ([0, 0] as [number, number])

  return (
    <DayChartCard
      icon={Smile}
      title="Mood & energy through the day"
      description={points.length === 1 ? '1 check-in' : `${points.length} check-ins`}
    >
      {points.length < 2 ? (
        <EmptyState icon={Smile} tone="mental" title={points.length === 0 ? 'No check-ins yet' : 'One check-in so far'} className="py-6">
          Check in a couple of times through the day to see how your mood and energy move.
        </EmptyState>
      ) : (
        <ChartContainer config={moodConfig} className={CHART_CLASS} summary={moodSummary(points)}>
          <LineChart data={points} margin={{ left: 0, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="minute" type="number" domain={domain} ticks={hourTicks(domain)} tickFormatter={clock} {...AXIS} />
            <YAxis {...AXIS} width={28} domain={[0, 10]} ticks={[0, 5, 10]} />
            <ChartTooltip
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as (typeof points)[number] | undefined) : undefined
                if (!p) return null
                return (
                  <div className="max-w-56 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-raised">
                    <p className="font-medium tabular-nums">{clock(p.minute)}</p>
                    <p className="tabular-nums">
                      Mood: {moodBand(p.mood).word} {p.mood}/10
                    </p>
                    <p className="tabular-nums">
                      Energy: {energyBand(p.energy).word.replace(' energy', '')} {p.energy}/10
                    </p>
                    {p.note && <p className="mt-0.5 text-muted-foreground">{p.note}</p>}
                  </div>
                )
              }}
            />
            <ChartLegend content={<ChartLegendContent />} />
            {(['mood', 'energy'] as const).map((key) => (
              <Line
                key={key}
                dataKey={key}
                type="monotone"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                dot={key === 'mood' ? MoodDot : { r: 3, strokeWidth: 0, fill: `var(--color-${key})` }}
                activeDot={{ r: 5 }}
                isAnimationActive={animate}
              />
            ))}
          </LineChart>
        </ChartContainer>
      )}
    </DayChartCard>
  )
}

// ---------- Steps & active calories ----------

const activityConfig = {
  steps: { label: 'Steps', color: 'var(--chart-physical)' },
  activeCalories: { label: 'Active kcal', color: 'var(--chart-learning)' },
} satisfies ChartConfig

export function ActivityDayChart({ snapshots }: { snapshots: HealthSnapshot[] }) {
  const animate = !useMediaQuery('(prefers-reduced-motion: reduce)')
  const points = snapshots
    .map((s) => ({ minute: minuteOfDay(s.time), steps: s.steps ?? null, activeCalories: s.activeCalories ?? null }))
    .sort((a, b) => a.minute - b.minute)
  const domain = points.length > 0 ? hourDomain(points.map((p) => p.minute)) : ([0, 0] as [number, number])
  const hasSteps = points.some((p) => p.steps !== null)
  const hasKcal = points.some((p) => p.activeCalories !== null)

  return (
    <DayChartCard
      icon={Activity}
      title="Steps & active calories"
      description={points.length === 0 ? 'From your Apple Watch syncs' : `${points.length} ${points.length === 1 ? 'sync' : 'syncs'} from your Apple Watch`}
    >
      {points.length < 2 ? (
        <EmptyState icon={Activity} tone="physical" title="Not enough syncs yet" className="py-6">
          Each Apple Watch sync adds a point here, so you can see how your day built up.
        </EmptyState>
      ) : (
        <ChartContainer config={activityConfig} className={CHART_CLASS} summary={activitySummary(points)}>
          <LineChart data={points} margin={{ left: 0, right: 0, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="minute" type="number" domain={domain} ticks={hourTicks(domain)} tickFormatter={clock} {...AXIS} />
            {/* Steps on the left, calories on the right: their numbers are very different sizes */}
            <YAxis yAxisId="steps" {...AXIS} width={40} hide={!hasSteps} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
            <YAxis yAxisId="kcal" orientation="right" {...AXIS} width={36} hide={!hasKcal} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, p) => clock(Number(p[0]?.payload.minute))}
                  formatter={(value, name) => (
                    <div className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">{activityConfig[name as keyof typeof activityConfig]?.label}</span>
                      <span className="font-medium tabular-nums">{Number(value).toLocaleString()}</span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {hasSteps && (
              <Line yAxisId="steps" dataKey="steps" type="monotone" stroke="var(--color-steps)" strokeWidth={2} dot={false} connectNulls isAnimationActive={animate} />
            )}
            {hasKcal && (
              <Line
                yAxisId="kcal"
                dataKey="activeCalories"
                type="monotone"
                stroke="var(--color-activeCalories)"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={animate}
              />
            )}
          </LineChart>
        </ChartContainer>
      )}
    </DayChartCard>
  )
}
