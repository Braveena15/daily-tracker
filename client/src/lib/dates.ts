// "YYYY-MM-DD" calendar-date helpers, matching server/src/utils/dates.ts.

export const APP_TIMEZONE = 'Asia/Colombo'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function todayInTimezone(tz: string = APP_TIMEZONE, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function toUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(date: string, days: number): string {
  return new Date(toUtc(date).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Every date from `from` to `to` inclusive, oldest first. */
export function listDates(from: string, to: string): string[] {
  const dates: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d)
  return dates
}

/** e.g. "Wed, 18 Nov" (adds the year if it isn't this year). */
export function formatDate(date: string, today: string = todayInTimezone()): string {
  const sameYear = date.slice(0, 4) === today.slice(0, 4)
  return toUtc(date).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    timeZone: 'UTC',
  })
}

/** "Today", "Yesterday", or a formatted date. */
export function relativeDay(date: string, today: string = todayInTimezone()): string {
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  return formatDate(date, today)
}
