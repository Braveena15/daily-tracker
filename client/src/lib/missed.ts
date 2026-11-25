// "Not logged · Busy": why a day wasn't logged (server: /api/entries/:date/missed-reason).
// Only today and yesterday can get a reason, and it never counts as logging the day.

export const MISSED_CATEGORIES = ['busy', 'unwell', 'travelling', 'forgot', 'needed a break', 'other'] as const
export type MissedCategory = (typeof MISSED_CATEGORIES)[number]

export type MissedReason = { category: MissedCategory; note: string; createdAt?: string | null }

/** "Needed a break" */
export const missedLabel = (category: string) => category.charAt(0).toUpperCase() + category.slice(1)

/** "Not logged · Busy" (with " — note" when there is one) */
export function notLoggedText(reason: { category: string; note: string } | null | undefined): string {
  if (!reason) return 'Not logged'
  return `Not logged · ${missedLabel(reason.category)}${reason.note ? ` — ${reason.note}` : ''}`
}

/** Remembers that the "you didn't log yesterday" card was closed for that date (this device only). */
export const dismissedKey = (date: string) => `missed-dismissed:${date}`
