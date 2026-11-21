// The journey start date: everything before it is hidden from history, streaks, scores and charts
// (never deleted). Pure functions, so the rules are easy to test.
import { addDays, daysBetween } from "./dates";
import { calculateStreaks, type Streaks } from "./streaks";

/** The earliest of some dates ("YYYY-MM-DD"), ignoring missing ones; null when there are none. */
export function earliestDate(dates: readonly (string | null | undefined)[]): string | null {
  const present = dates.filter((d): d is string => typeof d === "string" && d.length > 0).sort();
  return present[0] ?? null;
}

/**
 * The start date to use: the one the user chose, else the day of their first real entry,
 * else today. Never after today.
 */
export function resolveJourneyStart(chosen: string | null | undefined, firstEntry: string | null, today: string): string {
  const start = chosen || firstEntry || today;
  return start > today ? today : start;
}

/** A range's `from`, moved up to the journey start when it begins earlier. */
export const clampFrom = (from: string, start: string): string => (from < start ? start : from);

/** Days since the journey started, including today (day 1 → 1). 0 if it hasn't started. */
export function journeyDayCount(start: string, today: string): number {
  return Math.max(0, daysBetween(start, today) + 1);
}

/** Streaks counting only days on or after the journey start. */
export function streaksSince(dates: string[], start: string, today: string): Streaks {
  return calculateStreaks(
    dates.filter((d) => d >= start),
    today,
  );
}

/**
 * The History page's days: the newest `shown` days of the journey, from the start date up to
 * today. `hasOlder` says whether earlier journey days are left to show.
 */
export function historyRange(start: string, today: string, shown: number): { from: string; to: string; total: number; hasOlder: boolean } {
  const total = journeyDayCount(start, today);
  const from = clampFrom(addDays(today, -(shown - 1)), start);
  return { from, to: today, total, hasOlder: total > shown };
}
