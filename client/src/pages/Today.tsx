import { useEffect, useState, type FormEvent } from 'react'
import { Link, useBlocker } from 'react-router-dom'
import {
  BookOpen,
  Brain,
  Check,
  Dumbbell,
  Feather,
  Loader2,
  Moon,
  Ruler,
  Save,
  Smile,
  Sparkles,
  Sun,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { AiMessageCard } from '@/components/ai/AiMessageCard'
import { DateBar } from '@/components/DateBar'
import { SleepCard } from '@/components/SleepCard'
import { PageHeader } from '@/components/PageHeader'
import { useDateParam } from '@/hooks/useDateParam'
import { ErrorNotice } from '@/components/StatusViews'
import {
  ActivityList,
  LearningList,
  NumberField,
  RatingPicker,
  Section,
  TextList,
  WatchMark,
} from '@/components/CheckinFields'
import { aiRequests } from '@/lib/ai'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/dates'
import { dayOf, formatSyncTime, timeOf } from '@/lib/healthSync'
import {
  MENTAL_CHIPS,
  OUTDOOR_CHIPS,
  WORKOUT_CHIPS,
  energyEmoji,
  isCheckedIn,
  moodEmoji,
  type DailyEntry,
  type EntryResponse,
  type HealthSyncField,
  type SaveEntryResponse,
} from '@/lib/entries'
import { emptyForm, entryToForm, formToPayload, snapshot, type CheckinForm } from '@/lib/checkinForm'

export function Today() {
  // ?date=YYYY-MM-DD picks a past day; anything missing, invalid or in the future means today
  const { date, today, goTo } = useDateParam()

  return (
    <>
      <PageHeader title="Daily check-in" />
      <div className="space-y-4 md:space-y-6">
        <DateBar date={date} today={today} onChange={goTo} />
        {/* key: a fresh editor (and a fresh load) for each date */}
        <EntryEditor key={date} date={date} today={today} />
      </div>
    </>
  )
}

function EditorSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6" aria-busy="true" aria-label="Loading check-in">
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

function EntryEditor({ date, today }: { date: string; today: string }) {
  const [form, setForm] = useState<CheckinForm>(emptyForm)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null) // null while loading
  // true once the day has a check-in (a day with only Apple Health data doesn't count yet)
  const [exists, setExists] = useState(false)
  const [stored, setStored] = useState<DailyEntry | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .get<EntryResponse>(`/entries/${date}`)
      .then(({ entry }) => {
        if (cancelled) return
        const loaded = entry ? entryToForm(entry) : emptyForm()
        setForm(loaded)
        setSavedSnapshot(snapshot(loaded))
        setExists(isCheckedIn(entry))
        setStored(entry)
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load this day')
      })
    return () => {
      cancelled = true
    }
  }, [date])

  const loading = savedSnapshot === null && !loadError
  const dirty = savedSnapshot !== null && snapshot(form) !== savedSnapshot

  // Warn before closing or reloading the tab with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // Warn before moving to another page or date inside the app (shown as a dialog below)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  )

  function set<K extends keyof CheckinForm>(field: K, value: CheckinForm[K]) {
    setForm((f) => ({ ...f, [field]: value }))
    setError(null)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const result = formToPayload(form)
    if (!result.ok) return setError(result.error)

    setSaving(true)
    try {
      const data = await api.put<SaveEntryResponse>(`/entries/${date}`, result.payload)
      const saved = entryToForm(data.entry)
      setForm(saved)
      setSavedSnapshot(snapshot(saved))
      setExists(true)
      setStored(data.entry)
      toast.success('Saved ✓', {
        description: data.profileWeightUpdated ? 'Your profile weight was updated too.' : undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <ErrorNotice>{loadError}</ErrorNotice>
  if (loading) return <EditorSkeleton />

  const isSaved = exists && !dirty
  const dayName = date === today ? 'today' : formatDate(date, today)

  // ⌚ on a field while it still holds the value Apple Health synced (editing it removes the mark)
  const syncedFields = new Set<HealthSyncField>(stored?.healthSync?.fields ?? [])
  const fromWatch = (field: 'weightKg' | 'steps' | 'activeCalories' | 'sleepHours') =>
    syncedFields.has(field) && stored !== null && form[field] === (stored[field] == null ? '' : String(stored[field]))
  const sync = stored?.healthSync
  const syncLabel = sync ? (dayOf(sync.syncedAt) === date ? timeOf(sync.syncedAt) : formatSyncTime(sync.syncedAt, today)) : null
  const watchExtras = [
    stored?.restingCalories != null && `Resting ${stored.restingCalories.toLocaleString()} kcal`,
    stored?.exerciseMinutes != null && `Exercise ${stored.exerciseMinutes} min`,
  ].filter(Boolean)

  return (
    <form className="space-y-4 md:space-y-6" onSubmit={handleSubmit} noValidate>
      <Section title="Mood & energy" hint="How are you feeling overall?" icon={Smile}>
        <RatingPicker label="Mood" value={form.mood} onChange={(v) => set('mood', v)} emoji={moodEmoji} />
        <RatingPicker label="Energy" value={form.energy} onChange={(v) => set('energy', v)} emoji={energyEmoji} />
      </Section>

      <Section title="Sleep" icon={Moon} tone="mental">
        {stored?.sleep && <SleepCard sleep={stored.sleep} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Hours slept last night"
            unit="hours"
            step="0.25"
            min={0}
            max={24}
            placeholder="e.g. 7.5"
            value={form.sleepHours}
            onChange={(v) => set('sleepHours', v)}
            fromWatch={fromWatch('sleepHours')}
          />
          <NumberField
            label="Apple Sleep Score (from your Watch)"
            unit="/ 100"
            step="1"
            min={0}
            max={100}
            placeholder="Optional"
            value={form.appleSleepScore}
            onChange={(v) => set('appleSleepScore', v)}
          />
        </div>
      </Section>

      <Section
        title="Body"
        hint="All optional."
        icon={Ruler}
        tone="physical"
        aside={
          syncLabel && (
            <Badge variant="outline" className="gap-1 bg-card text-physical-foreground">
              <span aria-hidden>⌚</span> Synced from Apple Watch · {syncLabel}
            </Badge>
          )
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Weight"
            unit="kg"
            step="0.1"
            min={30}
            max={300}
            value={form.weightKg}
            onChange={(v) => set('weightKg', v)}
            fromWatch={fromWatch('weightKg')}
          />
          <NumberField
            label="Steps"
            unit="steps"
            step="1"
            min={0}
            max={200000}
            value={form.steps}
            onChange={(v) => set('steps', v)}
            fromWatch={fromWatch('steps')}
          />
          <NumberField
            label="Active calories"
            unit="kcal"
            step="1"
            min={0}
            max={10000}
            value={form.activeCalories}
            onChange={(v) => set('activeCalories', v)}
            fromWatch={fromWatch('activeCalories')}
          />
        </div>
        {watchExtras.length > 0 && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <WatchMark /> {watchExtras.join(' · ')}
          </p>
        )}
      </Section>

      <Section title="Workouts" hint="Tap to add, then set the minutes." icon={Dumbbell} tone="physical">
        <ActivityList
          rows={form.workouts}
          onChange={(rows) => set('workouts', rows)}
          chips={WORKOUT_CHIPS}
          itemLabel="Workout"
          tone="physical"
          minutesRequired
        />
      </Section>

      <Section title="Mental strength" hint="Anything that looked after your mind." icon={Brain} tone="mental">
        <ActivityList
          rows={form.mentalActivities}
          onChange={(rows) => set('mentalActivities', rows)}
          chips={MENTAL_CHIPS}
          itemLabel="Activity"
          tone="mental"
        />
      </Section>

      <Section title="Outdoor" hint="Time spent outside." icon={Sun} tone="outdoor">
        <ActivityList
          rows={form.outdoorActivities}
          onChange={(rows) => set('outdoorActivities', rows)}
          chips={OUTDOOR_CHIPS}
          itemLabel="Activity"
          tone="outdoor"
        />
      </Section>

      <Section title="Good things" hint="Small wins count." icon={Sparkles}>
        <TextList
          rows={form.goodThings}
          onChange={(rows) => set('goodThings', rows)}
          placeholder="Something good that happened"
          maxLength={300}
        />
      </Section>

      <Section title="Learnings" hint="Anything new, big or small." icon={BookOpen} tone="learning">
        <LearningList rows={form.learnings} onChange={(rows) => set('learnings', rows)} />
      </Section>

      <Section title="Present moment" hint="How are you, right now?" icon={Feather}>
        <div className="space-y-1.5">
          <Textarea
            className="min-h-32 font-serif text-lg leading-relaxed md:text-lg"
            aria-label="Present moment"
            rows={4}
            maxLength={2000}
            placeholder="Write a few words…"
            value={form.presentMoment}
            onChange={(e) => set('presentMoment', e.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">{form.presentMoment.length} / 2000</p>
        </div>
      </Section>

      {/* Once the day is saved: a short note for tomorrow (saved per date, so it's only written once) */}
      {exists && (
        <AiMessageCard
          key={date}
          title={date === today ? 'Your note for tomorrow ✨' : `A note on ${dayName} ✨`}
          request={aiRequests.daily(date)}
          // Today's note appears straight away; for past days it waits for a tap, to save AI calls
          autoLoad={date === today}
          startLabel="Show the note ✨"
        />
      )}

      {/* Sticks to the bottom of the screen (above the tab bar on phones) */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 md:bottom-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card/85 p-2.5 pl-4 shadow-soft backdrop-blur-lg">
          <p className="min-w-0 text-sm" role="status">
            {error ? (
              <span className="text-destructive">{error}</span>
            ) : dirty ? (
              <span className="text-muted-foreground">Unsaved changes</span>
            ) : isSaved ? (
              <span className="font-medium text-success">Saved ✓</span>
            ) : (
              <span className="text-muted-foreground">Not logged for {dayName} yet</span>
            )}
          </p>
          <Button type="submit" size="lg" className="min-w-28" disabled={saving || isSaved}>
            {saving ? (
              <>
                <Loader2 className="animate-spin" aria-hidden /> Saving…
              </>
            ) : isSaved ? (
              <>
                <Check aria-hidden /> Saved
              </>
            ) : (
              <>
                <Save aria-hidden /> Save
              </>
            )}
          </Button>
        </div>
      </div>

      <p className="text-center text-sm">
        <Link to="/history" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          See your history
        </Link>
      </p>

      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.()
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>You have unsaved changes for {dayName}. If you leave now they'll be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => blocker.reset?.()}>
              Keep editing
            </Button>
            <Button type="button" variant="destructive" onClick={() => blocker.proceed?.()}>
              Leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
