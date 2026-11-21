// How an Apple Health sync is merged into a day's entry. Pure functions, so the rules are easy to test.
//
// - steps, activeCalories: a day's totals only grow, so the stored value is only replaced when the
//   synced one is HIGHER (or nothing is stored yet). A lower value is reported as kept. Typing a value
//   on the Today page always replaces it, so a wrong number can be fixed.
// - Whenever steps or activeCalories change, a snapshot { time, steps, activeCalories } is added to
//   healthSnapshots, for the "how my day progressed" charts.
// - restingCalories, exerciseMinutes: overwritten (the watch is the source of truth).
// - steps: when stepsWatch and/or stepsPhone are sent, the watch count is used if it's above 0, otherwise
//   the phone count (watch off), and "steps" is ignored.
// - activeCalories: 0 means the watch wasn't worn, so it's skipped.
// - weightKg, sleepHours: only filled in when the day doesn't have them yet (manual entries win).
// - sleep (from sleepSamples): stored, and sleepHours is overwritten from it — the watch's
//   measured sleep is more accurate than a typed guess. Its score fills the "Sleep score" field unless
//   you typed one in yourself (see utils/sleepScoreField.ts).
// - workouts: the day's previous watch workouts are replaced by the new ones, so syncing twice
//   doesn't add them twice. A workout synced again (same type and minutes) keeps its id and time.
//   Manual workouts are never touched.
import { Types } from "mongoose";
import { ENTRY_LIMITS, type HealthSyncField, type WorkoutSource } from "../models/DailyEntry";
import type { HealthSyncInput } from "../validation/healthSyncSchema";
import { sleepHoursFrom, type NightSummary, type SleepScore } from "./sleep";
import { sleepScoreAfterSync, type SleepScoreSource } from "./sleepScoreField";

/** A night's sleep as stored on the entry. */
export type StoredSleep = NightSummary & SleepScore & { source: "watch" };

export type StoredWorkout = {
  _id?: unknown;
  loggedAt?: Date | string | null;
  type: string;
  durationMin: number;
  notes?: string | null;
  source?: WorkoutSource | null;
  calories?: number | null;
};

/** The parts of an existing entry the merge looks at (null when the day has no entry yet). */
export type MergeTarget = {
  steps?: number | null;
  activeCalories?: number | null;
  weightKg?: number | null;
  sleepHours?: number | null;
  workouts?: StoredWorkout[] | null;
  healthSync?: { fields?: string[] | null } | null;
  sleepScoreValue?: number | null;
  sleepScoreSource?: SleepScoreSource | null;
} | null;

export const INCREASE_ONLY_FIELDS = ["activeCalories", "steps"] as const;
export const OVERWRITE_FIELDS = ["restingCalories", "exerciseMinutes"] as const;
export const FILL_IF_EMPTY_FIELDS = ["weightKg", "sleepHours"] as const;

export type MergePlan = {
  /** Fields to $set on the entry, including healthSync. */
  set: Record<string, unknown>;
  /** Fields this sync changed, in a stable order. */
  updatedFields: HealthSyncField[];
  /** Fields that were sent but kept: the day already had a (manual) value, or a higher total. */
  keptFields: HealthSyncField[];
  /** A point for healthSnapshots when steps or activeCalories changed, otherwise null. */
  snapshot: HealthSnapshot | null;
};

export type HealthSnapshot = { time: Date; steps?: number; activeCalories?: number };

const isWatch = (w: StoredWorkout) => w.source === "watch";

