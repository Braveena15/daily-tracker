// Daily entry types, matching the server's /api/entries routes.

export type Workout = { type: string; durationMin: number; notes?: string }
export type Activity = { type: string; durationMin?: number; notes?: string }
export type Learning = { topic: string; details?: string; minutes?: number }

export type EntryInput = {
  mood: number
  energy: number
  sleepHours: number
  weightKg?: number | null
  steps?: number | null
  activeCalories?: number | null
  workouts: Workout[]
  mentalActivities: Activity[]
  outdoorActivities: Activity[]
  goodThings: string[]
  learnings: Learning[]
  presentMoment: string
}

export type DailyEntry = EntryInput & {
  id: string
  date: string
  createdAt: string
  updatedAt: string
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
