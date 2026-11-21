import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Brain, CalendarDays, Dumbbell, Plus, Sparkles, SquarePen, Sun } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, ErrorNotice } from '@/components/StatusViews'
import { api } from '@/lib/api'
import { addDays, formatDate, listDates, relativeDay, todayInTimezone } from '@/lib/dates'
import { dayMood, energyEmoji, moodEmoji, type DailyEntry, type EntriesListResponse } from '@/lib/entries'
import { toneSoft } from '@/lib/tones'
import { cn } from '@/lib/utils'

const DAYS = 30

const cardBase =
  'flex h-full flex-col gap-3 rounded-2xl p-4 transition-all outline-none hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]'

export function History() {
  const [today] = useState(() => todayInTimezone())
  const from = addDays(today, -(DAYS - 1))

  const [entries, setEntries] = useState<Map<string, DailyEntry> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<EntriesListResponse>(`/entries?from=${from}&to=${today}`)
      .then((data) => setEntries(new Map(data.entries.map((e) => [e.date, e]))))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your history'))
  }, [from, today])

  const days = listDates(from, today).reverse() // newest first

  return (
    <>
      <PageHeader title="History" description={`Your last ${DAYS} days. Tap a day to see its timeline.`} />

      {error ? (
        <ErrorNotice>{error}</ErrorNotice>
      ) : !entries ? (
        <HistorySkeleton />
      ) : entries.size === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="Your story starts today"
            action={
              <Button asChild>
                <Link to="/today">
                  <SquarePen aria-hidden /> Log today
                </Link>
              </Button>
            }
          >
            Nothing logged in the last {DAYS} days yet. Each day you log will show up here.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-4 md:space-y-6">
          <Card size="sm">
            <CardContent className="space-y-2">
              <p className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {entries.size} of {DAYS} days logged
                </span>
                <span className="text-muted-foreground tabular-nums">{Math.round((entries.size / DAYS) * 100)}%</span>
              </p>
              <Progress value={(entries.size / DAYS) * 100} aria-label={`${entries.size} of ${DAYS} days logged`} />
            </CardContent>
          </Card>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {days.map((date) => {
              const entry = entries.get(date)
              return (
                <li key={date}>
                  {entry ? <DayCard date={date} today={today} entry={entry} /> : <EmptyDay date={date} today={today} />}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}

function DayHeading({ date, today }: { date: string; today: string }) {
  const title = relativeDay(date, today)
  const full = formatDate(date, today)
  return (
    <div className="min-w-0">
      <p className="font-heading font-semibold">{title}</p>
      {title !== full && <p className="text-xs text-muted-foreground">{full}</p>}
    </div>
  )
}

/** "Cycling" or "Cycling ×2" when the same activity was logged more than once. */
function grouped(items: { type: string }[]): { type: string; count: number }[] {
  const counts = new Map<string, { type: string; count: number }>()
  for (const { type } of items) {
    const key = type.trim().toLowerCase()
    const found = counts.get(key)
    if (found) found.count++
    else counts.set(key, { type, count: 1 })
  }
  return [...counts.values()]
}
const times = (count: number) => (count > 1 ? ` ×${count}` : '')

function DayCard({ date, today, entry }: { date: string; today: string; entry: DailyEntry }) {
  const learnings = entry.learnings.length
  const goodThings = entry.goodThings.length
  const hasActivities =
    entry.workouts.length + entry.mentalActivities.length + entry.outdoorActivities.length + learnings + goodThings > 0
  const mood = dayMood(entry.moodLogs)
  const facts = [
    mood && `${mood.count} check-in${mood.count === 1 ? '' : 's'}`,
    mood && `${energyEmoji(mood.avgEnergy)} ${mood.avgEnergy}/10`,
    entry.sleepHours != null && `${entry.sleepHours}h sleep`,
  ].filter(Boolean)

  return (
    <Link
      to={`/history/${date}`}
      className={cn(cardBase, 'bg-card shadow-soft ring-1 ring-foreground/[0.06] hover:ring-primary/30')}
    >
      <div className="flex items-start justify-between gap-3">
        <DayHeading date={date} today={today} />
        {mood && (
          <span className="text-3xl leading-none" role="img" aria-label={`Average mood ${mood.avg} out of 10`}>
            {moodEmoji(mood.avg)}
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground tabular-nums">
        {mood ? `Mood ${mood.avg}/10${mood.count > 1 ? ` (${mood.min}–${mood.max})` : ''}` : 'No mood check-in'}
        {facts.length > 0 && ` · ${facts.join(' · ')}`}
      </p>

      {hasActivities ? (
        <div className="flex flex-wrap gap-1.5">
          {grouped(entry.workouts).map((w) => (
            <Badge key={`w${w.type}`} className={toneSoft.physical}>
              <Dumbbell aria-hidden /> {w.type}
              {times(w.count)}
            </Badge>
          ))}
          {grouped(entry.mentalActivities).map((a) => (
            <Badge key={`m${a.type}`} className={toneSoft.mental}>
              <Brain aria-hidden /> {a.type}
              {times(a.count)}
            </Badge>
          ))}
          {grouped(entry.outdoorActivities).map((a) => (
            <Badge key={`o${a.type}`} className={toneSoft.outdoor}>
              <Sun aria-hidden /> {a.type}
              {times(a.count)}
            </Badge>
          ))}
          {goodThings > 0 && (
            <Badge className={toneSoft.primary}>
              <Sparkles aria-hidden /> {goodThings} good thing{goodThings === 1 ? '' : 's'}
            </Badge>
          )}
          {learnings > 0 && (
            <Badge className={toneSoft.learning}>
              <BookOpen aria-hidden /> {learnings} learning{learnings === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">A quiet day — no activities logged.</p>
      )}
    </Link>
  )
}

function EmptyDay({ date, today }: { date: string; today: string }) {
  return (
    <Link
      to={`/today?date=${date}`}
      className={cn(
        cardBase,
        'justify-between border border-dashed text-muted-foreground hover:border-primary/40 hover:bg-card hover:text-foreground',
      )}
    >
      <DayHeading date={date} today={today} />
      <p className="flex items-center gap-1.5 text-sm">
        <Plus className="size-4" aria-hidden /> Nothing logged · tap to add
      </p>
    </Link>
  )
}

function HistorySkeleton() {
  return (
    <div className="space-y-4 md:space-y-6" aria-busy="true" aria-label="Loading history">
      <Skeleton className="h-[4.5rem] w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} size="sm">
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="size-8 rounded-full" />
              </div>
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
