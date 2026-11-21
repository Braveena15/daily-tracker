// Validation for PUT /api/entries/:date. Kept separate from the controller so it can be unit tested.
import { z } from "zod";
import { ENTRY_LIMITS as L, WORKOUT_SOURCES } from "../models/DailyEntry";

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

function list<T extends z.ZodType>(label: string, item: T) {
  return z.array(item).max(L.listItems, `You can add up to ${L.listItems} ${label}`).default([]);
}

const minutes = (label: string) =>
  numberIn(`${label} minutes`, L.minutes.min, L.minutes.max).int(`${label} minutes must be a whole number`);
const activityName = (label: string) => text(`${label} name`, L.activityName).min(1, `${label} name is required`);
const notes = text("Notes", L.notes).optional();

export const entrySchema = z.strictObject({
  mood: numberIn("Mood", L.rating.min, L.rating.max).int("Mood must be a whole number"),
  energy: numberIn("Energy", L.rating.min, L.rating.max).int("Energy must be a whole number"),
  sleepHours: numberIn("Sleep", L.sleepHours.min, L.sleepHours.max, " hours"),

  weightKg: numberIn("Weight", L.weightKg.min, L.weightKg.max, " kg").nullable().optional(),
  steps: numberIn("Steps", L.steps.min, L.steps.max).int("Steps must be a whole number").nullable().optional(),
  activeCalories: numberIn("Active calories", L.activeCalories.min, L.activeCalories.max, " kcal")
    .nullable()
    .optional(),
  // Empty (null) means "use the calculated score"; the source is decided by the server
  sleepScoreValue: numberIn("Sleep score", L.score.min, L.score.max)
    .int("Sleep score must be a whole number")
    .nullable()
    .optional(),

  workouts: list(
    "workouts",
    z.strictObject({
      type: activityName("Workout"),
      durationMin: minutes("Workout").min(1, "Please enter how many minutes each workout took"),
      notes,
      // Set on workouts from Apple Health sync; the form sends them back unchanged
      source: z.enum(WORKOUT_SOURCES).optional(),
      calories: numberIn("Workout calories", L.workoutCalories.min, L.workoutCalories.max, " kcal").optional(),
    }),
  ),
  mentalActivities: list(
    "mental activities",
    z.strictObject({ type: activityName("Activity"), durationMin: minutes("Activity").optional(), notes }),
  ),
  outdoorActivities: list(
    "outdoor activities",
    z.strictObject({ type: activityName("Activity"), durationMin: minutes("Activity").optional(), notes }),
  ),
  goodThings: list("good things", text("Each good thing", L.goodThing).min(1, "Good things can't be empty")),
  learnings: list(
    "learnings",
    z.strictObject({
      topic: text("Learning topic", L.learningTopic).min(1, "Each learning needs a topic"),
      details: text("Learning details", L.learningDetails).optional(),
      minutes: minutes("Learning").optional(),
    }),
  ),
  presentMoment: text("Present moment", L.presentMoment).default(""),
});

export const OPTIONAL_NUMBERS = ["weightKg", "steps", "activeCalories"] as const;

export type EntryInput = z.infer<typeof entrySchema>;
