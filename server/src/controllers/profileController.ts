import type { Request, Response } from "express";
import { z } from "zod";
import { PROFILE_FIELDS, PROFILE_LIMITS, UserModel, maxBirthYear, type ProfileField } from "../models/User";
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
  });
}

type Profile = { [K in ProfileField]?: unknown };

function pickProfile(user: Record<string, unknown>): Profile {
  return Object.fromEntries(PROFILE_FIELDS.map((f) => [f, user[f] ?? null]));
}

export async function getProfile(req: Request, res: Response): Promise<void> {
  const user = await UserModel.findById(req.userId).lean();
  if (!user) throw new AppError(401, "Please log in to continue");
  res.json({ profile: pickProfile(user) });
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

  res.json({ profile: pickProfile(user) });
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
