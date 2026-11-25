// How an Apple Health sync is merged into a day's entry. Pure functions, so the rules are easy to test.
//
// Only sleep comes from the watch. Steps, active calories, exercise, workouts and weight are entered
// by hand on the Today page, and a sync ignores them (see validation/healthSyncSchema.ts).
//
// - sleep (from sleepSamples): the night is always stored (stages, bedtime, wake time, our score).
//   sleepHours is set from it, and the calculated score fills the "Sleep score", unless you entered
//   hours or a score yourself (source "manual"): a sync never overwrites what you typed.
// - sleepHours (sent on its own, without samples): only filled in when the day has no hours yet.
import { type HealthSyncField } from "../models/DailyEntry";
import type { HealthSyncInput } from "../validation/healthSyncSchema";
import { sleepHoursFrom, type NightSummary, type SleepScore } from "./sleep";
import { sleepScoreAfterSync, type SleepScoreSource } from "./sleepScoreField";

/** A night's sleep as stored on the entry. */
export type StoredSleep = NightSummary & SleepScore & { source: "watch" };

/** The parts of an existing entry the merge looks at (null when the day has no entry yet). */
export type MergeTarget = {
  sleepHours?: number | null;
  sleepHoursSource?: "watch" | "manual" | null;
  sleepScoreValue?: number | null;
  sleepScoreSource?: SleepScoreSource | null;
} | null;

export type MergePlan = {
  /** Fields to $set on the entry, including healthSync. */
  set: Record<string, unknown>;
  /** Fields this sync changed. */
  updatedFields: HealthSyncField[];
  /** Fields that were sent but kept: the day already had hours you entered yourself. */
  keptFields: HealthSyncField[];
};

export function planHealthMerge(
  existing: MergeTarget,
  input: Pick<HealthSyncInput, "sleepHours">,
  syncedAt: Date,
  sleep: StoredSleep | null = null,
): MergePlan {
  const set: Record<string, unknown> = {};
  const updatedFields: HealthSyncField[] = [];
  const keptFields: HealthSyncField[] = [];
  const manualHours = existing?.sleepHoursSource === "manual";

  if (sleep) {
    // The watch's night is kept for the stages and timings even when your own numbers win
    set.sleep = sleep;
    if (manualHours) {
      keptFields.push("sleepHours");
    } else {
      set.sleepHours = sleepHoursFrom(sleep.totalSleepMin);
      set.sleepHoursSource = "watch";
      updatedFields.push("sleepHours");
    }
    Object.assign(set, sleepScoreAfterSync(existing, sleep.score));
  } else if (input.sleepHours !== undefined) {
    if (existing?.sleepHours == null) {
      set.sleepHours = input.sleepHours;
      set.sleepHoursSource = "watch";
      updatedFields.push("sleepHours");
    } else {
      keptFields.push("sleepHours");
    }
  }

  if (updatedFields.length > 0 || "sleep" in set) {
    set.healthSync = { source: "apple-health", syncedAt, fields: updatedFields };
  }
  return { set, updatedFields, keptFields };
}
