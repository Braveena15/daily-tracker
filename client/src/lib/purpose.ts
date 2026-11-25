// "What matters to me today", matching the server's /api/entries/:date/purposes… and /api/purpose/*
// routes. A day has up to 5, each with how strongly it's felt (intensity 0–10) and optional focus
// values and intentions, plus one evening note for the whole day.
import { dayOf, timeOf } from '@/lib/healthSync'
import { journeyDate } from '@/lib/journey'

export type Intention = { id: string; text: string; done: boolean; doneAt: string | null }

export type DayPurpose = {
  id: string
  text: string
  /** Up to 3 of the user's core values */
  focusValues: string[]
  /** Up to 5 */
  intentions: Intention[]
  /** "How strongly do I feel this?" 0–10; null only on purposes from before intensity existed */
  intensity: number | null
  createdAt: string | null
  updatedAt: string | null
}

export type DayPurposes = {
  /** In the order they were added (up to 5) */
  purposes: DayPurpose[]
  /** One evening note for the whole day ("" when none) */
  reflectionNote: string
}

export type PurposeDay = DayPurposes & { date: string }

export type PurposeStats = {
  daysWithPurpose: number
  purposesTotal: number
  intentionsTotal: number
  intentionsDone: number
  intentionsDonePercent: number | null
  /** Across every purpose with an intensity */
  avgIntensity: number | null
  topValues: { value: string; days: number }[]
}

export type PurposeDaysResponse = {
  from: string
  to: string
  /** Today in Asia/Colombo, as the server sees it */
  todayDate: string
  journeyStartDate: string
  /** Every day with a purpose, newest first */
  days: PurposeDay[]
  /** Today's purposes (editable until midnight), or null */
  today: PurposeDay | null
  /** Earlier days, newest first (locked) */
  past: PurposeDay[]
  /** No daily purposes at all */
  isEmpty: boolean
  /** Today has no purpose yet */
  canSetToday: boolean
  stats: PurposeStats
  /** What keeps coming back, most frequent first */
  recurring: RecurringPurpose[]
}

export type RecurringPurpose = {
  /** The most recent wording */
  text: string
  /** Days it appeared on */
  count: number
  avgIntensity: number | null
  lastDate: string
  /** Its intensity on each of the last 30 days (oldest first), null on days it didn't appear */
  last30: (number | null)[]
}
export type PurposeVersion = { statement: string; coreValues: string[]; goals: { title: string; why: string }[]; savedAt: string }
/** current: the saved purpose (null until something is saved); history: earlier versions, newest first */
export type PurposeHistoryResponse = { current: PurposeVersion | null; history: PurposeVersion[] }

export const MAX_INTENTIONS = 5
export const DEFAULT_INTENSITY = 5
export const MAX_PURPOSES = 5
export const MAX_FOCUS_VALUES = 3

/** The day's purposes from a stored entry (older responses may not have them). */
export const dayPurposesOf = (entry: { dailyPurposes?: DayPurpose[]; dailyReflectionNote?: string } | null | undefined): DayPurposes => ({
  purposes: entry?.dailyPurposes ?? [],
  reflectionNote: entry?.dailyReflectionNote ?? '',
})

/** Counts for a day's summary. */
export function dayCounts(d: Pick<DayPurposes, 'purposes'>) {
  const intentions = d.purposes.flatMap((p) => p.intentions)
  const intensities = d.purposes.flatMap((p) => (p.intensity === null ? [] : [p.intensity]))
  return {
    purposes: d.purposes.length,
    intentions: intentions.length,
    done: intentions.filter((i) => i.done).length,
    /** 1 decimal, null without intensities */
    avgIntensity: intensities.length ? Math.round((intensities.reduce((s, n) => s + n, 0) / intensities.length) * 10) / 10 : null,
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "2 things · avg intensity 7/10" */
export function daySummary(d: Pick<DayPurposes, 'purposes'>): string {
  const c = dayCounts(d)
  return [plural(c.purposes, 'thing'), c.avgIntensity !== null && `avg intensity ${c.avgIntensity}/10`].filter(Boolean).join(' · ')
}

/** "2 things · avg 7/10" for small cards. */
export function shortDaySummary(d: Pick<DayPurposes, 'purposes'>): string {
  const c = dayCounts(d)
  return [plural(c.purposes, 'thing'), c.avgIntensity !== null && `avg ${c.avgIntensity}/10`].filter(Boolean).join(' · ')
}

/** The same wording, ignoring case and extra spaces (same rule as the server). */
export const normalizePurpose = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase()

/** Earlier wordings that match what's typed so far, leaving out an exact match. */
export function matchSuggestions(suggestions: string[], typed: string, limit = 5): string[] {
  const q = normalizePurpose(typed)
  if (!q) return []
  return suggestions.filter((s) => normalizePurpose(s).includes(q) && normalizePurpose(s) !== q).slice(0, limit)
}

/** Same text, ignoring case and surrounding spaces (e.g. a goal already added as an intention). */
export const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** "Sat, Nov 21 · 11:55" in the app's timezone. */
export const savedAtLabel = (iso: string) => `${journeyDate(dayOf(iso))} · ${timeOf(iso)}`
