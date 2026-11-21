// The weekly review's day-by-day view: a chart of daily average mood with its lowest–highest range,
// and one row per day with its counts, steps, calories and sleep score. Each row opens that day's timeline.
import { useState } from 'react'
import { ChevronDown, Smile } from 'lucide-react'
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBubble } from '@/components/IconBubble'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { DayTimeline } from '@/components/day/DayTimeline'
import { useFetch } from '@/hooks/useFetch'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { relativeDay } from '@/lib/dates'
import { moodEmoji, type DayResponse } from '@/lib/entries'
import { shortDate, tooltipDate, type ReviewDay } from '@/lib/progress'
import { cn } from '@/lib/utils'

const chartConfig = {
  mood: { label: 'Average mood', color: 'var(--chart-mental)' },
  range: { label: 'Lowest–highest', color: 'var(--chart-mental)' },
} satisfies ChartConfig

export function WeekMoodChart({ days }: { days: ReviewDay[] }) {
  const animate = !useMediaQuery('(prefers-reduced-motion: reduce)')
  const points = days.map((d) => ({ ...d, range: d.moodMin !== null && d.moodMax !== null ? [d.moodMin, d.moodMax] : null }))
  const withMood = days.filter((d) => d.mood !== null).length

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <IconBubble icon={Smile} tone="mental" />
          <div className="min-w-0">
            <CardTitle className="text-lg font-semibold">Mood through the week</CardTitle>
            <CardDescription>Daily average, with the lowest and highest check-in shaded</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {withMood === 0 ? (
          <EmptyState icon={Smile} tone="mental" title="No mood check-ins this week" className="py-8">
            Check in from the Today page and your week's mood will show up here.
          </EmptyState>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-52 w-full sm:h-60">
            <ComposedChart data={points} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={shortDate} minTickGap={8} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} width={28} domain={[0, 10]} ticks={[0, 5, 10]} />
              <ChartTooltip
                content={({ active, payload }) => {
                  const d = active ? (payload?.[0]?.payload as ReviewDay | undefined) : undefined
                  if (!d) return null
                  return (
                    <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
                      <p className="font-medium">{tooltipDate(d.date)}</p>
                      <p className="text-muted-foreground tabular-nums">
                        {d.mood === null
                          ? 'No check-in'
                          : `Average ${d.mood} · ${d.moodMin}–${d.moodMax} · ${d.moodCount} check-in${d.moodCount === 1 ? '' : 's'}`}
                      </p>
                    </div>
                  )
                }}
              />
              <Area dataKey="range" type="monotone" stroke="none" fill="var(--color-range)" fillOpacity={0.15} connectNulls isAnimationActive={animate} />
              <Line
                dataKey="mood"
                type="monotone"
                stroke="var(--color-mood)"
                strokeWidth={2}
                connectNulls={false}
                dot={{ r: 3, strokeWidth: 0, fill: 'var(--color-mood)' }}
                activeDot={{ r: 5 }}
                isAnimationActive={animate}
              />
            </ComposedChart>
          </ChartContainer>
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
    <li className="rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
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

/** "🙂 6.3 · 4 ▬●▬ 8 · 3 check-ins": lowest – average – highest on a 1–10 track. */
function MoodRange({ day }: { day: ReviewDay }) {
  if (day.mood === null || day.moodMin === null || day.moodMax === null) return <p className="text-muted-foreground">No mood check-in</p>
  const pos = (n: number) => `${((n - 1) / 9) * 100}%`
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium tabular-nums">
        {moodEmoji(day.mood)} {day.mood}
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
