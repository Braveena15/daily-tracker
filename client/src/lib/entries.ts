// Daily entry types, matching the server's /api/entries routes.
//
// A day holds a few single values (weight, steps, active calories, sleep) and many timestamped
// entries added through the day: mood check-ins, workouts, good things, learnings…
import type { LucideIcon } from 'lucide-react'
import { BookOpen, Brain, Dumbbell, Feather, GlassWater, Moon, Smile, Sparkles, Sun } from 'lucide-react'
import type { Tone } from '@/lib/tones'
import type { DayPurpose } from '@/lib/purpose'

export type WorkoutSource = 'manual' | 'watch'
/** 'auto': calculated from the watch's sleep; 'manual': entered on the Today page */
export type SleepScoreSource = 'auto' | 'manual'
/** Where the day's hours slept came from */
export type SleepHoursSource = 'watch' | 'manual'

type Stamped = { id: string; loggedAt: string }

export type MoodLog = Stamped & { mood: number; energy: number; note?: string }
// source "watch": added by a watch sync on older days (syncs no longer send workouts); editable like any other
export type Workout = Stamped & { type: string; durationMin: number; notes?: string; source?: WorkoutSource; calories?: number }
export type Activity = Stamped & { type: string; durationMin?: number; notes?: string }
export type GoodThing = Stamped & { text: string }
export type Learning = Stamped & { topic: string; details?: string; minutes?: number }
export type PresentMoment = Stamped & { text: string }
/** One drink: 50–2000 ml. Not part of the scores. */
export type WaterLog = Stamped & { amountMl: number }

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

/** A stored day. Every list is newest first. */
export type DailyEntry = {
  id: string
  date: string
  weightKg?: number | null
  /** Entered on the Today page */
  steps?: number | null
  activeCalories?: number | null
  /** From the watch's sleep, or entered on the Sleep card ("manual") */
  sleepHours?: number | null
  sleepHoursSource?: SleepHoursSource | null
  /** The watch's night (stages, timings, our score); only set by a sync */
  sleep?: SleepSummary | null
  sleepScoreValue?: number | null
  sleepScoreSource?: SleepScoreSource | null
  moodLogs: MoodLog[]
  workouts: Workout[]
  mentalActivities: Activity[]
  outdoorActivities: Activity[]
  goodThings: GoodThing[]
  learnings: Learning[]
  presentMoments: PresentMoment[]
  /** Older days may not have it */
  waterLogs?: WaterLog[]
  /** The day's purposes (up to 5), decrypted */
  dailyPurposes?: DayPurpose[]
  /** The day's evening note ("" when none) */
  dailyReflectionNote?: string
  createdAt: string
  updatedAt: string
}

/** The day's own hours and score, when you entered them (each null when the watch's is used). */
export function manualSleep(entry: DailyEntry | null | undefined): { hours: number | null; score: number | null } {
  return {
    hours: entry?.sleepHoursSource === 'manual' ? (entry.sleepHours ?? null) : null,
    score: entry?.sleepScoreSource === 'manual' ? (entry.sleepScoreValue ?? null) : null,
  }
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

export type TimelineKind = EntryKind | 'sleep'
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
  sleep: { label: 'Sleep', icon: Moon, tone: 'mental' },
}

// ---------- API responses ----------

/** GET /api/entries/:date, and every change to a day */
export type DayResponse = {
  date: string
  entry: DailyEntry | null
  /** True once you've added anything yourself (not just sleep from the watch) */
  logged: boolean
  timeline: TimelineItem[]
  /** The day's water in ml */
  waterTotalMl?: number
  profileWeightUpdated?: boolean
}

export type DailyInput = {
  weightKg?: number | null
  steps?: number | null
  activeCalories?: number | null
  /** null goes back to the watch's value for the night, when there is one */
  sleepHours?: number | null
  sleepScoreValue?: number | null
}
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
