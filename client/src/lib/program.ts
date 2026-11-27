// Transformation programs ("My Journey"), matching the server's /api/programs routes, plus the
// same day maths as server/src/utils/program.ts so the countdown moves on at local midnight
// (Asia/Colombo) without reloading.
import { addDays, formatLongDate } from './dates'

export type ProgramStatus = 'active' | 'completed' | 'ended_early' | 'abandoned'
export const PROGRAM_PRESETS = [30, 60, 90, 100] as const
export const PROGRAM_LENGTH = { min: 7, max: 365 } as const

export const RATING_KEYS = ['confidence', 'discipline', 'fitness', 'mentalWellbeing', 'focus'] as const
export type RatingKey = (typeof RATING_KEYS)[number]
export const RATING_LABELS: Record<RatingKey, string> = {
  confidence: 'Confidence',
  discipline: 'Discipline',
  fitness: 'Fitness',
  mentalWellbeing: 'Mental wellbeing',
  focus: 'Focus',
}
export type Ratings = Partial<Record<RatingKey, number | null>> & { custom?: { label: string; value: number | null }[] }

export const MEASUREMENTS = [
  { key: 'waistCm', label: 'Waist' },
  { key: 'chestCm', label: 'Chest' },
  { key: 'hipsCm', label: 'Hips' },
  { key: 'armCm', label: 'Arm' },
] as const
export type MeasurementKey = (typeof MEASUREMENTS)[number]['key']
export type MeasurementsForm = Record<MeasurementKey, string>
export const EMPTY_MEASUREMENTS: MeasurementsForm = { waistCm: '', chestCm: '', hipsCm: '', armCm: '' }

export const FOCUS_AREAS = [
  { value: 'physical', label: 'Physical' },
  { value: 'mental', label: 'Mental' },
  { value: 'learning', label: 'Learning' },
  { value: 'finances', label: 'Finances' },
] as const

export const END_REASONS = ['goal reached', 'too busy', 'health', 'lost motivation', 'starting a new plan', 'other'] as const
export type EndReason = (typeof END_REASONS)[number]
export const END_REASON_LABELS: Record<EndReason, string> = {
  'goal reached': 'I reached my goal',
  'too busy': 'Too busy right now',
  health: 'Health reasons',
  'lost motivation': 'Lost motivation',
  'starting a new plan': 'Starting a new plan',
  other: 'Something else',
}

export type Photo = { fileId: string; mimeType: string | null; size: number | null; uploadedAt: string | null }
export type Snapshot = {
  date: string | null
  weightKg: number | null
  waistCm: number | null
  chestCm: number | null
  hipsCm: number | null
  armCm: number | null
  ratings: Ratings
  habits: string[]
  text: string
  photos: Photo[]
  skipped: boolean
}

export type ProgramClock = {
  dayNumber: number
  daysLeft: number
  startsIn: number
  plannedEndDate: string
  phase: 'upcoming' | 'running' | 'finished'
  percent: number
}

export type Program = {
  id: string
  name: string
  lengthDays: number
  startDate: string
  plannedEndDate: string
  status: ProgramStatus
  endedOn: string | null
  endedOnDay: number | null
  endedAt: string | null
  endReason: EndReason | null
  endNote: string
  migrated: boolean
  baseline: Snapshot | null
  goals: { goalWeightKg: number | null; ratings: Ratings; habits: string[]; focusAreas: string[]; notes: string }
  plan: {
    waterMl: number | null
    calorieTarget: number | null
    sleepHours: number | null
    workoutsPerWeek: number | null
    learningMinutes: number | null
    customHabits: { id: string; label: string }[]
  }
  midpoint: Snapshot | null
  final: Snapshot | null
  clock: ProgramClock
  dueCheckIn: 'midpoint' | 'final' | null
  canUndoEnd: boolean
  createdAt: string | null
}

export type ActiveProgramResponse = { today: string; program: Program | null; latestEnded: Program | null }

/** What the server takes for "Where I am now" and each check-in */
export type SnapshotInput = {
  weightKg?: number | null
  waistCm?: number | null
  chestCm?: number | null
  hipsCm?: number | null
  armCm?: number | null
  ratings: Ratings
  habits: string[]
  text?: string | null
}

export type ProgramInput = {
  name: string
  lengthDays: number
  startDate: string
  baseline: SnapshotInput
  goals: { goalWeightKg?: number | null; ratings: Ratings; habits: string[]; focusAreas: string[]; notes?: string | null }
  plan: {
    waterMl?: number | null
    calorieTarget?: number | null
    sleepHours?: number | null
    workoutsPerWeek?: number | null
    learningMinutes?: number | null
    customHabits: string[]
  }
}

// ---------- Day maths (same rules as the server) ----------

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/** dayNumber = days since start + 1; daysLeft = length − (dayNumber − 1). */
export function programClock(startDate: string, lengthDays: number, today: string): ProgramClock {
  const elapsed = daysBetween(startDate, today) + 1
  const plannedEndDate = addDays(startDate, lengthDays - 1)
  if (elapsed < 1) return { dayNumber: 0, daysLeft: lengthDays, startsIn: 1 - elapsed, plannedEndDate, phase: 'upcoming', percent: 0 }
  if (elapsed > lengthDays) return { dayNumber: lengthDays, daysLeft: 0, startsIn: 0, plannedEndDate, phase: 'finished', percent: 100 }
  return { dayNumber: elapsed, daysLeft: lengthDays - (elapsed - 1), startsIn: 0, plannedEndDate, phase: 'running', percent: Math.round(((elapsed - 1) / lengthDays) * 100) }
}

