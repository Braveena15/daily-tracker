// How a day progressed: mood & energy through the day.
// The x-axis is the time of day (minutes since midnight, Asia/Colombo).
import { Smile } from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { MoodDot } from '@/components/day/MoodDot'
import { energyBand, moodBand } from '@/lib/mood'
import { IconBubble } from '@/components/IconBubble'
import { EmptyState } from '@/components/StatusViews'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { timeOf } from '@/lib/healthSync'
import type { MoodLog } from '@/lib/entries'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { fixedAxis } from '@/lib/chartAxis'

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

const moodAxis = fixedAxis([0, 5, 10])

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
            <YAxis {...AXIS} width={moodAxis.width} domain={moodAxis.domain} ticks={moodAxis.ticks} tickFormatter={moodAxis.format} />
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
