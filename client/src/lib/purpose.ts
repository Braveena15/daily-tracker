// Today's purpose types, matching the server's /api/entries/:date/purpose and /api/purpose/days routes.
import { dayOf, timeOf } from '@/lib/healthSync'
import { journeyDate } from '@/lib/journey'

export type Intention = { id: string; text: string; done: boolean; doneAt: string | null }

export type DailyPurpose = {
  text: string
  /** Up to 3 of the user's core values */
  focusValues: string[]
  /** Up to 5 */
  intentions: Intention[]
  /** "How well did I live my purpose today?" 1–5 */
  reflection: { rating: number; note: string; at: string } | null
  setAt: string | null
  updatedAt: string | null
}

export type PurposeDay = DailyPurpose & { date: string }

export type PurposeStats = {
  daysWithPurpose: number
  intentionsTotal: number
  intentionsDone: number
  intentionsDonePercent: number | null
  avgRating: number | null
  topValues: { value: string; days: number }[]
}

export type PurposeDaysResponse = { from: string; to: string; journeyStartDate: string; days: PurposeDay[]; stats: PurposeStats }
export type PurposeVersion = { statement: string; coreValues: string[]; goals: { title: string; why: string }[]; savedAt: string }
/** current: the saved purpose (null until something is saved); history: earlier versions, newest first */
export type PurposeHistoryResponse = { current: PurposeVersion | null; history: PurposeVersion[] }

export const MAX_INTENTIONS = 5
export const MAX_FOCUS_VALUES = 3

/** "3/4" intentions done, or null without intentions. */
export function intentionsDone(p: Pick<DailyPurpose, 'intentions'> | null | undefined): string | null {
  if (!p || p.intentions.length === 0) return null
  return `${p.intentions.filter((i) => i.done).length}/${p.intentions.length}`
}

/** The first line of the purpose text. */
export const firstLine = (text: string) => text.split('\n')[0]?.trim() ?? ''

/** "★★★★☆" */
export const stars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating)

/** "Sat, Nov 21 · 11:55" in the app's timezone. */
export const savedAtLabel = (iso: string) => `${journeyDate(dayOf(iso))} · ${timeOf(iso)}`
