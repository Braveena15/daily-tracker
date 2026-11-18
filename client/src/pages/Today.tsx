import { useEffect, useState, type FormEvent } from 'react'
import { Link, useBlocker, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { addDays, isValidDateString, relativeDay, todayInTimezone, formatDate } from '../lib/dates'
import {
  MENTAL_CHIPS,
  OUTDOOR_CHIPS,
  WORKOUT_CHIPS,
  energyEmoji,
  moodEmoji,
  type EntryResponse,
  type SaveEntryResponse,
} from '../lib/entries'
import { emptyForm, entryToForm, formToPayload, snapshot, type CheckinForm } from '../lib/checkinForm'
import { ActivityList, LearningList, NumberField, RatingPicker, Section, TextList } from '../components/CheckinFields'

export function Today() {
  const [params, setParams] = useSearchParams()
  const today = todayInTimezone()

  // ?date=YYYY-MM-DD picks a past day; anything missing, invalid or in the future means today
  const requested = params.get('date')
  const date = isValidDateString(requested) && requested <= today ? requested : today

  function goTo(next: string) {
    const clamped = next > today ? today : next
    setParams(clamped === today ? {} : { date: clamped })
  }

  return (
    <div className="checkin">
      <div className="date-bar card">
        <button type="button" className="secondary" aria-label="Previous day" onClick={() => goTo(addDays(date, -1))}>
          ‹
        </button>
        <label className="date-picker">
          <span className="date-title">{relativeDay(date, today)}</span>
          <input
            type="date"
            value={date}
            max={today}
            aria-label="Choose a date"
            onChange={(e) => isValidDateString(e.target.value) && goTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="secondary"
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => goTo(addDays(date, 1))}
        >
          ›
        </button>
      </div>

      {/* key: a fresh editor (and a fresh load) for each date */}
      <EntryEditor key={date} date={date} today={today} />
    </div>
  )
}

function EntryEditor({ date, today }: { date: string; today: string }) {
  const [form, setForm] = useState<CheckinForm>(emptyForm)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null) // null while loading
  const [exists, setExists] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .get<EntryResponse>(`/entries/${date}`)
      .then(({ entry }) => {
        if (cancelled) return
        const loaded = entry ? entryToForm(entry) : emptyForm()
        setForm(loaded)
        setSavedSnapshot(snapshot(loaded))
        setExists(entry !== null)
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

  // Warn before moving to another page or date inside the app
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm('You have unsaved changes. Leave without saving?')) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  function set<K extends keyof CheckinForm>(field: K, value: CheckinForm[K]) {
    setForm((f) => ({ ...f, [field]: value }))
    setError(null)
    setNotice(null)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    const result = formToPayload(form)
    if (!result.ok) return setError(result.error)

    setSaving(true)
    try {
      const data = await api.put<SaveEntryResponse>(`/entries/${date}`, result.payload)
      const saved = entryToForm(data.entry)
      setForm(saved)
      setSavedSnapshot(snapshot(saved))
      setExists(true)
      if (data.profileWeightUpdated) setNotice('Your profile weight was updated too.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <p className="form-error">{loadError}</p>
  if (loading) return <p className="loading">Loading…</p>

  const isSaved = exists && !dirty
  const dayName = date === today ? 'today' : formatDate(date, today)

  return (
    <form className="checkin-form" onSubmit={handleSubmit} noValidate>
      <Section title="Mood & energy">
        <RatingPicker label="Mood" value={form.mood} onChange={(v) => set('mood', v)} emoji={moodEmoji} />
        <RatingPicker label="Energy" value={form.energy} onChange={(v) => set('energy', v)} emoji={energyEmoji} />
      </Section>

      <Section title="Sleep">
        <NumberField
          label="Hours slept last night"
          unit="hours"
          step="0.25"
          min={0}
          max={24}
          placeholder="e.g. 7.5"
          value={form.sleepHours}
          onChange={(v) => set('sleepHours', v)}
        />
      </Section>

      <Section title="Body" hint="All optional.">
        <div className="form-grid three">
          <NumberField
            label="Weight"
            unit="kg"
            step="0.1"
            min={30}
            max={300}
            value={form.weightKg}
            onChange={(v) => set('weightKg', v)}
          />
          <NumberField
            label="Steps"
            step="1"
            min={0}
            max={100000}
            value={form.steps}
            onChange={(v) => set('steps', v)}
          />
          <NumberField
            label="Active calories"
            unit="kcal"
            step="1"
            min={0}
            max={10000}
            value={form.activeCalories}
            onChange={(v) => set('activeCalories', v)}
          />
        </div>
      </Section>

      <Section title="Workouts" hint="Tap to add, then set the minutes.">
        <ActivityList
          rows={form.workouts}
          onChange={(rows) => set('workouts', rows)}
          chips={WORKOUT_CHIPS}
          itemLabel="Workout"
          minutesRequired
        />
      </Section>

      <Section title="Mental strength" hint="Anything that looked after your mind.">
        <ActivityList
          rows={form.mentalActivities}
          onChange={(rows) => set('mentalActivities', rows)}
          chips={MENTAL_CHIPS}
          itemLabel="Activity"
        />
      </Section>

      <Section title="Outdoor" hint="Time spent outside.">
        <ActivityList
          rows={form.outdoorActivities}
          onChange={(rows) => set('outdoorActivities', rows)}
          chips={OUTDOOR_CHIPS}
          itemLabel="Activity"
        />
      </Section>

      <Section title="Good things" hint="Small wins count.">
        <TextList
          rows={form.goodThings}
          onChange={(rows) => set('goodThings', rows)}
          placeholder="Something good that happened"
          maxLength={300}
        />
      </Section>

      <Section title="Learnings">
        <LearningList rows={form.learnings} onChange={(rows) => set('learnings', rows)} />
      </Section>

      <Section title="Present moment" hint="How are you, right now?">
        <textarea
          className="present-moment"
          aria-label="Present moment"
          rows={4}
          maxLength={2000}
          placeholder="Write a few words…"
          value={form.presentMoment}
          onChange={(e) => set('presentMoment', e.target.value)}
        />
        <p className="char-count">{form.presentMoment.length} / 2000</p>
      </Section>

      <div className="save-bar">
        <div className="save-status" role="status">
          {error ? (
            <span className="text-error">{error}</span>
          ) : notice ? (
            <span className="text-success">Saved ✓ {notice}</span>
          ) : dirty ? (
            <span className="muted">Unsaved changes</span>
          ) : isSaved ? (
            <span className="text-success">Saved ✓</span>
          ) : (
            <span className="muted">Not logged for {dayName} yet</span>
          )}
        </div>
        <button type="submit" disabled={saving || isSaved}>
          {saving ? 'Saving…' : isSaved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      <p className="muted center">
        <Link to="/history">See your history</Link>
      </p>
    </form>
  )
}
