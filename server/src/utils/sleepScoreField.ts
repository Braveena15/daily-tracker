// The day's "Sleep score" field (sleepScoreValue) and where it came from (sleepScoreSource).
//
// - "auto": Daily Tracker's calculated score (sleep.score). A sync refreshes it.
// - "manual": typed in by hand on older days (e.g. Apple's own score). A sync never overwrites it.
// The Today page no longer has a sleep score input; the field is kept for history.
// Pure functions, so the rules are easy to test.
import { SLEEP_SCORE_SOURCES } from "../models/DailyEntry";

export type SleepScoreSource = (typeof SLEEP_SCORE_SOURCES)[number];

export type SleepScoreState = {
  sleepScoreValue?: number | null;
  sleepScoreSource?: SleepScoreSource | null;
  sleep?: { score?: number | null } | null;
} | null;

/** After a sync calculated `calculated` for the day. */
export function sleepScoreAfterSync(existing: SleepScoreState, calculated: number): Record<string, unknown> {
  if (existing?.sleepScoreSource === "manual") return {};
  return { sleepScoreValue: calculated, sleepScoreSource: "auto" };
}
