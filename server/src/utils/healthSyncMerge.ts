// How an Apple Health sync is merged into a day's entry. Pure functions, so the rules are easy to test.
//
// - activeCalories, restingCalories, steps, exerciseMinutes: overwritten (the watch is the source of truth).
// - weightKg, sleepHours: only filled in when the day doesn't have them yet (manual entries win).
// - workouts: the day's previous watch workouts are replaced by the new ones, so syncing twice
//   doesn't add them twice. Manual workouts are never touched.
import { ENTRY_LIMITS, type HealthSyncField, type WorkoutSource } from "../models/DailyEntry";
import type { HealthSyncInput } from "../validation/healthSyncSchema";

export type StoredWorkout = {
  type: string;
  durationMin: number;
  notes?: string | null;
  source?: WorkoutSource | null;
  calories?: number | null;
};

/** The parts of an existing entry the merge looks at (null when the day has no entry yet). */
export type MergeTarget = {
  weightKg?: number | null;
  sleepHours?: number | null;
  workouts?: StoredWorkout[] | null;
  healthSync?: { fields?: string[] | null } | null;
} | null;

export const OVERWRITE_FIELDS = ["activeCalories", "restingCalories", "steps", "exerciseMinutes"] as const;
export const FILL_IF_EMPTY_FIELDS = ["weightKg", "sleepHours"] as const;

export type MergePlan = {
  /** Fields to $set on the entry, including healthSync. */
  set: Record<string, unknown>;
  /** Fields this sync changed, in a stable order. */
  updatedFields: HealthSyncField[];
  /** Fields that were sent but kept because the day already had a (manual) value. */
  keptFields: HealthSyncField[];
};

const isWatch = (w: StoredWorkout) => w.source === "watch";

export function planHealthMerge(existing: MergeTarget, input: HealthSyncInput, syncedAt: Date): MergePlan {
  const set: Record<string, unknown> = {};
  const updatedFields: HealthSyncField[] = [];
  const keptFields: HealthSyncField[] = [];

  for (const field of OVERWRITE_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    set[field] = value;
    updatedFields.push(field);
  }

  for (const field of FILL_IF_EMPTY_FIELDS) {
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
    const fromWatch: StoredWorkout[] = input.workouts.map((w) => ({
      type: w.type,
      durationMin: w.durationMin,
      source: "watch",
      ...(w.calories !== undefined && { calories: w.calories }),
    }));
    // Manual workouts first; the total stays within what the check-in form accepts
    set.workouts = [...manual, ...fromWatch].slice(0, ENTRY_LIMITS.listItems);
    updatedFields.push("workouts");
  }

  // Fields still holding watch values: the ones from earlier syncs plus the ones from this one
  const fields = new Set<string>([...(existing?.healthSync?.fields ?? []), ...updatedFields]);
  set.healthSync = { source: "apple-health", syncedAt, fields: [...fields] };

  return { set, updatedFields, keptFields };
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

// Watch fields that the check-in form can also change
const CHECKIN_EDITABLE = new Set<string>(["activeCalories", "steps", "weightKg", "sleepHours"]);
