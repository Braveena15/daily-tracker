// The weekly review's day-by-day view: a chart of each day's average mood, every check-in and the range,
// and one row per day with its counts, steps, calories and sleep score. Each row opens that day's timeline.
import { useState } from 'react'
import { ChevronDown, Smile } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis, useXAxisScale, useYAxisScale } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBubble } from '@/components/IconBubble'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { DayTimeline } from '@/components/day/DayTimeline'
import { useFetch } from '@/hooks/useFetch'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { relativeDay } from '@/lib/dates'
import { type DayResponse } from '@/lib/entries'
import { moodBand } from '@/lib/mood'
import { MoodIcon } from '@/components/MoodFace'
import { MoodDot } from '@/components/day/MoodDot'
import { shortDate, tooltipDate, type ReviewDay } from '@/lib/progress'
import { cn } from '@/lib/utils'
import { fixedAxis } from '@/lib/chartAxis'

const moodAxis = fixedAxis([0, 5, 10])

const chartConfig = {
  mood: { label: 'Daily average', color: 'var(--chart-mental)' },
  range: { label: 'Range', color: 'var(--chart-mental)' },
} satisfies ChartConfig

type MoodPoint = ReviewDay & { range: [number, number] | null }

/**
 * Every check-in as a small square at its value, in its mood colour. Check-ins with the same value
 * on the same day sit side by side instead of on top of each other. Drawn inside the chart with its
 * scales, so the squares line up with the axes.
 */
function CheckInSquares({ points }: { points: MoodPoint[] }) {
  const x = useXAxisScale()
  const y = useYAxisScale()
  if (!x || !y) return null
  return (
    <g aria-hidden>
      {points.flatMap((d) => {
        const cx = x(d.date, { position: 'middle' })
        if (cx === undefined) return []
        const checkins = d.moodCheckins ?? []
        const seen = new Map<number, number>()
        return checkins.map((c, i) => {
          const cy = y(c.mood)
          if (cy === undefined) return null
          const same = checkins.filter((o) => o.mood === c.mood).length
          const k = seen.get(c.mood) ?? 0
          seen.set(c.mood, k + 1)
          const offset = (k - (same - 1) / 2) * 9
          return (
            <rect
              key={`${d.date}-${i}`}
              x={cx + offset - 3.5}
              y={cy - 3.5}
              width={7}
              height={7}
              rx={1.5}
              fill={moodBand(c.mood).color}
              stroke="var(--card)"
              strokeWidth={1}
            />
          )
        })
      })}
    </g>
  )
}

/** For screen readers: each day's average with its word, and its check-ins with their times. */
function moodSummary(days: ReviewDay[]): string {
  const parts = days.map((d) => {
    if (d.mood === null) return `${tooltipDate(d.date)}: no check-in`
    const checkins = (d.moodCheckins ?? []).map((c) => `${c.time} ${c.mood}`).join(', ')
    return `${tooltipDate(d.date)}: average ${d.mood} (${moodBand(d.mood).word})${checkins ? `, check-ins ${checkins}` : ''}`
  })
  return `Mood through the week. ${parts.join('; ')}. Dashed lines bridge days without a check-in.`
}

