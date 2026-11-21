// The day as a timeline: quick mood check-ins and small add forms for each kind of entry.
// Each form saves on its own and clears for the next entry; nothing is overwritten.
import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookOpen, Brain, Dumbbell, Feather, ListOrdered, Moon, Smile, Sparkles, Sun, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AiMessageCard } from '@/components/ai/AiMessageCard'
import { DateBar } from '@/components/DateBar'
import { SleepCard } from '@/components/SleepCard'
import { PageHeader } from '@/components/PageHeader'
import { Section } from '@/components/CheckinFields'
import { ErrorNotice } from '@/components/StatusViews'
import { BodyCard } from '@/components/day/BodyCard'
import { PurposeCard } from '@/components/day/PurposeCard'
import { ActivityDayChart, MoodDayChart } from '@/components/day/LazyDayCharts'
import { DayTimeline } from '@/components/day/DayTimeline'
import { ActivityForm, LearningForm, MoodForm, TextForm } from '@/components/day/EntryForms'
import { EntryList } from '@/components/day/EntryList'
import { useDateParam } from '@/hooks/useDateParam'
import { useDay, type DayActions } from '@/hooks/useDay'
import { aiRequests } from '@/lib/ai'
import { formatDate } from '@/lib/dates'
import {
  MENTAL_CHIPS,
  OUTDOOR_CHIPS,
  WORKOUT_CHIPS,
  dayMood,
  type Activity,
  type DailyEntry,
  type EntryKind,
} from '@/lib/entries'
import type { Tone } from '@/lib/tones'
import { EnergyLabel, MoodBadge } from '@/components/MoodFace'

export function Today() {
  // ?date=YYYY-MM-DD picks a past day; anything missing, invalid or in the future means today
  const { date, today, goTo } = useDateParam()

  return (
    <>
      <PageHeader title="Today" description="Log as you go: each entry gets its own time." />
      <div className="space-y-4 md:space-y-6">
        <DateBar date={date} today={today} onChange={goTo} />
        {/* key: a fresh load for each date */}
        <DayEditor key={date} date={date} today={today} />
      </div>
    </>
  )
}

function EditorSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6" aria-busy="true" aria-label="Loading the day">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <Skeleton className="h-5 w-40" />
            </div>
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

const minutesText = (min?: number) => (min ? ` · ${min} min` : '')

