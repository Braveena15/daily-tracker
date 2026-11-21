// Clock times ("HH:mm", 24-hour) in the app's timezone, Asia/Colombo — the format <input type="time"> uses.
import { timeInTimezone } from '@/lib/dates'

/** The current time in Asia/Colombo, e.g. "08:15". */
export const nowHHmm = (now: Date = new Date()): string => timeInTimezone(undefined, now)

/** True when "HH:mm" is later than the current minute today. */
export function isFutureTimeToday(time: string, now: Date = new Date()): boolean {
  return time > nowHHmm(now)
}
