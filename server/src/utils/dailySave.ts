// What PUT /api/entries/:date/daily stores. Pure, so the rules are easy to test.
//
// - weightKg, steps, activeCalories: typed on the Today page; a value replaces, null clears.
// - sleepHours, sleepScoreValue: entered by hand on the Sleep card, saved with source "manual" so a
//   later sync never overwrites them. Clearing one (null) goes back to the watch's value for that
//   night when there is one, or leaves the day without it.
import type { DailyInput } from "../validation/entrySchema";
import { sleepHoursFrom } from "./sleep";

export type WatchNight = { totalSleepMin?: number | null; score?: number | null } | null;

export function planDailySave(body: DailyInput, watch: WatchNight): { $set: Record<string, unknown>; $unset: Record<string, 1> } {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};

  for (const key of ["weightKg", "steps", "activeCalories"] as const) {
    if (body[key] === undefined) continue;
    if (body[key] === null) $unset[key] = 1;
    else $set[key] = body[key];
  }

  if (body.sleepHours !== undefined) {
    if (body.sleepHours !== null) {
      Object.assign($set, { sleepHours: body.sleepHours, sleepHoursSource: "manual" });
    } else if (watch?.totalSleepMin != null) {
      Object.assign($set, { sleepHours: sleepHoursFrom(watch.totalSleepMin), sleepHoursSource: "watch" });
    } else {
      Object.assign($unset, { sleepHours: 1, sleepHoursSource: 1 });
    }
  }

  if (body.sleepScoreValue !== undefined) {
    if (body.sleepScoreValue !== null) {
      Object.assign($set, { sleepScoreValue: body.sleepScoreValue, sleepScoreSource: "manual" });
    } else if (watch?.score != null) {
      Object.assign($set, { sleepScoreValue: watch.score, sleepScoreSource: "auto" });
    } else {
      Object.assign($unset, { sleepScoreValue: 1, sleepScoreSource: 1 });
    }
  }

  return { $set, $unset };
}