export function planHealthMerge(
  existing: MergeTarget,
  input: HealthSyncInput,
  syncedAt: Date,
  sleep: StoredSleep | null = null,
): MergePlan {
  const set: Record<string, unknown> = {};
  const updatedFields: HealthSyncField[] = [];
  const keptFields: HealthSyncField[] = [];

  for (const field of INCREASE_ONLY_FIELDS) {
    const value = field === "steps" ? syncedSteps(input) : input[field];
    if (value === undefined) continue;
    if (field === "activeCalories" && value === 0) continue;
    const stored = existing?.[field];
    if (stored == null || value > stored) {
      set[field] = value;
      updatedFields.push(field);
    } else {
      keptFields.push(field);
    }
  }

  for (const field of OVERWRITE_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    set[field] = value;
    updatedFields.push(field);
  }

  for (const field of FILL_IF_EMPTY_FIELDS) {
    if (field === "sleepHours" && sleep) {
      set.sleep = sleep;
      set.sleepHours = sleepHoursFrom(sleep.totalSleepMin);
      Object.assign(set, sleepScoreAfterSync(existing, sleep.score));
      updatedFields.push("sleepHours");
      continue;
    }
    const value = input[field];
    if (value === undefined) continue;
    if (existing?.[field] == null) {
      set[field] = value;
      updatedFields.push(field);
    } else {
      keptFields.push(field);
    }
  }

  if (input.workouts !== undefined) {
    const manual = (existing?.workouts ?? []).filter((w) => !isWatch(w));
    // A workout synced again keeps its id and time, so it doesn't jump around the timeline
    const previous = (existing?.workouts ?? []).filter(isWatch);
    const fromWatch: StoredWorkout[] = input.workouts.map((w) => {
      const matchIndex = previous.findIndex((p) => p.type === w.type && p.durationMin === w.durationMin);
      const match = matchIndex >= 0 ? previous.splice(matchIndex, 1)[0] : undefined;
      return {
        _id: match?._id ?? new Types.ObjectId(),
        loggedAt: w.startTime ?? match?.loggedAt ?? syncedAt,
        type: w.type,
        durationMin: w.durationMin,
        source: "watch",
        ...(w.calories !== undefined && { calories: w.calories }),
      };
    });
    // Manual workouts first; the total stays within what the check-in form accepts
    set.workouts = [...manual, ...fromWatch].slice(0, ENTRY_LIMITS.listItems);
    updatedFields.push("workouts");
  }

  // Fields still holding watch values: the ones from earlier syncs plus the ones from this one
  const fields = new Set<string>([...(existing?.healthSync?.fields ?? []), ...updatedFields]);
  set.healthSync = { source: "apple-health", syncedAt, fields: [...fields] };

  const changedTotals = INCREASE_ONLY_FIELDS.filter((f) => f in set);
  const snapshot: HealthSnapshot | null =
    changedTotals.length === 0
      ? null
      : {
          time: syncedAt,
          ...Object.fromEntries(
            INCREASE_ONLY_FIELDS.flatMap((f) => {
              const value = (set[f] as number | undefined) ?? existing?.[f];
              return value == null ? [] : [[f, value]];
            }),
          ),
        };

  return { set, updatedFields, keptFields, snapshot };
}

/**
 * The steps to store. Prefers the watch: stepsWatch when it's above 0, otherwise stepsPhone (the watch
 * was off), otherwise stepsWatch's 0. Plain steps is only used when neither is sent.
 */
export function syncedSteps(input: Pick<HealthSyncInput, "steps" | "stepsWatch" | "stepsPhone">): number | undefined {
  const { stepsWatch, stepsPhone } = input;
  if (stepsWatch !== undefined && stepsWatch > 0) return stepsWatch;
  if (stepsPhone !== undefined) return stepsPhone;
  if (stepsWatch !== undefined) return stepsWatch;
  return input.steps;
}

/**
 * After a manual save, the watch fields whose value is unchanged. A field you edited by hand
 * loses its ⌚ mark. Workouts are marked one by one (source: "watch"), so they're handled separately.
 */
export function fieldsStillFromWatch(
  marked: readonly string[],
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  return marked.filter((field) => !CHECKIN_EDITABLE.has(field) || (before[field] ?? null) === (after[field] ?? null));
}

// Watch fields that the Today page can also change
const CHECKIN_EDITABLE = new Set<string>(["activeCalories", "steps", "weightKg"]);