export const daysLeftLabel = (n: number) => (n === 1 ? 'day left' : 'days left')

/** One sentence for screen readers: "87 days left in your 100-day transformation: day 14 of 100." */
export function countdownSentence(p: Pick<Program, 'name' | 'startDate' | 'lengthDays'>, today: string): string {
  const c = programClock(p.startDate, p.lengthDays, today)
  if (c.phase === 'upcoming') return `${p.name} starts in ${c.startsIn} ${c.startsIn === 1 ? 'day' : 'days'}, on ${formatLongDate(p.startDate)}.`
  if (c.phase === 'finished') return `${p.name}: completed, all ${p.lengthDays} days.`
  return `${c.daysLeft} ${daysLeftLabel(c.daysLeft)} in ${p.name}: day ${c.dayNumber} of ${p.lengthDays}.`
}


/** "Program ended on day 37" / "Completed all 100 days" */
export function endedLabel(p: Program): string {
  if (p.status === 'ended_early') return `Program ended on day ${p.endedOnDay}`
  if (p.status === 'completed') return `Completed all ${p.lengthDays} days`
  return `${p.name} · not finished`
}

// ---------- Photos ----------

/** Uploads one (already compressed) photo to the baseline or a check-in. */
export function uploadProgramPhoto(programId: string, slot: 'baseline' | 'midpoint' | 'final', file: Blob, filename: string): Promise<Program> {
  const form = new FormData()
  form.append('files', file, filename)
  return fetch(`/api/programs/${programId}/photos/${slot}`, { method: 'POST', credentials: 'include', body: form }).then(async (res) => {
    const body = (await res.json().catch(() => null)) as { program?: Program; message?: string } | null
    if (!res.ok || !body?.program) throw new Error(body?.message ?? `Upload failed (${res.status})`)
    return body.program
  })
}

export const photoUrl = (fileId: string) => `/api/program-photos/${fileId}`

/** Numbers from text inputs: '' → null. */
export const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v.replace(',', '.')))

// ---------- Progress (GET /api/programs/:id/progress) ----------

export type TargetKey = 'water' | 'calories' | 'sleep' | 'workout' | 'learning'
export const TARGET_LABELS: Record<TargetKey, string> = { water: 'Water', calories: 'Calories', sleep: 'Sleep', workout: 'Workout', learning: 'Learning' }

export type ProgramWeekStats = {
  week: number
  from: string
  to: string
  days: number
  partial: boolean
  daysLogged: number
  avgOverall: number | null
  avgMood: number | null
  workouts: number
  workoutsTargetMet: boolean | null
  learningMinutes: number
  avgSleep: number | null
  weightKg: number | null
  targetsHit: number
  targetsPossible: number
}

export type CompareRow = { key: string; label: string; before: number | null; goal: number | null; latest: number | null; change: number | null; progress: number | null }

export type ProgramProgress = {
  range: { from: string; to: string; days: number; partial: boolean }
  stats: {
    daysCompleted: number
    daysLogged: number
    consistency: number
    totals: { workouts: number; learningHours: number; waterLitres: number; avgSleep: number | null; avgMood: number | null; avgOverall: number | null }
    streaks: { longest: number; current: number }
    bestWeek: { week: number; avgOverall: number | null; partial: boolean } | null
    latestWeightKg: number | null
    weeks: ProgramWeekStats[]
    habits: { id: string; label: string; daysDone: number; percent: number }[]
    targetDays: { date: string; logged: boolean; hit: Partial<Record<TargetKey, boolean>> }[]
  }
  latest: { weightKg: number | null; source: 'final' | 'midpoint' | 'entries' | null }
  weight: { before: number | null; goal: number | null; latest: number | null; change: number | null; progress: number | null }
  ratings: CompareRow[]
  measurements: { key: MeasurementKey; before: number | null; latest: number | null; change: number | null }[]
}

/** A rating row's name: the five built-in ones by label, custom ones as typed. */
export const ratingLabel = (row: Pick<CompareRow, 'key' | 'label'>) => (row.key in RATING_LABELS ? RATING_LABELS[row.key as RatingKey] : row.label)

// ---------- Report (GET /api/programs/:id/report) ----------

export type ProgramReport = ProgramProgress & {
  title: string
  status: ProgramStatus
  name: string
  lengthDays: number
  startDate: string
  endedOn: string | null
  endedOnDay: number | null
  endReason: EndReason | null
  improvements: string[]
  recurringPurposes: { text: string; days: number }[]
  topValues: { value: string; days: number }[]
  reflection: string
  whyText: string
  photos: { before: string[]; after: string[]; afterFrom: 'final' | 'midpoint' | null }
  /** A short encouraging summary from the AI, from numbers only (null when the AI is off) */
  aiSummary?: string | null
}
