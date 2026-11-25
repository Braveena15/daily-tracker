// Validation for POST /api/health-sync (sent by an iOS Shortcut).
// Shortcuts often send numbers as text ("8234", "72.4 kg", "1,234", "7,5"), with long decimals,
// or as an empty string when Health has no data, so numbers are coerced and rounded here.
import { z } from "zod";
import { ENTRY_LIMITS as L } from "../models/DailyEntry";
import { addDays, isValidDateString, todayInTimezone } from "../utils/dates";

export const MAX_SYNC_AGE_DAYS = 14;
export const MAX_SLEEP_SAMPLES_LENGTH = 200_000;

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

/** A number (text is coerced, then rounded to `decimals`), where missing, null or "" means "not sent". */
function optNum(label: string, min: number, max: number, decimals: number, unit = "") {
  return z.preprocess(looseNumber, numberIn(label, min, max, decimals, unit).optional());
}

/**
 * The calendar day of a Shortcut's date. A date-time with a UTC offset or "Z" is converted to the
 * Asia/Colombo day ("2026-11-20T19:00:00Z" is 00:30 on the 21st there); anything else uses its
 * first 10 characters, which are already a local "YYYY-MM-DD".
 */
export function syncDay(value: string): string {
  const withOffset = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(value);
  if (withOffset && !Number.isNaN(Date.parse(value))) return todayInTimezone(undefined, new Date(value));
  return value.slice(0, 10);
}

// Only sleep is taken from the watch. Steps, calories, exercise, workouts and weight are entered by hand
// on the Today page, so a Shortcut that still sends them gets them back in "ignoredFields" (no error).
export const healthSyncSchema = z.object({
  // "YYYY-MM-DD". An ISO date-time ("2026-11-20T21:00:00+05:30") is accepted too; only the date part is used.
  date: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : syncDay(v.trim())) : v),
    z.string({ error: 'date must be text in "YYYY-MM-DD" format' }).optional(),
  ),
  sleepHours: optNum("sleepHours", L.sleepHours.min, L.sleepHours.max, 2, " hours"),
  // One sample per line: "startISO;endISO;stage" (see utils/sleep.ts). A list of lines is accepted too.
  sleepSamples: z.preprocess(
    (v) => {
      const text = Array.isArray(v) && v.every((line) => typeof line === "string") ? v.join("\n") : v;
      return typeof text === "string" && text.trim() === "" ? undefined : text;
    },
    z
      .string({ error: 'sleepSamples must be text, one "start;end;stage" sample per line' })
      .max(MAX_SLEEP_SAMPLES_LENGTH, "sleepSamples is too long: send one night at a time")
      .optional(),
  ),
});

/** Fields older Shortcuts send that are now entered by hand instead: accepted, never stored. */
export const IGNORED_SYNC_FIELDS = [
  "steps",
  "stepsWatch",
  "stepsPhone",
  "activeCalories",
  "restingCalories",
  "exerciseMinutes",
  "workouts",
  "weightKg",
] as const;

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
