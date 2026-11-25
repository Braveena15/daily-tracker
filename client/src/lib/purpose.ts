// The day's purposes, matching the server's /api/entries/:date/purposes… and /api/purpose/days routes.
// A day has up to 5 purposes, each with its own focus values, up to 5 intentions and an evening
// rating, plus one evening note for the whole day.
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
  /** "How well did I live this purpose today?" 1–5, null until rated */
  rating: number | null
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
  /** Across every rated purpose */
  avgRating: number | null
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
}
export type PurposeVersion = { statement: string; coreValues: string[]; goals: { title: string; why: string }[]; savedAt: string }
/** current: the saved purpose (null until something is saved); history: earlier versions, newest first */
export type PurposeHistoryResponse = { current: PurposeVersion | null; history: PurposeVersion[] }

export const MAX_INTENTIONS = 5
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
  return { purposes: d.purposes.length, intentions: intentions.length, done: intentions.filter((i) => i.done).length }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "3 purposes · 5 of 8 intentions done" (the intentions part only when there are some). */
export function daySummary(d: Pick<DayPurposes, 'purposes'>): string {
  const c = dayCounts(d)
  return [plural(c.purposes, 'purpose'), c.intentions > 0 && `${c.done} of ${plural(c.intentions, 'intention')} done`].filter(Boolean).join(' · ')
}

/** "3 purposes · 5/8" for small cards. */
export function shortDaySummary(d: Pick<DayPurposes, 'purposes'>): string {
  const c = dayCounts(d)
  return [plural(c.purposes, 'purpose'), c.intentions > 0 && `${c.done}/${c.intentions}`].filter(Boolean).join(' · ')
}

/** Same text, ignoring case and surrounding spaces (e.g. a goal already added as an intention). */
export const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** "Sat, Nov 21 · 11:55" in the app's timezone. */
export const savedAtLabel = (iso: string) => `${journeyDate(dayOf(iso))} · ${timeOf(iso)}`