function DayEditor({ date, today }: { date: string; today: string }) {
  const { day, error, ...actions } = useDay(date)
  const { hash } = useLocation()
  const loaded = day !== null

  // /today#purpose (e.g. from the Purpose page) scrolls to the purpose card once the day has loaded
  useEffect(() => {
    if (!loaded || hash !== '#purpose') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById('purpose')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }, [loaded, hash])

  if (error) return <ErrorNotice>{error}</ErrorNotice>
  if (!day) return <EditorSkeleton />

  const entry = day.entry
  const isToday = date === today
  const dayName = isToday ? 'today' : formatDate(date, today)
  const mood = dayMood(entry?.moodLogs)

  return (
    <div className="space-y-4 md:space-y-6">
      {/* key: start fresh when the saved purpose changes from another tab or device */}
      <div id="purpose" className="scroll-mt-4">
        <PurposeCard key={entry?.dailyPurpose?.setAt ?? 'none'} purpose={entry?.dailyPurpose ?? null} isToday={isToday} actions={actions} />
      </div>

      <Section
        title="Quick mood check-in"
        hint={
          mood ? `${mood.count} check-in${mood.count === 1 ? '' : 's'} · average ${mood.avg}/10` : 'How are you feeling right now?'
        }
        icon={Smile}
        tone="mental"
      >
        <MoodForm
          isToday={isToday}
          onSubmit={async (body) => {
            await actions.add('moods', body)
            toast.success('Check-in saved')
          }}
        />
        <EntryList
          label="mood check-in"
          items={entry?.moodLogs ?? []}
          describe={(m) => ({
            title: (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <MoodBadge mood={m.mood} />
                <EnergyLabel energy={m.energy} className="font-normal" />
              </span>
            ),
            detail: m.note,
          })}
          renderEdit={(m, close) => (
            <MoodForm initial={m} isToday={isToday} onCancel={close} onSubmit={(body) => actions.update('moods', m.id, body).then(close)} />
          )}
          onDelete={(m) => actions.remove('moods', m.id)}
        />
      </Section>

      <Section title="Sleep" icon={Moon} tone="mental">
        {entry?.sleep ? (
          <SleepCard sleep={entry.sleep} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {entry?.sleepHours != null ? `${entry.sleepHours} h slept. ` : ''}
            Your sleep score and stages appear here automatically after your Apple Watch syncs.
          </p>
        )}
      </Section>

      <BodyCard key={entry?.id ?? 'new'} date={date} today={today} entry={entry} onSave={actions.saveDaily} />

      <ActivitySection
        kind="workouts"
        title="Workouts"
        hint="Add each workout as you finish it."
        icon={Dumbbell}
        tone="physical"
        chips={WORKOUT_CHIPS}
        itemLabel="Workout"
        minutesRequired
        items={entry?.workouts ?? []}
        isToday={isToday}
        actions={actions}
      />
      <ActivitySection
        kind="mental"
        title="Mental strength"
        hint="Anything that looked after your mind."
        icon={Brain}
        tone="mental"
        chips={MENTAL_CHIPS}
        itemLabel="Activity"
        items={entry?.mentalActivities ?? []}
        isToday={isToday}
        actions={actions}
      />
      <ActivitySection
        kind="outdoor"
        title="Outdoor"
        hint="Time spent outside."
        icon={Sun}
        tone="outdoor"
        chips={OUTDOOR_CHIPS}
        itemLabel="Activity"
        items={entry?.outdoorActivities ?? []}
        isToday={isToday}
        actions={actions}
      />

      <Section title="Good things" hint="Small wins count." icon={Sparkles}>
        <TextForm label="Good thing" placeholder="Something good that happened" maxLength={300} isToday={isToday} onSubmit={(body) => actions.add('goodThings', body)} />
        <EntryList
          label="good thing"
          items={entry?.goodThings ?? []}
          describe={(g) => ({ title: g.text })}
          renderEdit={(g, close) => (
            <TextForm
              initial={g}
              label="Good thing"
              placeholder="Something good that happened"
              maxLength={300}
              isToday={isToday}
              onCancel={close}
              onSubmit={(body) => actions.update('goodThings', g.id, body).then(close)}
            />
          )}
          onDelete={(g) => actions.remove('goodThings', g.id)}
        />
      </Section>

      <Section title="Learnings" hint="Anything new, big or small." icon={BookOpen} tone="learning">
        <LearningForm isToday={isToday} onSubmit={(body) => actions.add('learnings', body)} />
        <EntryList
          label="learning"
          items={entry?.learnings ?? []}
          describe={(l) => ({ title: `${l.topic}${minutesText(l.minutes)}`, detail: l.details })}
          renderEdit={(l, close) => (
            <LearningForm initial={l} isToday={isToday} onCancel={close} onSubmit={(body) => actions.update('learnings', l.id, body).then(close)} />
          )}
          onDelete={(l) => actions.remove('learnings', l.id)}
        />
      </Section>

      <Section title="Present moment" hint="How are you, right now?" icon={Feather}>
        <TextForm
          label="Present moment"
          placeholder="Write a few words…"
          maxLength={2000}
          multiline
          isToday={isToday}
          onSubmit={(body) => actions.add('presentMoments', body)}
        />
        <EntryList
          label="present moment"
          items={entry?.presentMoments ?? []}
          describe={(p) => ({ title: p.text })}
          renderEdit={(p, close) => (
            <TextForm
              initial={p}
              label="Present moment"
              placeholder="Write a few words…"
              maxLength={2000}
              multiline
              isToday={isToday}
              onCancel={close}
              onSubmit={(body) => actions.update('presentMoments', p.id, body).then(close)}
            />
          )}
          onDelete={(p) => actions.remove('presentMoments', p.id)}
        />
      </Section>

      <Section title={isToday ? "Today's timeline" : `Timeline · ${dayName}`} hint="Everything logged, in time order." icon={ListOrdered}>
        <DayTimeline items={day.timeline} />
      </Section>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <MoodDayChart moodLogs={entry?.moodLogs ?? []} />
        <ActivityDayChart snapshots={day.healthSnapshots} />
      </div>

      {/* Once the day has entries: a short note for tomorrow (saved per date, so it's only written once) */}
      {day.logged && (
        <AiMessageCard
          key={date}
          title={isToday ? 'Your note for tomorrow' : `A note on ${dayName}`}
          request={aiRequests.daily(date)}
          // Today's note appears straight away; for past days it waits for a tap, to save AI calls
          autoLoad={isToday}
          startLabel="Show the note"
        />
      )}

      <p className="text-center text-sm">
        <Link to="/history" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          See your history
        </Link>
      </p>
    </div>
  )
}

/** Workouts, mental strength or outdoor: chips + add form, then the day's entries. */
function ActivitySection({
  kind,
  title,
  hint,
  icon,
  tone,
  chips,
  itemLabel,
  minutesRequired,
  items,
  isToday,
  actions,
}: {
  kind: Extract<EntryKind, 'workouts' | 'mental' | 'outdoor'>
  title: string
  hint: string
  icon: LucideIcon
  tone: Tone
  chips: string[]
  itemLabel: string
  minutesRequired?: boolean
  items: (Activity & Partial<Pick<DailyEntry['workouts'][number], 'source' | 'calories'>>)[]
  isToday: boolean
  actions: DayActions
}): ReactNode {
  const form = { chips, tone, itemLabel, minutesRequired, isToday }
  return (
    <Section title={title} hint={hint} icon={icon} tone={tone}>
      <ActivityForm {...form} onSubmit={(body) => actions.add(kind, body)} />
      <EntryList
        label={itemLabel.toLowerCase()}
        items={items}
        describe={(a) => ({ title: `${a.type}${minutesText(a.durationMin)}`, detail: a.notes })}
        readOnly={(a) =>
          a.source === 'watch' && `From Apple Watch${a.calories != null ? ` · ${a.calories.toLocaleString()} kcal` : ''} · updated by each sync`
        }
        renderEdit={(a, close) => <ActivityForm {...form} initial={a} onCancel={close} onSubmit={(body) => actions.update(kind, a.id, body).then(close)} />}
        onDelete={(a) => actions.remove(kind, a.id)}
      />
    </Section>
  )
}
