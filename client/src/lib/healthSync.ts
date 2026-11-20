// Apple Health sync, matching the server's /api/health-sync routes.
import { APP_TIMEZONE, addDays, formatDate, relativeDay, todayInTimezone } from './dates'

export type SyncStatus = { hasToken: boolean; createdAt: string | null; lastHealthSyncAt: string | null }
export type NewTokenResponse = { token: string; createdAt: string }

/** The calendar day ("YYYY-MM-DD") of a timestamp, in the app's timezone. */
export function dayOf(iso: string): string {
  return todayInTimezone(APP_TIMEZONE, new Date(iso))
}

/** "21:00" in the app's timezone. */
export function timeOf(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

/** "today 21:00", "yesterday 07:15" or "Wed, 18 Nov 21:00". */
export function formatSyncTime(iso: string, today: string = todayInTimezone()): string {
  const day = dayOf(iso)
  const label = day === today || day === addDays(today, -1) ? relativeDay(day, today).toLowerCase() : formatDate(day, today)
  return `${label} ${timeOf(iso)}`
}

/**
 * Where the iOS Shortcut should send its data.
 * In development the API runs on port 4000 of this computer; in production it's this site's own /api.
 */
export function syncEndpoint(location: Pick<Location, 'hostname' | 'origin'> = window.location): string {
  // The Express dev server speaks plain http
  if (import.meta.env.DEV) return `http://${location.hostname}:4000/api/health-sync`
  return `${location.origin}/api/health-sync`
}

export const EXAMPLE_BODY = `{
  "date": "2026-11-20",
  "activeCalories": 512,
  "restingCalories": 1650,
  "steps": 8234,
  "exerciseMinutes": 42,
  "weightKg": 72.4,
  "sleepHours": 7.5,
  "sleepSamples": "2026-11-19T23:05:00+05:30;2026-11-20T01:10:00+05:30;Core\\n2026-11-20T01:10:00+05:30;2026-11-20T02:00:00+05:30;Deep",
  "workouts": [
    { "type": "Running", "durationMin": 30, "calories": 280 }
  ]
}`
