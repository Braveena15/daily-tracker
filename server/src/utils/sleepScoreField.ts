// The day's "Sleep score" field (sleepScoreValue) and where it came from (sleepScoreSource).
//
// - "auto": Daily Tracker's calculated score (sleep.score). A sync refreshes it.
// - "manual": typed in by you (e.g. Apple's own score). A sync never overwrites it.
// Clearing the field goes back to the calculated score.
// Pure functions, so the rules are easy to test.
import { SLEEP_SCORE_SOURCES } from "../models/DailyEntry";

export type SleepScoreSource = (typeof SLEEP_SCORE_SOURCES)[number];

export type SleepScoreState = {
  sleepScoreValue?: number | null;
  sleepScoreSource?: SleepScoreSource | null;
  sleep?: { score?: number | null } | null;
} | null;

/** What to $set / $unset for the field. */
export type SleepScoreUpdate = { set: Record<string, unknown>; unset: string[] };

/** After a sync calculated `calculated` for the day. */
export function sleepScoreAfterSync(existing: SleepScoreState, calculated: number): Record<string, unknown> {
  if (existing?.sleepScoreSource === "manual") return {};
  return { sleepScoreValue: calculated, sleepScoreSource: "auto" };
}

/** After a check-in save where the field held `value` (null/undefined when cleared). */
export function sleepScoreAfterSave(existing: SleepScoreState, value: number | null | undefined): SleepScoreUpdate {
  if (value == null) {
    const calculated = existing?.sleep?.score;
    if (calculated != null) return { set: { sleepScoreValue: calculated, sleepScoreSource: "auto" }, unset: [] };
    return { set: {}, unset: ["sleepScoreValue", "sleepScoreSource"] };
  }
  // The form sends the pre-filled value back; an unchanged value keeps its source
  if (existing?.sleepScoreValue === value && existing.sleepScoreSource) {
    return { set: { sleepScoreValue: value, sleepScoreSource: existing.sleepScoreSource }, unset: [] };
  }
  return { set: { sleepScoreValue: value, sleepScoreSource: "manual" }, unset: [] };
}
