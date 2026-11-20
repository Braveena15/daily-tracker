// Daily entry types, matching the server's /api/entries routes.

export type WorkoutSource = 'manual' | 'watch'
// source "watch": added by Apple Health sync, and replaced on the next sync
export type Workout = { type: string; durationMin: number; notes?: string; source?: WorkoutSource; calories?: number }
export type Activity = { type: string; durationMin?: number; notes?: string }
export type Learning = { topic: string; details?: string; minutes?: number }

export type EntryInput = {
  mood: number
  energy: number
  sleepHours: number
  weightKg?: number | null
  steps?: number | null
  activeCalories?: number | null
  /** Typed in from the Watch, for comparison */
  appleSleepScore?: number | null
  workouts: Workout[]
  mentalActivities: Activity[]
  outdoorActivities: Activity[]
  goodThings: string[]
  learnings: Learning[]
  presentMoment: string
}

export type HealthSyncField =
  | 'activeCalories'
  | 'restingCalories'
  | 'steps'
  | 'exerciseMinutes'
  | 'weightKg'
  | 'sleepHours'
  | 'workouts'

export type SleepScoreLine = { label: string; points: number; max: number; reason: string }

/** A night from Apple Health sleep samples, with the score Daily Tracker calculated. */
export type SleepSummary = {
  totalSleepMin: number
  deepMin: number
  remMin: number
  coreMin: number
  awakeCount: number
  awakeMin: number
  /** "HH:mm", Asia/Colombo */
  bedtime: string
  wakeTime: string
  score: number
  breakdown: SleepScoreLine[]
  source: 'watch'
}

/**
 * A stored day. Mood, energy and sleep can be missing when the day so far only holds
 * Apple Health data (it was synced before you checked in).
 */
export type DailyEntry = Omit<EntryInput, 'mood' | 'energy' | 'sleepHours'> & {
  id: string
  date: string
  mood?: number | null
  energy?: number | null
  sleepHours?: number | null
  restingCalories?: number | null
  exerciseMinutes?: number | null
  /** Only set by Apple Health sync */
  sleep?: SleepSummary | null
  /** fields: which values currently come from the watch */
  healthSync?: { source: 'apple-health'; syncedAt: string; fields: HealthSyncField[] } | null
  createdAt: string
  updatedAt: string
}

export type CheckedInEntry = DailyEntry & { mood: number; energy: number }

/** True once you've checked in (not just synced from the watch). */
export function isCheckedIn(entry: DailyEntry | null | undefined): entry is CheckedInEntry {
  return entry != null && entry.mood != null && entry.energy != null
}

export type EntryResponse = { date: string; entry: DailyEntry | null }
export type SaveEntryResponse = { date: string; entry: DailyEntry; profileWeightUpdated: boolean }
export type EntriesListResponse = { from: string; to: string; entries: DailyEntry[] }
export type StreakResponse = { today: string; current: number; longest: number }

export const WORKOUT_CHIPS = ['Cycling', 'Gym', 'Running', 'Walking', 'Swimming', 'Home workout']
export const MENTAL_CHIPS = ['Meditation', 'Journaling', 'Reading', 'Breathing', 'Cold shower', 'Gratitude']
export const OUTDOOR_CHIPS = ['Walk', 'Cycling', 'Sunlight', 'Nature', 'Sport']

export function moodEmoji(mood: number): string {
  if (mood <= 2) return '😞'
  if (mood <= 4) return '😕'
  if (mood <= 6) return '😐'
  if (mood <= 8) return '🙂'
  return '😄'
}

export function energyEmoji(energy: number): string {
  if (energy <= 3) return '🪫'
  if (energy <= 6) return '🔋'
  return '⚡'
}
