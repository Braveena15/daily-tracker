import { addDays } from "./dates";

export type Streaks = { current: number; longest: number };

/**
 * Streaks of consecutive days that have an entry.
 *
 * - longest: the longest run of back-to-back days ever.
 * - current: the run ending today. If today has no entry yet, the run ending
 *   yesterday still counts, because the day isn't over and the streak can
 *   still continue. If neither today nor yesterday has an entry, it is 0.
 *
 * Dates after `today` are ignored, and duplicates don't matter.
 */
export function calculateStreaks(dates: string[], today: string): Streaks {
  const days = [...new Set(dates)].filter((d) => d <= today).sort();
  const has = new Set(days);

  // Longest: walk through the days in order, counting runs of consecutive dates.
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of days) {
    run = previous !== null && addDays(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  // Current: count backwards from today (or yesterday) while there is an entry.
  let current = 0;
  let cursor = has.has(today) ? today : addDays(today, -1);
  while (has.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  return { current, longest };
}
