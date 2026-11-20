// Types and helpers for scores, progress charts and the weekly review (server: /api/scores, /api/progress).
import { BookOpen, Brain, Dumbbell, type LucideIcon } from 'lucide-react'
import type { Tone } from '@/lib/tones'
import { toLocalDate } from '@/lib/dates'

export type Area = 'physical' | 'mental' | 'learning'

export const AREAS: { key: Area; label: string; icon: LucideIcon; tone: Tone; chartColor: string; ringClass: string }[] = [
  { key: 'physical', label: 'Physical', icon: Dumbbell, tone: 'physical', chartColor: 'var(--chart-physical)', ringClass: 'stroke-physical' },
  { key: 'mental', label: 'Mental', icon: Brain, tone: 'mental', chartColor: 'var(--chart-mental)', ringClass: 'stroke-mental' },
  { key: 'learning', label: 'Learning', icon: BookOpen, tone: 'learning', chartColor: 'var(--chart-learning)', ringClass: 'stroke-learning' },
]

export type ScoreLine = { label: string; points: number; max: number; reason: string }
export type ScoreResult = { score: number | null; breakdown: ScoreLine[] }

export type DayScoresResponse = {
  date: string
  logged: boolean
  physical: ScoreResult
  mental: ScoreResult
  learning: ScoreResult
  overall: number | null
}

export type ScoreRow = { date: string; physical: number | null; mental: number | null; learning: number | null; overall: number | null }
export type ScoresListResponse = { from: string; to: string; days: ScoreRow[] }

export type WeightResponse = {
  from: string
  to: string
  points: { date: string; weightKg: number | null; averageKg: number | null }[]
  latestKg: number | null
  goalWeightKg: number | null
  journeyStartDate: string
  changeSinceStartKg: number | null
  weeklyChangeKg: number | null
  expectedWeeklyChangeKg: number | null
}

export type DailyKcalResponse = { from: string; to: string; calorieTarget: number | null; days: { date: string; kcal: number | null }[] }

export type JourneyResponse = {
  startDate: string
  endDate: string
  dayNumber: number
  totalDays: number
  daysLogged: number
  percentComplete: number
  complete: boolean
}

export type Insight = { key: string; text: string; daysWith: number; daysWithout: number }
export type InsightsResponse = { daysAnalysed: number; insights: Insight[] }

export type WeekSummary = {
  from: string
  to: string
  daysLogged: number
  avgPhysical: number | null
  avgMental: number | null
  avgLearning: number | null
  avgOverall: number | null
  avgMood: number | null
  avgSleepHours: number | null
  avgSleepScore: number | null
  workouts: number
  workoutMinutes: number
  learningMinutes: number
  avgKcal: number | null
  mealDays: number
  bestDay: { date: string; overall: number } | null
}

export type WeeklyReviewResponse = {
  weekEnding: string
  calorieTarget: number | null
  thisWeek: WeekSummary
  lastWeek: WeekSummary
  differences: Record<
    | 'daysLogged'
    | 'avgPhysical'
    | 'avgMental'
    | 'avgLearning'
    | 'avgOverall'
    | 'avgMood'
    | 'avgSleepHours'
    | 'avgSleepScore'
    | 'workouts'
    | 'workoutMinutes'
    | 'learningMinutes'
    | 'avgKcal',
    number | null
  >
  message: string
}

export type SleepResponse = {
  from: string
  to: string
  days: { date: string; hours: number | null; score: number | null }[]
  avgHours: number | null
  avgScore: number | null
}

/** "19 Nov" — short dates for chart axes. */
export const shortDate = (date: string) => toLocalDate(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/** "Thu 19 Nov" — for tooltips. */
export const tooltipDate = (date: string) =>
  toLocalDate(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

/** A signed number with a real minus sign: +0.4, −1.8, 0. */
export function signed(n: number, digits = 1): string {
  const fixed = Math.abs(n).toFixed(digits)
  if (Number(fixed) === 0) return (0).toFixed(digits)
  return `${n < 0 ? '−' : '+'}${fixed}`
}
