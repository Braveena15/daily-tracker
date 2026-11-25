// Validation for the /api/entries routes. Kept separate from the controller so it can be unit tested.
//
// - PUT  /:date/daily          dailySchema: the day's single values
// - POST /:date/:kind          entrySchemas[kind]: one new timestamped entry
// - PATCH /:date/:kind/:id     entryPatchSchemas[kind]: change some fields of one entry
import { z } from "zod";
import { ENTRY_LIMITS as L } from "../models/DailyEntry";
import type { EntryKind } from "../utils/timeline";
import { parseWaterAmount } from "../utils/water";

function numberIn(label: string, min: number, max: number, unit = "") {
  const range = `${label} must be between ${min} and ${max}${unit}`;
  return z.number({ error: `${label} must be a number` }).min(min, range).max(max, range);
}

function text(label: string, max: number) {
  return z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be ${max} characters or less`);
}

const minutes = (label: string) =>
  numberIn(`${label} minutes`, L.minutes.min, L.minutes.max).int(`${label} minutes must be a whole number`);
const rating = (label: string) => numberIn(label, L.rating.min, L.rating.max).int(`${label} must be a whole number`);
const required = (label: string, max: number, message: string) => text(label, max).min(1, message);
/** Optional text: "" counts as left out. */
const optionalText = (label: string, max: number) =>
  text(label, max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

// ---------- Single daily values ----------

/** A value sent as null is removed; a value left out is not touched. */
export const dailySchema = z
  .strictObject({
    weightKg: numberIn("Weight", L.weightKg.min, L.weightKg.max, " kg").nullable().optional(),
    steps: numberIn("Steps", L.steps.min, L.steps.max).int("Steps must be a whole number").nullable().optional(),
    activeCalories: numberIn("Active calories", L.activeCalories.min, L.activeCalories.max, " kcal")
      .int("Active calories must be a whole number")
      .nullable()
      .optional(),
    // Entered on the Sleep card when the watch has no sleep for the day, or to correct it
    sleepHours: numberIn("Hours slept", L.sleepHours.min, L.sleepHours.max, " hours").nullable().optional(),
    sleepScoreValue: numberIn("Sleep score", L.score.min, L.score.max).int("Sleep score must be a whole number").nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Send weightKg, steps, activeCalories, sleepHours or sleepScoreValue");

export type DailyInput = z.infer<typeof dailySchema>;
export const DAILY_FIELDS = ["weightKg", "steps", "activeCalories", "sleepHours", "sleepScoreValue"] as const;

// ---------- Timestamped entries ----------

/** "HH:mm", for back-filling an entry to earlier in the day. */
const time = z
  .string({ error: 'time must be text like "08:15"' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be a 24-hour time like "08:15"')
  .optional();

const fields = {
  moods: {
    mood: rating("Mood"),
    energy: rating("Energy"),
    note: optionalText("Note", L.moodNote),
  },
  workouts: {
    type: required("Workout name", L.activityName, "Workout name is required"),
    durationMin: minutes("Workout").min(1, "Please enter how many minutes the workout took"),
    notes: optionalText("Notes", L.notes),
  },
  mental: {
    type: required("Activity name", L.activityName, "Activity name is required"),
    durationMin: minutes("Activity").optional(),
    notes: optionalText("Notes", L.notes),
  },
  outdoor: {
    type: required("Activity name", L.activityName, "Activity name is required"),
    durationMin: minutes("Activity").optional(),
    notes: optionalText("Notes", L.notes),
  },
  goodThings: { text: required("Good thing", L.goodThing, "Good things can't be empty") },
  water: {
    amountMl: numberIn("Water", L.waterMl.min, L.waterMl.max, " ml").int("Water must be a whole number of ml"),
  },
  learnings: {
    topic: required("Learning topic", L.learningTopic, "Each learning needs a topic"),
    details: optionalText("Learning details", L.learningDetails),
    minutes: minutes("Learning").optional(),
  },
  presentMoments: { text: required("Present moment", L.presentMoment, "Write a few words first") },
} satisfies Record<EntryKind, z.ZodRawShape>;

/** The optional fields of each kind, which PATCH can clear by sending null. */
export const CLEARABLE: Record<EntryKind, readonly string[]> = {
  moods: ["note"],
  workouts: ["notes"],
  mental: ["durationMin", "notes"],
  outdoor: ["durationMin", "notes"],
  goodThings: [],
  learnings: ["details", "minutes"],
  presentMoments: [],
  water: [],
};

export const entrySchemas = Object.fromEntries(
  Object.entries(fields).map(([kind, shape]) => [kind, z.strictObject({ ...shape, time })]),
) as unknown as Record<EntryKind, z.ZodType<Record<string, unknown>>>;

export const entryPatchSchemas = Object.fromEntries(
  Object.entries(fields).map(([kind, shape]) => {
    const clearable = CLEARABLE[kind as EntryKind];
    const patchShape = Object.fromEntries(
      Object.entries(shape).map(([key, schema]) => [key, clearable.includes(key) ? (schema as z.ZodType).nullable().optional() : (schema as z.ZodType).optional()]),
    );
    return [
      kind,
      z.strictObject({ ...patchShape, time }).refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change"),
    ];
  }),
) as unknown as Record<EntryKind, z.ZodType<Record<string, unknown>>>;

/**
 * PUT /:date/water/total — the day's water total, in ml or as typed ("1500", "1.5 L").
 * The range (0 to 2 × the goal, at most 6000 ml) depends on the user's goal, so it's checked
 * in the controller; here only that it's an amount and under the safety cap.
 */
export const waterTotalSchema = z.strictObject({
  totalMl: z
    .union([z.number({ error: "Enter an amount in ml or litres" }), z.string({ error: "Enter an amount in ml or litres" })], {
      error: "Enter an amount in ml or litres",
    })
    .transform((value, ctx) => {
      const ml = parseWaterAmount(value);
      if (ml === null) {
        ctx.addIssue({ code: "custom", message: 'Enter an amount like "1500" or "1.5 L"' });
        return z.NEVER;
      }
      return ml;
    })
    .pipe(z.number().int().min(0, "Water can't be negative").max(L.waterTotalMl, `Water can be at most ${L.waterTotalMl} ml a day`)),
});