export function WeekMoodChart({ days }: { days: ReviewDay[] }) {
  const animate = !useMediaQuery('(prefers-reduced-motion: reduce)')
  // The lowest–highest bar only when a day has 2 or more check-ins
  const points: MoodPoint[] = days.map((d) => ({
    ...d,
    range: d.moodCount >= 2 && d.moodMin !== null && d.moodMax !== null ? [d.moodMin, d.moodMax] : null,
  }))
  const withMood = days.filter((d) => d.mood !== null).length

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <IconBubble icon={Smile} tone="mental" />
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold">Mood through the week</CardTitle>
            <CardDescription>Each day's average, every check-in, and the range when there were several</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {withMood === 0 ? (
          <EmptyState icon={Smile} tone="mental" title="No mood check-ins this week" className="py-8">
            Check in from the Today page and your week's mood will show up here.
          </EmptyState>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="aspect-auto h-52 w-full sm:h-60" summary={moodSummary(days)}>
              <ComposedChart data={points} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={shortDate} minTickGap={8} />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={moodAxis.width} domain={moodAxis.domain} ticks={moodAxis.ticks} tickFormatter={moodAxis.format} />
                <ChartTooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    const d = active ? (payload?.[0]?.payload as MoodPoint | undefined) : undefined
                    if (!d) return null
                    return (
                      <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-raised">
                        <p className="font-medium">{tooltipDate(d.date)}</p>
                        {d.mood === null ? (
                          <p className="text-muted-foreground">No check-in</p>
                        ) : (
                          <>
                            <p className="tabular-nums">
                              Average {d.mood} · {moodBand(d.mood).word}
                            </p>
                            <ul className="mt-0.5 space-y-0.5 text-muted-foreground tabular-nums">
                              {(d.moodCheckins ?? []).map((c, i) => (
                                <li key={i} className="flex items-center gap-1.5">
                                  <span aria-hidden className="size-2 rounded-[2px]" style={{ background: moodBand(c.mood).color }} />
                                  {c.time} · {c.mood} {moodBand(c.mood).word}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )
                  }}
                />
                {/* Lowest–highest, behind everything (2+ check-ins only) */}
                <Bar dataKey="range" fill="var(--color-range)" fillOpacity={0.16} barSize={14} radius={4} isAnimationActive={false} />
                {/* Faint dashed line across days without a check-in (no dots, tooltip or legend entry) */}
                <Line
                  dataKey="mood"
                  type="monotone"
                  stroke="var(--color-mood)"
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
                {/* The daily average: solid between consecutive days, a filled circle on each */}
                <Line
                  dataKey="mood"
                  type="monotone"
                  stroke="var(--color-mood)"
                  strokeWidth={2}
                  connectNulls={false}
                  dot={MoodDot}
                  activeDot={{ r: 5 }}
                  isAnimationActive={animate}
                />
                <CheckInSquares points={points} />
              </ComposedChart>
            </ChartContainer>
            <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-[var(--chart-mental)]" /> Daily average
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px] bg-[var(--chart-mental)]" /> Check-in
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-2 rounded-sm bg-[var(--chart-mental)] opacity-25" /> Range
              </span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function WeekDayList({ days, today }: { days: ReviewDay[]; today: string }) {
  return (
    <ul className="space-y-2">
      {[...days].reverse().map((day) => (
        <DayRow key={day.date} day={day} today={today} />
      ))}
    </ul>
  )
}

function DayRow({ day, today }: { day: ReviewDay; today: string }) {
  const [open, setOpen] = useState(false)
  const counts = [
    day.workouts > 0 && plural(day.workouts, 'workout'),
    day.goodThings > 0 && plural(day.goodThings, 'good thing'),
    day.learnings > 0 && plural(day.learnings, 'learning'),
    day.presentMoments > 0 && plural(day.presentMoments, 'moment'),
  ].filter(Boolean)
  const health = [
    day.steps !== null && `${day.steps.toLocaleString()} steps`,
    day.activeCalories !== null && `${day.activeCalories.toLocaleString()} kcal`,
    day.sleepScore !== null && `sleep ${day.sleepScore}`,
  ].filter(Boolean)
  const empty = day.mood === null && counts.length === 0 && health.length === 0

  return (
    <li className="surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={empty}
        className="flex w-full items-start gap-3 rounded-2xl p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
      >
        <div className="w-24 shrink-0">
          <p className="font-heading font-semibold">{relativeDay(day.date, today)}</p>
          <p className="text-xs text-muted-foreground">{shortDate(day.date)}</p>
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          {empty ? (
            <p className="text-muted-foreground">Nothing logged</p>
          ) : (
            <>
              <MoodRange day={day} />
              {counts.length > 0 && <p className="text-muted-foreground">{counts.join(' · ')}</p>}
              {health.length > 0 && <p className="text-muted-foreground tabular-nums">{health.join(' · ')}</p>}
            </>
          )}
        </div>
        {!empty && <ChevronDown className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />}
      </button>
      {open && (
        <div className="border-t px-4 pt-3 pb-4">
          <DayTimelineLoader date={day.date} />
        </div>
      )}
    </li>
  )
}

/** "(face) Good 6.3 · 4 ▬●▬ 8 · 3 check-ins": lowest – average – highest on a 1–10 track. */
function MoodRange({ day }: { day: ReviewDay }) {
  if (day.mood === null || day.moodMin === null || day.moodMax === null) return <p className="text-muted-foreground">No mood check-in</p>
  const pos = (n: number) => `${((n - 1) / 9) * 100}%`
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1.5 font-medium tabular-nums">
        <MoodIcon mood={day.mood} className="size-4" />
        {moodBand(day.mood).word} {day.mood}
      </span>
      <span
        className="relative h-1.5 w-20 rounded-full bg-muted"
        role="img"
        aria-label={`Mood from ${day.moodMin} to ${day.moodMax}, average ${day.mood}`}
      >
        <span className="absolute inset-y-0 rounded-full bg-mental/50" style={{ left: pos(day.moodMin), right: `calc(100% - ${pos(day.moodMax)})` }} />
        <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mental-foreground" style={{ left: pos(day.mood) }} />
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {day.moodMin}–{day.moodMax} · {plural(day.moodCount, 'check-in')}
      </span>
    </div>
  )
}

function DayTimelineLoader({ date }: { date: string }) {
  const { data, error } = useFetch<DayResponse>(`/entries/${date}`)
  if (error) return <ErrorNotice>{error}</ErrorNotice>
  if (!data) return <Skeleton className="h-24 w-full rounded-xl" />
  return <DayTimeline items={data.timeline} emptyText="Nothing was logged on this day." />
}
