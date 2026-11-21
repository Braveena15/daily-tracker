import type { Request, Response } from "express";
import { z } from "zod";
import {
  GOAL_LIMITS,
  PROFILE_FIELDS,
  PROFILE_LIMITS,
  UserModel,
  maxBirthYear,
  type ProfileField,
  type User,
} from "../models/User";
import { goalNumbers, journeyStart } from "../services/dayData";
import { countBeforeStart, deleteBeforeStart } from "../services/journey";
import { isValidDateString, todayInTimezone } from "../utils/dates";
import { AppError } from "../utils/AppError";
import { ACTIVITY_LEVELS, WEEKLY_GOALS } from "../utils/calories";
import { buildSummary, missingSummaryFields } from "../services/profileSummary";

const { heightCm, weightKg, birthYear } = PROFILE_LIMITS;

function weightField(label: string) {
  return z
    .number({ error: `${label} must be a number` })
    .min(weightKg.min, `${label} must be between ${weightKg.min} and ${weightKg.max} kg`)
    .max(weightKg.max, `${label} must be between ${weightKg.min} and ${weightKg.max} kg`);
}

// Built per request so the birth-year limit is always based on the current year.
// Every field is optional (left out = unchanged) and nullable (null = clear it).
// Unknown fields are rejected.
function updateSchema() {
  const latestBirthYear = maxBirthYear();
  return z.strictObject({
    heightCm: z
      .number({ error: "Height must be a number" })
      .min(heightCm.min, `Height must be between ${heightCm.min} and ${heightCm.max} cm`)
      .max(heightCm.max, `Height must be between ${heightCm.min} and ${heightCm.max} cm`)
      .nullable()
      .optional(),
    birthYear: z
      .number({ error: "Birth year must be a number" })
      .int("Birth year must be a whole number")
      .min(birthYear.min, `Birth year must be between ${birthYear.min} and ${latestBirthYear}`)
      .max(latestBirthYear, `Birth year must be between ${birthYear.min} and ${latestBirthYear}`)
      .nullable()
      .optional(),
    sex: z.enum(["male", "female"], { error: 'Sex must be "male" or "female"' }).nullable().optional(),
    currentWeightKg: weightField("Current weight").nullable().optional(),
    goalWeightKg: weightField("Goal weight").nullable().optional(),
    activityLevel: z.enum(ACTIVITY_LEVELS, { error: "Please choose an activity level" }).nullable().optional(),
    weeklyGoalKg: z
      .literal(WEEKLY_GOALS, { error: "Weekly goal must be 0, 0.25, 0.5, 0.75 or 1 kg" })
      .nullable()
      .optional(),

    // Goals: null resets a goal to its default
    stepGoal: goalField("Step goal", "stepGoal"),
    activeCalorieGoal: goalField("Active calorie goal", "activeCalorieGoal"),
    workoutMinutesGoal: goalField("Workout minutes goal", "workoutMinutesGoal"),
    learningMinutesGoal: goalField("Learning minutes goal", "learningMinutesGoal"),
    journeyLengthDays: goalField("Journey length", "journeyLengthDays"),
    fiberGoalG: goalField("Fibre goal", "fiberGoalG"),
    // null = automatic (the first real entry)
    journeyStartDate: z
      .string({ error: "Journey start must be a date" })
      .refine(isValidDateString, "Journey start must be a real date in YYYY-MM-DD format")
      .refine((d) => d <= todayInTimezone(), "Your journey can't start in the future")
      .nullable()
      .optional(),
  });
}

function goalField(label: string, key: keyof typeof GOAL_LIMITS) {
  const { min, max } = GOAL_LIMITS[key];
  const range = `${label} must be between ${min.toLocaleString("en-US")} and ${max.toLocaleString("en-US")}`;
  return z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, range)
    .max(max, range)
    .nullable()
    .optional();
}

/**
 * Goals with defaults filled in. journeyStartDate is what the user chose (null = automatic);
 * journeyStartResolved is the date actually used (the first real entry, or today).
 */
async function pickGoals(userId: string | undefined, user: User) {
  return {
    ...goalNumbers(user),
    journeyStartDate: user.journeyStartDate ?? null,
    journeyStartResolved: await journeyStart(userId, user),
  };
}

type Profile = { [K in ProfileField]?: unknown };

function pickProfile(user: Record<string, unknown>): Profile {
  return Object.fromEntries(PROFILE_FIELDS.map((f) => [f, user[f] ?? null]));
}

export async function getProfile(req: Request, res: Response): Promise<void> {
  const user = await UserModel.findById(req.userId).lean();
  if (!user) throw new AppError(401, "Please log in to continue");
  res.json({ profile: pickProfile(user), goals: await pickGoals(req.userId, user) });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const changes = updateSchema().parse(req.body ?? {});

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) $unset[key] = 1;
    else if (value !== undefined) $set[key] = value;
  }

  const user = await UserModel.findByIdAndUpdate(
    req.userId,
    { $set, $unset },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!user) throw new AppError(401, "Please log in to continue");

  res.json({ profile: pickProfile(user), goals: await pickGoals(req.userId, user) });
}

// Readable names for the "missing fields" message
const FIELD_LABELS: Record<ProfileField, string> = {
  heightCm: "height",
  birthYear: "birth year",
  sex: "sex",
  currentWeightKg: "current weight",
  goalWeightKg: "goal weight",
  activityLevel: "activity level",
  weeklyGoalKg: "weekly goal",
};

export async function getSummary(req: Request, res: Response): Promise<void> {
  const user = await UserModel.findById(req.userId).lean();
  if (!user) throw new AppError(401, "Please log in to continue");

  const summary = buildSummary(user);
  if (!summary) {
    const missingFields = missingSummaryFields(user);
    res.json({
      complete: false,
      missingFields,
      message: `Please complete your profile. Missing: ${missingFields.map((f) => FIELD_LABELS[f]).join(", ")}.`,
    });
    return;
  }

  res.json({ complete: true, summary });
}

// ---------- Data from before the journey ----------

/** GET /api/profile/data-before-start — how much of the user's data is dated before their journey start. */
export async function countDataBeforeStart(req: Request, res: Response): Promise<void> {
  const start = await journeyStart(req.userId);
  const counts = await countBeforeStart(req.userId, start);
  res.json({ journeyStartDate: start, counts, total: Object.values(counts).reduce((s, n) => s + n, 0) });
}

const deleteBeforeStartSchema = z.strictObject({
  confirm: z.literal("DELETE", { error: 'Type DELETE to confirm' }),
});

/**
 * DELETE /api/profile/data-before-start — permanently deletes the user's own days, meals, diary
 * entries, thought logs and AI messages dated before the journey start. Nothing on or after the
 * start date, and nothing of any other user, is touched.
 */
export async function deleteDataBeforeStart(req: Request, res: Response): Promise<void> {
  deleteBeforeStartSchema.parse(req.body ?? {});
  const start = await journeyStart(req.userId);
  const deleted = await deleteBeforeStart(req.userId, start);
  res.json({ journeyStartDate: start, deleted, total: Object.values(deleted).reduce((s, n) => s + n, 0) });
}
