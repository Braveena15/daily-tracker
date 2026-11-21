// The journey start date: History, streaks, scores and charts begin on day 1 (see server/src/utils/journey.ts).
import { addDays, toLocalDate } from '@/lib/dates'

/** "Sat, Nov 21" */
export const journeyDate = (date: string) =>
  toLocalDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** Days since the journey started, including today (day 1 → 1). */
export function journeyDayCount(start: string, today: string): number {
  const ms = toLocalDate(today).getTime() - toLocalDate(start).getTime()
  return Math.max(0, Math.round(ms / 86_400_000) + 1)
}

/** The newest `shown` days of the journey, never before the start. */
export function historyRange(start: string, today: string, shown: number) {
  const total = journeyDayCount(start, today)
  const from = addDays(today, -(shown - 1))
  return { from: from < start ? start : from, to: today, total, hasOlder: total > shown }
}
