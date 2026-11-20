// Validation for POST /api/health-sync (sent by an iOS Shortcut).
// Shortcuts often send numbers as text ("8234", "72.4 kg", "1,234", "7,5"), with long decimals,
// or as an empty string when Health has no data, so numbers are coerced and rounded here.
import { z } from "zod";
import { ENTRY_LIMITS as L } from "../models/DailyEntry";
import { addDays, isValidDateString, todayInTimezone } from "../utils/dates";

export const MAX_SYNC_AGE_DAYS = 14;
export const MAX_SYNC_WORKOUTS = 20;

/**
 * Turns what a Shortcut sends into a number.
 * - undefined, null, "" → undefined (field left out)
 * - "8 234", "8,234", "1,234.5" → thousands separators removed
 * - "7,5" → decimal comma
 * - "72.4 kg", "350 kcal" → a trailing unit is ignored
 * Anything else is returned unchanged, so zod reports it as "must be a number".
 */
export function looseNumber(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return value;

  let text = value.trim().replace(/[\s  ]/g, "");
  if (text === "") return undefined;
  text = text.replace(/[a-zA-Z%]+$/, ""); // trailing unit
  if (text.includes(",") && text.includes(".")) text = text.replace(/,/g, "");
  else if (/^-?\d{1,3}(,\d{3})+$/.test(text)) text = text.replace(/,/g, "");
  else text = text.replace(",", ".");

  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text)) return value;
  return Number(text);
}

const roundTo = (decimals: number) => (n: number) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

function numberIn(label: string, min: number, max: number, decimals: number, unit: string) {
  const range = `${label} must be between ${min} and ${max}${unit}`;
  return z
    .number({ error: `${label} must be a number` })
    .transform(roundTo(decimals))
    .pipe(z.number().min(min, range).max(max, range));
}

/** A required number (text is coerced, then rounded to `decimals`). */
function num(label: string, min: number, max: number, decimals: number, unit = "") {
  return z.preprocess(looseNumber, numberIn(label, min, max, decimals, unit));
}

/** Like num(), but missing, null or "" means "not sent". */
function optNum(label: string, min: number, max: number, decimals: number, unit = "") {
  return z.preprocess(looseNumber, numberIn(label, min, max, decimals, unit).optional());
}

const workoutSchema = z.object({
  type: z
    .string({ error: "Each workout needs a type, e.g. \"Running\"" })
    .trim()
    .min(1, "Each workout needs a type, e.g. \"Running\"")
    .max(L.activityName, `Workout type must be ${L.activityName} characters or less`),
  // At least 1 minute after rounding: the app doesn't store 0-minute workouts
  durationMin: num("Workout durationMin", 1, L.minutes.max, 0, " minutes"),
  calories: optNum("Workout calories", L.workoutCalories.min, L.workoutCalories.max, 0, " kcal"),
});

export const healthSyncSchema = z.object({
  // "YYYY-MM-DD". An ISO date-time ("2026-11-20T21:00:00+05:30") is accepted too; only the date part is used.
  date: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim().slice(0, 10)) : v),
    z.string({ error: 'date must be text in "YYYY-MM-DD" format' }).optional(),
  ),
  activeCalories: optNum("activeCalories", L.activeCalories.min, L.activeCalories.max, 0, " kcal"),
  restingCalories: optNum("restingCalories", L.restingCalories.min, L.restingCalories.max, 0, " kcal"),
  steps: optNum("steps", L.steps.min, L.steps.max, 0),
  // Steps counted by the watch and by the phone separately. When either is sent, the larger one is
  // stored as steps and the plain "steps" field is ignored (see planHealthMerge).
  stepsWatch: optNum("stepsWatch", L.steps.min, L.steps.max, 0),
  stepsPhone: optNum("stepsPhone", L.steps.min, L.steps.max, 0),
  exerciseMinutes: optNum("exerciseMinutes", L.minutes.min, L.minutes.max, 0, " minutes"),
  weightKg: optNum("weightKg", L.weightKg.min, L.weightKg.max, 1, " kg"),
  sleepHours: optNum("sleepHours", L.sleepHours.min, L.sleepHours.max, 2, " hours"),
  workouts: z
    .array(workoutSchema, { error: "workouts must be a list" })
    .max(MAX_SYNC_WORKOUTS, `You can sync up to ${MAX_SYNC_WORKOUTS} workouts a day`)
    .optional(),
});

export type HealthSyncInput = z.infer<typeof healthSyncSchema>;

export const HEALTH_SYNC_KEYS = Object.keys(healthSyncSchema.shape) as (keyof HealthSyncInput)[];

/**
 * The day to sync into: today (Asia/Colombo) when no date is given.
 * Throws a readable message for invalid, future or too-old dates.
 */
export function resolveSyncDate(date: string | undefined, today: string = todayInTimezone()): string {
  if (date === undefined) return today;
  if (!isValidDateString(date)) throw new SyncDateError(`date "${date}" must be a real date in YYYY-MM-DD format`);
  if (date > today) throw new SyncDateError(`date ${date} is in the future (today is ${today})`);
  const oldest = addDays(today, -MAX_SYNC_AGE_DAYS);
  if (date < oldest) {
    throw new SyncDateError(`date ${date} is too old: you can sync the last ${MAX_SYNC_AGE_DAYS} days (from ${oldest})`);
  }
  return date;
}

export class SyncDateError extends Error {}
