// A read-only view of one day (opened from History): the summary, timeline and graphs.
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Footprints, Flame, ListOrdered, Moon, Scale, SquarePen, Smile, Target, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBubble } from '@/components/IconBubble'
import { PageHeader } from '@/components/PageHeader'
import { SleepCard } from '@/components/SleepCard'
import { Section } from '@/components/CheckinFields'
import { ErrorNotice } from '@/components/StatusViews'
import { ActivityDayChart, MoodDayChart } from '@/components/day/DayCharts'
import { DayTimeline } from '@/components/day/DayTimeline'
import { useDay } from '@/hooks/useDay'
import { formatLongDate, isValidDateString, relativeDay, todayInTimezone } from '@/lib/dates'
import { dayMood, moodEmoji, type DayResponse } from '@/lib/entries'
import { intentionsDone } from '@/lib/purpose'
import { PurposeDayView } from '@/components/purpose/PurposeDayView'
import type { Tone } from '@/lib/tones'

export function DayDetail() {
  const { date } = useParams()
  const today = todayInTimezone()
  if (!isValidDateString(date) || date > today) return <Navigate to="/history" replace />
  return <DayView key={date} date={date} today={today} />
}

function DayView({ date, today }: { date: string; today: string }) {
  const { day, error } = useDay(date)

  return (
    <>
      <PageHeader
        title={relativeDay(date, today)}
        description={formatLongDate(date)}
        action={
          <Button asChild variant="outline">
            <Link to={`/today${date === today ? '' : `?date=${date}`}`}>
              <SquarePen aria-hidden /> Edit this day
            </Link>
          </Button>
        }
      />
      <div className="space-y-4 md:space-y-6">
        <Link to="/history" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Back to history
        </Link>
        {error ? <ErrorNotice>{error}</ErrorNotice> : !day ? <Skeleton className="h-64 w-full rounded-2xl" /> : <DayBody day={day} />}
      </div>
    </>
  )
}

function Stat({ icon, tone, label, value }: { icon: LucideIcon; tone: Tone; label: string; value: string }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <IconBubble icon={icon} tone={tone} className="size-9 rounded-lg [&_svg]:size-4" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-heading text-lg font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function DayBody({ day }: { day: DayResponse }) {
  const entry = day.entry
  const mood = dayMood(entry?.moodLogs)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={Smile}
          tone="mental"
          label={mood ? `Mood · ${mood.count} check-in${mood.count === 1 ? '' : 's'}` : 'Mood'}
          value={mood ? `${moodEmoji(mood.avg)} ${mood.avg}${mood.count > 1 ? ` (${mood.min}–${mood.max})` : ''}` : '—'}
        />
        <Stat icon={Footprints} tone="physical" label="Steps" value={entry?.steps != null ? entry.steps.toLocaleString() : '—'} />
        <Stat icon={Flame} tone="physical" label="Active calories" value={entry?.activeCalories != null ? `${entry.activeCalories.toLocaleString()} kcal` : '—'} />
        <Stat icon={Scale} tone="primary" label="Weight" value={entry?.weightKg != null ? `${entry.weightKg} kg` : '—'} />
      </div>

      {entry?.dailyPurpose && (
        <Section
          title="🎯 Purpose"
          hint={intentionsDone(entry.dailyPurpose) ? `${intentionsDone(entry.dailyPurpose)} intentions done` : undefined}
          icon={Target}
          tone="mental"
        >
          <PurposeDayView purpose={entry.dailyPurpose} />
        </Section>
      )}

      {entry?.sleep && (
        <Section title="Sleep" icon={Moon} tone="mental">
          <SleepCard sleep={entry.sleep} />
        </Section>
      )}

      <Section title="Timeline" hint="Everything logged, in time order." icon={ListOrdered}>
        <DayTimeline items={day.timeline} emptyText="Nothing was logged on this day." />
      </Section>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <MoodDayChart moodLogs={entry?.moodLogs ?? []} />
        <ActivityDayChart snapshots={day.healthSnapshots} />
      </div>
    </>
  )
}
