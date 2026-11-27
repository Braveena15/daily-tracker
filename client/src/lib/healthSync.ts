// Apple Health sync, matching the server's /api/health-sync routes.
import { APP_TIMEZONE, addDays, formatDate, relativeDay, todayInTimezone } from './dates'

export type SyncStatus = {
  hasToken: boolean
  createdAt: string | null
  lastHealthSyncAt: string | null
  /** Development only: this computer's LAN IPv4 addresses */
  lanAddresses?: string[]
}
export type SyncTestResponse = { ok: true; hasToken: boolean; lastHealthSyncAt: string | null; serverTime: string }
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

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

export const LAN_HOSTNAME = 'daily-tracker.local'

/**
 * Where the iOS Shortcut should send its data, best first. Production: this site's own /api (https).
 * Development: the API on port 4000 of this computer, by its LAN name and then by each IPv4 address
 * the server reported — never "localhost", which a phone can't reach.
 */
export function syncEndpoints(
  lanAddresses: string[] = [],
  dev: boolean = import.meta.env.DEV,
  origin: string = window.location.origin,
): string[] {
  if (!dev) return [`${origin}/api/health-sync`]
  // The Express dev server speaks plain http
  return [LAN_HOSTNAME, ...lanAddresses].map((host) => `http://${host}:4000/api/health-sync`)
}

export const EXAMPLE_BODY = `{
  "date": "2026-11-20",
  "sleepSamples": "2026-11-19T23:05:00+05:30;2026-11-20T01:10:00+05:30;Core\\n2026-11-20T01:10:00+05:30;2026-11-20T02:00:00+05:30;Deep"
}`
