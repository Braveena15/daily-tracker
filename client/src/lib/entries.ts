// Daily entry types, matching the server's /api/entries routes.
//
// A day holds a few single values (weight, steps, active calories, sleep) and many timestamped
// entries added through the day: mood check-ins, workouts, good things, learnings…
import type { LucideIcon } from 'lucide-react'
import { BookOpen, Brain, Dumbbell, Feather, GlassWater, Moon, Smile, Sparkles, Sun, Watch } from 'lucide-react'
import type { Tone } from '@/lib/tones'
import type { DailyPurpose } from '@/lib/purpose'

export type WorkoutSource = 'manual' | 'watch'
export type SleepScoreSource = 'auto' | 'manual'

type Stamped = { id: string; loggedAt: string }

export type MoodLog = Stamped & { mood: number; energy: number; note?: string }
// source "watch": added by Apple Health sync, and replaced on the next sync
export type Workout = Stamped & { type: string; durationMin: number; notes?: string; source?: WorkoutSource; calories?: number }
export type Activity = Stamped & { type: string; durationMin?: number; notes?: string }
export type GoodThing = Stamped & { text: string }
export type Learning = Stamped & { topic: string; details?: string; minutes?: number }
export type PresentMoment = Stamped & { text: string }
/** One drink: 50–2000 ml. Not part of the scores. */
export type WaterLog = Stamped & { amountMl: number }

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

export type HealthSnapshot = { time: string; steps?: number; activeCalories?: number }

/** A stored day. Every list is newest first. */
export type DailyEntry = {
  id: string
  date: string
  weightKg?: number | null
  steps?: number | null
  activeCalories?: number | null
  restingCalories?: number | null
  exerciseMinutes?: number | null
  sleepHours?: number | null
  /** Only set by Apple Health sync */
  sleep?: SleepSummary | null
  sleepScoreValue?: number | null
  sleepScoreSource?: SleepScoreSource | null
  /** fields: which values currently come from the watch */
  healthSync?: { source: 'apple-health'; syncedAt: string; fields: HealthSyncField[] } | null
  moodLogs: MoodLog[]
  workouts: Workout[]
  mentalActivities: Activity[]
  outdoorActivities: Activity[]
  goodThings: GoodThing[]
  learnings: Learning[]
  presentMoments: PresentMoment[]
  /** Older days may not have it */
  waterLogs?: WaterLog[]
  /** Today's purpose, decrypted (null when none was set) */
  dailyPurpose?: DailyPurpose | null
  createdAt: string
  updatedAt: string
}

// ---------- Kinds of timestamped entries ----------

/** The URL name of each kind: POST /api/entries/:date/:kind */
export type EntryKind = 'moods' | 'workouts' | 'mental' | 'outdoor' | 'goodThings' | 'learnings' | 'presentMoments' | 'water'

export const KIND_FIELD = {
  moods: 'moodLogs',
  workouts: 'workouts',
  mental: 'mentalActivities',
  outdoor: 'outdoorActivities',
  goodThings: 'goodThings',
  learnings: 'learnings',
  presentMoments: 'presentMoments',
  water: 'waterLogs',
} as const satisfies Record<EntryKind, keyof DailyEntry>

export type TimelineKind = EntryKind | 'sync' | 'sleep'
export type TimelineItem = { time: string; kind: TimelineKind; summary: string; id?: string }

export const TIMELINE_STYLE: Record<TimelineKind, { label: string; icon: LucideIcon; tone: Tone }> = {
  moods: { label: 'Mood check-in', icon: Smile, tone: 'mental' },
  workouts: { label: 'Workout', icon: Dumbbell, tone: 'physical' },
  mental: { label: 'Mental strength', icon: Brain, tone: 'mental' },
  outdoor: { label: 'Outdoor', icon: Sun, tone: 'outdoor' },
  goodThings: { label: 'Good thing', icon: Sparkles, tone: 'primary' },
  learnings: { label: 'Learning', icon: BookOpen, tone: 'learning' },
  presentMoments: { label: 'Present moment', icon: Feather, tone: 'primary' },
  water: { label: 'Water', icon: GlassWater, tone: 'outdoor' },
  sync: { label: 'Apple Watch sync', icon: Watch, tone: 'physical' },
  sleep: { label: 'Sleep', icon: Moon, tone: 'mental' },
}

// ---------- API responses ----------

/** GET /api/entries/:date, and every change to a day */
export type DayResponse = {
  date: string
  entry: DailyEntry | null
  /** True once you've added anything yourself (not just synced from the watch) */
  logged: boolean
  timeline: TimelineItem[]
  healthSnapshots: HealthSnapshot[]
  /** The day's water in ml */
  waterTotalMl?: number
  profileWeightUpdated?: boolean
}

export type DailyInput = { weightKg?: number | null; steps?: number | null; activeCalories?: number | null }
export type EntriesListResponse = { from: string; to: string; journeyStartDate: string; entries: DailyEntry[] }
/** Counting only days since the journey started */
export type StreakResponse = { today: string; journeyStartDate: string; current: number; longest: number }

// ---------- Mood ----------

export type DayMood = { count: number; avg: number; min: number; max: number; avgEnergy: number }

const round1 = (n: number) => Math.round(n * 10) / 10

/** The day's check-ins summed up, or null without any. */
export function dayMood(logs: MoodLog[] | undefined): DayMood | null {
  if (!logs || logs.length === 0) return null
  const moods = logs.map((m) => m.mood)
  return {
    count: logs.length,
    avg: round1(moods.reduce((s, m) => s + m, 0) / logs.length),
    min: Math.min(...moods),
    max: Math.max(...moods),
    avgEnergy: round1(logs.reduce((s, m) => s + m.energy, 0) / logs.length),
  }
}

export const WORKOUT_CHIPS = ['Cycling', 'Gym', 'Running', 'Walking', 'Swimming', 'Home workout']
export const MENTAL_CHIPS = ['Meditation', 'Journaling', 'Reading', 'Breathing', 'Cold shower', 'Gratitude']
export const OUTDOOR_CHIPS = ['Walk', 'Cycling', 'Sunlight', 'Nature', 'Sport']
