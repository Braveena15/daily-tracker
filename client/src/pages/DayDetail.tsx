// A read-only view of one day (opened from History): the summary, timeline and graphs.
import { Link, Navigate, useParams } from 'react-router-dom'
import { Footprints, Flame, GlassWater, ListOrdered, Moon, Scale, SquarePen, Smile, Target, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { IconBubble } from '@/components/IconBubble'
import { PageHeader } from '@/components/PageHeader'
import { SleepCard } from '@/components/SleepCard'
import { Section } from '@/components/CheckinFields'
import { ErrorNotice } from '@/components/StatusViews'
import { MoodDayChart } from '@/components/day/LazyDayCharts'

import { DayTimeline } from '@/components/day/DayTimeline'
import { useDay } from '@/hooks/useDay'
import { formatLongDate, isValidDateString, relativeDay, todayInTimezone } from '@/lib/dates'
import { dayMood, manualSleep, type DayResponse } from '@/lib/entries'
import { moodBand } from '@/lib/mood'
import { MoodIcon } from '@/components/MoodFace'
import { dayPurposesOf, daySummary } from '@/lib/purpose'
import { PurposeDayView } from '@/components/purpose/PurposeDayView'
import type { Tone } from '@/lib/tones'
import type { ReactNode } from 'react'
import { litres } from '@/lib/water'
import { notLoggedText } from '@/lib/missed'

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
        back={{ to: '/history', label: 'History' }}
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
        {error ? <ErrorNotice>{error}</ErrorNotice> : !day ? <Skeleton className="h-64 w-full rounded-2xl" /> : <DayBody day={day} />}
      </div>
    </>
  )
}

function Stat({ icon, tone, label, value }: { icon: LucideIcon; tone: Tone; label: string; value: ReactNode }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <IconBubble icon={icon} tone={tone} className="size-9 rounded-lg [&_svg]:size-4" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="font-heading text-lg font-semibold tabular-nums">{value}</div>
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
      {!day.logged && entry?.missedReason && (
        // Why this day wasn't logged, as noted on the day or the day after
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{notLoggedText(entry.missedReason)}</p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          icon={Smile}
          tone="mental"
          label={mood ? `Mood · ${mood.count} check-in${mood.count === 1 ? '' : 's'}` : 'Mood'}
          value={
            mood ? (
              <span className="flex flex-wrap items-center gap-x-1.5">
                <MoodIcon mood={mood.avg} />
                {moodBand(mood.avg).word}
                <span className="text-sm font-normal text-muted-foreground">
                  {mood.avg}
                  {mood.count > 1 && ` (${mood.min}–${mood.max})`}
                </span>
              </span>
            ) : (
              '—'
            )
          }
        />
        <Stat icon={Footprints} tone="physical" label="Steps" value={entry?.steps != null ? entry.steps.toLocaleString() : '—'} />
        <Stat icon={Flame} tone="physical" label="Active calories" value={entry?.activeCalories != null ? `${entry.activeCalories.toLocaleString()} kcal` : '—'} />
        <Stat icon={Scale} tone="primary" label="Weight" value={entry?.weightKg != null ? `${entry.weightKg} kg` : '—'} />
        <Stat icon={GlassWater} tone="outdoor" label="Water" value={day.waterTotalMl ? litres(day.waterTotalMl) : '—'} />
      </div>

      {entry && (entry.dailyPurposes?.length || entry.dailyReflectionNote) ? (
        <Section
          title="What mattered"
          hint={entry.dailyPurposes?.length ? daySummary(dayPurposesOf(entry)) : undefined}
          icon={Target}
          tone="mental"
        >
          <PurposeDayView day={dayPurposesOf(entry)} />
        </Section>
      ) : null}

      {entry?.sleep ? (
        <Section title="Sleep" icon={Moon} tone="mental">
          <SleepCard sleep={entry.sleep} override={manualSleep(entry).hours !== null || manualSleep(entry).score !== null ? manualSleep(entry) : undefined} />
        </Section>
      ) : entry?.sleepHours != null || entry?.sleepScoreValue != null ? (
        <Section title="Sleep" icon={Moon} tone="mental">
          <p className="text-sm tabular-nums">
            {[entry.sleepHours != null && `${entry.sleepHours} h slept`, entry.sleepScoreValue != null && `sleep score ${entry.sleepScoreValue}/100`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </Section>
      ) : null}

      <Section title="Timeline" hint="Everything logged, in time order." icon={ListOrdered}>
        <DayTimeline items={day.timeline} learned={day.learned} learnedLabel="Learned this day" emptyText="Nothing was logged on this day." />
      </Section>

      <MoodDayChart moodLogs={entry?.moodLogs ?? []} />
    </>
  )
}
