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

/** e.g. "Thursday, 19 November". */
export function formatLongDate(date: string): string {
  return toUtc(date).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

/** The hour (0–23) right now in the app's timezone. */
export function hourInTimezone(tz: string = APP_TIMEZONE, now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now)
  return Number(hour) % 24
}

/** "Good morning" / "Good afternoon" / "Good evening". */
export function greeting(hour: number = hourInTimezone()): string {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** "YYYY-MM-DD" → a local Date at midnight (for the calendar picker). */
export function toLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** A local Date → "YYYY-MM-DD" (from the calendar picker). */
export function fromLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
