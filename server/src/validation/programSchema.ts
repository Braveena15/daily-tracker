// Validation for /api/programs. Free text (why, goal notes, reflections, end note) is checked as
// plain text here, because it's stored encrypted.
import { z } from "zod";
import { END_REASONS, PROGRAM_LIMITS as L } from "../models/Program";
import { isValidDateString } from "../utils/dates";
import { PROGRAM_LENGTH } from "../utils/program";

const text = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be ${max} characters or less`);
const num = (label: string, min: number, max: number) =>
  z
    .number({ error: `${label} must be a number` })
    .refine(Number.isFinite, `${label} must be a number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);
const opt = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();
const rating = (label: string) => opt(num(label, 1, 10).int(`${label} must be a whole number from 1 to 10`));
const list = (label: string) => z.array(text(label, L.label).min(1, `${label} can't be empty`)).max(L.listItems, `Up to ${L.listItems} ${label.toLowerCase()}s`).default([]);
const date = z.string().refine(isValidDateString, "Date must be a real date in YYYY-MM-DD format");

export const ratingsSchema = z
  .strictObject({
    confidence: rating("Confidence"),
    discipline: rating("Discipline"),
    fitness: rating("Fitness"),
    mentalWellbeing: rating("Mental wellbeing"),
    focus: rating("Focus"),
    custom: z
      .array(z.strictObject({ label: text("Rating name", L.label).min(1, "Give the rating a name"), value: rating("Rating") }))
      .max(L.customRatings, `Up to ${L.customRatings} custom ratings`)
      .default([]),
  })
  .default({ custom: [] });

const cm = (label: string) => opt(num(label, 20, 300));

/** "Where I am now" and every check-in */
export const snapshotSchema = z.strictObject({
  weightKg: opt(num("Weight", 30, 300)),
  waistCm: cm("Waist"),
  chestCm: cm("Chest"),
  hipsCm: cm("Hips"),
  armCm: cm("Arm"),
  ratings: ratingsSchema,
  habits: list("Habit"),
  text: opt(text("Text", L.text)),
});

export const goalsSchema = z
  .strictObject({
    goalWeightKg: opt(num("Goal weight", 30, 300)),
    ratings: ratingsSchema,
    habits: list("Habit"),
    focusAreas: list("Focus area"),
    notes: opt(text("Goal notes", L.text)),
  })
  .default({ ratings: { custom: [] }, habits: [], focusAreas: [] });

export const planSchema = z
  .strictObject({
    waterMl: opt(num("Water", 0, 6000).int()),
    calorieTarget: opt(num("Calorie target", 800, 6000).int()),
    sleepHours: opt(num("Sleep", 0, 14)),
    workoutsPerWeek: opt(num("Workouts per week", 0, 14).int()),
    learningMinutes: opt(num("Learning", 0, 600).int()),
    customHabits: z
      .array(text("Habit", L.label).min(1, "A habit can't be empty"))
      .max(L.customHabits, `Up to ${L.customHabits} daily habits`)
      .default([]),
  })
  .default({ customHabits: [] });

export const createProgramSchema = z.strictObject({
  name: text("Name", L.name).min(1, "Give the program a name"),
  lengthDays: num("Length", PROGRAM_LENGTH.min, PROGRAM_LENGTH.max).int("Length must be a whole number of days"),
  startDate: date,
  baseline: snapshotSchema.default({ ratings: { custom: [] }, habits: [] }),
  goals: goalsSchema,
  plan: planSchema,
});

export const updateProgramSchema = z
  .strictObject({
    name: text("Name", L.name).min(1, "Give the program a name").optional(),
    goals: goalsSchema.optional(),
    plan: planSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");

/** A check-in, or { skipped: true } to skip it */
export const checkInSchema = z.union([z.strictObject({ skipped: z.literal(true) }), snapshotSchema]);

export const endProgramSchema = z.strictObject({
  reason: z.enum(END_REASONS, { error: `Reason must be one of: ${END_REASONS.join(", ")}` }).nullable().optional(),
  note: opt(text("Note", L.text)),
});

export const habitsDoneSchema = z.strictObject({
  done: z.array(z.string().max(40)).max(L.customHabits),
});
