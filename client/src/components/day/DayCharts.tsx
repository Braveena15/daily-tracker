// How a day progressed: mood and energy through the day, as two charts with the same time axis.
// The x-axis is the time of day (minutes since midnight, Asia/Colombo).
import { Smile, Zap } from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { moodBand } from '@/lib/mood'
import { IconBubble } from '@/components/IconBubble'
import { EmptyState } from '@/components/StatusViews'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { dayOf, timeOf } from '@/lib/healthSync'
import { todayInTimezone } from '@/lib/dates'
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

// ---------- Mood and energy (two charts) ----------

type CheckinPoint = { minute: number; mood: number; energy: number; note?: string }
type Series = 'mood' | 'energy'

const levelAxis = fixedAxis([0, 5, 10])

const SERIES = {
  mood: { title: 'Mood through the day', label: 'Mood', color: 'var(--chart-mental)', icon: Smile, tone: 'mental' },
  energy: { title: 'Energy through the day', label: 'Energy', color: 'var(--chart-learning)', icon: Zap, tone: 'learning' },
} as const

/** "15:42 · 7 Good" for mood, "15:42 · Energy 6" for energy. */
const pointText = (series: Series, p: CheckinPoint) =>
  series === 'mood' ? `${clock(p.minute)} · ${p.mood} ${moodBand(p.mood).word}` : `${clock(p.minute)} · Energy ${p.energy}`

/** From an hour before the first check-in to an hour after the last one (or now, today), on whole hours. */
function checkinDomain(minutes: number[], nowMinute: number | null): [number, number] {
  const first = Math.min(...minutes)
  const last = Math.max(...minutes, nowMinute ?? 0)
  const lo = Math.max(0, Math.floor((first - 60) / 60) * 60)
  const hi = Math.min(24 * 60, Math.ceil((last + 60) / 60) * 60)
  return [lo, Math.max(hi, lo + 120)]
}

/** "2 check-ins. Mood 5 (Okay) at 09:10, 6 (Okay) at 15:42; average 5.5." */
function seriesSummary(series: Series, points: CheckinPoint[], avg: number): string {
  const list = points.map((p) => `${p[series]}${series === 'mood' ? ` (${moodBand(p.mood).word})` : ''} at ${clock(p.minute)}`).join(', ')
  return `${points.length} check-in${points.length === 1 ? '' : 's'}. ${SERIES[series].label} ${list}; average ${avg}.`
}

function SeriesChart({ series, points, domain }: { series: Series; points: CheckinPoint[]; domain: [number, number] }) {
  const animate = !useMediaQuery('(prefers-reduced-motion: reduce)')
  const meta = SERIES[series]
  const avg = Math.round((points.reduce((s, p) => s + p[series], 0) / Math.max(1, points.length)) * 10) / 10
  const config = { [series]: { label: meta.label, color: meta.color } } satisfies ChartConfig

  return (
    <DayChartCard
      icon={meta.icon}
      title={meta.title}
      description={points.length === 0 ? 'No check-ins yet' : `${points.length} check-in${points.length === 1 ? '' : 's'} · avg ${avg}`}
    >
      {points.length === 0 ? (
        <EmptyState icon={meta.icon} tone={meta.tone} title="No check-ins yet" className="py-6">
          Do a quick mood check-in and it will show up here.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          <ChartContainer config={config} className={CHART_CLASS} summary={seriesSummary(series, points, avg)}>
            <LineChart data={points} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="minute" type="number" domain={domain} ticks={hourTicks(domain)} tickFormatter={clock} {...AXIS} />
              <YAxis {...AXIS} width={levelAxis.width} domain={levelAxis.domain} ticks={levelAxis.ticks} tickFormatter={levelAxis.format} />
              <ChartTooltip
                content={({ active, payload }) => {
                  const p = active ? (payload?.[0]?.payload as CheckinPoint | undefined) : undefined
                  if (!p) return null
                  return (
                    <div className="max-w-56 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-raised">
                      <p className="font-medium tabular-nums">{pointText(series, p)}</p>
                      {p.note && <p className="mt-0.5 text-muted-foreground">{p.note}</p>}
                    </div>
                  )
                }}
              />
              <Line
                dataKey={series}
                type="monotone"
                stroke={`var(--color-${series})`}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 1.5, stroke: 'var(--card)', fill: `var(--color-${series})` }}
                activeDot={{ r: 5.5 }}
                isAnimationActive={animate}
              />
            </LineChart>
          </ChartContainer>
          {points.length === 1 && <p className="text-center text-sm text-muted-foreground">Check in again later to see how your day changes</p>}
        </div>
      )}
    </DayChartCard>
  )
}

/** Mood and energy as two charts with the same time axis: side by side on wide screens, stacked on phones. */
export function MoodDayChart({ moodLogs }: { moodLogs: MoodLog[] }) {
  const points: CheckinPoint[] = moodLogs
    .map((m) => ({ minute: minuteOfDay(m.loggedAt), mood: m.mood, energy: m.energy, note: m.note }))
    .sort((a, b) => a.minute - b.minute)
  // Today the axis reaches now; a past day ends an hour after its last check-in
  const isToday = moodLogs.length > 0 && dayOf(moodLogs[0]!.loggedAt) === todayInTimezone()
  const domain = points.length > 0 ? checkinDomain(points.map((p) => p.minute), isToday ? minuteOfDay(new Date().toISOString()) : null) : ([0, 0] as [number, number])

  return (
    <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
      <SeriesChart series="mood" points={points} domain={domain} />
      <SeriesChart series="energy" points={points} domain={domain} />
    </div>
  )
}
