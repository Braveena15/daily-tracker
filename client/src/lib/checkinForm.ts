// Converts between a saved DailyEntry and the check-in form's editable state.
// Inputs hold strings (an empty string means "not filled in").
import type { Activity, DailyEntry, EntryInput, Learning, Workout } from './entries'

// Every list row gets a stable key so React keeps inputs in place when rows are removed.
let keyCounter = 0
export const newKey = () => `row-${++keyCounter}`

export type ActivityRow = { key: string; type: string; durationMin: string; notes: string }
export type LearningRow = { key: string; topic: string; details: string; minutes: string }
export type TextRow = { key: string; text: string }

export type CheckinForm = {
  mood: number | null
  energy: number | null
  sleepHours: string
  weightKg: string
  steps: string
  activeCalories: string
  workouts: ActivityRow[]
  mentalActivities: ActivityRow[]
  outdoorActivities: ActivityRow[]
  goodThings: TextRow[]
  learnings: LearningRow[]
  presentMoment: string
}

export function emptyForm(): CheckinForm {
  return {
    mood: null,
    energy: null,
    sleepHours: '',
    weightKg: '',
    steps: '',
    activeCalories: '',
    workouts: [],
    mentalActivities: [],
    outdoorActivities: [],
    goodThings: [],
    learnings: [],
    presentMoment: '',
  }
}

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

function activityRows(items: (Workout | Activity)[]): ActivityRow[] {
  return items.map((a) => ({ key: newKey(), type: a.type, durationMin: str(a.durationMin), notes: a.notes ?? '' }))
}

export function entryToForm(entry: DailyEntry): CheckinForm {
  return {
    mood: entry.mood,
    energy: entry.energy,
    sleepHours: str(entry.sleepHours),
    weightKg: str(entry.weightKg),
    steps: str(entry.steps),
    activeCalories: str(entry.activeCalories),
    workouts: activityRows(entry.workouts),
    mentalActivities: activityRows(entry.mentalActivities),
    outdoorActivities: activityRows(entry.outdoorActivities),
    goodThings: entry.goodThings.map((text) => ({ key: newKey(), text })),
    learnings: entry.learnings.map((l) => ({
      key: newKey(),
      topic: l.topic,
      details: l.details ?? '',
      minutes: str(l.minutes),
    })),
    presentMoment: entry.presentMoment ?? '',
  }
}

/** The form without row keys, as a string, to tell whether anything changed since loading or saving. */
export function snapshot(form: CheckinForm): string {
  return JSON.stringify(form, (key, value: unknown) => (key === 'key' ? undefined : value))
}

// ---------- Form → API payload, with friendly validation ----------

class FormError extends Error {}

function optionalNumber(value: string, label: string): number | undefined {
  if (value.trim() === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n)) throw new FormError(`${label} must be a number`)
  return n
}

function activities(rows: ActivityRow[], section: string, minutesRequired: boolean): Activity[] {
  return rows
    .filter((r) => r.type.trim() || r.durationMin.trim() || r.notes.trim()) // skip blank rows
    .map((r) => {
      const type = r.type.trim()
      if (!type) throw new FormError(`Give each ${section} item a name`)
      const durationMin = optionalNumber(r.durationMin, `${type} minutes`)
      if (minutesRequired && (durationMin === undefined || durationMin < 1)) {
        throw new FormError(`Enter how many minutes "${type}" took`)
      }
      return { type, durationMin, notes: r.notes.trim() || undefined }
    })
}

export type PayloadResult = { ok: true; payload: EntryInput } | { ok: false; error: string }

export function formToPayload(form: CheckinForm): PayloadResult {
  try {
    if (form.mood === null) throw new FormError('Choose your mood (1–10)')
    if (form.energy === null) throw new FormError('Choose your energy (1–10)')
    const sleepHours = optionalNumber(form.sleepHours, 'Sleep')
    if (sleepHours === undefined) throw new FormError('Enter how many hours you slept')

    const learnings: Learning[] = form.learnings
      .filter((l) => l.topic.trim() || l.details.trim() || l.minutes.trim())
      .map((l) => {
        const topic = l.topic.trim()
        if (!topic) throw new FormError('Give each learning a topic')
        return {
          topic,
          details: l.details.trim() || undefined,
          minutes: optionalNumber(l.minutes, `${topic} minutes`),
        }
      })

    return {
      ok: true,
      payload: {
        mood: form.mood,
        energy: form.energy,
        sleepHours,
        weightKg: optionalNumber(form.weightKg, 'Weight') ?? null,
        steps: optionalNumber(form.steps, 'Steps') ?? null,
        activeCalories: optionalNumber(form.activeCalories, 'Active calories') ?? null,
        workouts: activities(form.workouts, 'workout', true) as Workout[],
        mentalActivities: activities(form.mentalActivities, 'mental strength', false),
        outdoorActivities: activities(form.outdoorActivities, 'outdoor', false),
        goodThings: form.goodThings.map((g) => g.text.trim()).filter(Boolean),
        learnings,
        presentMoment: form.presentMoment.trim(),
      },
    }
  } catch (err) {
    if (err instanceof FormError) return { ok: false, error: err.message }
    throw err
  }
}
