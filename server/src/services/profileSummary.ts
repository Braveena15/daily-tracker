// Turns a user's profile into their daily numbers (BMR, TDEE, calorie target…).
// Shared by GET /api/profile/summary and the meals summary so both always agree.
import type { ProfileField, User } from "../models/User";
import {
  bmiCategory,
  calculateAge,
  calculateBMI,
  calculateBMR,
  calculateCalorieTarget,
  calculateDailyDeficit,
  calculateTDEE,
  estimateWeeksToGoal,
} from "../utils/calories";

// Fields needed for the calorie numbers. Goal weight is only needed for weeks-to-goal.
export const REQUIRED_FOR_SUMMARY = [
  "heightCm",
  "birthYear",
  "sex",
  "currentWeightKg",
  "activityLevel",
  "weeklyGoalKg",
] as const satisfies readonly ProfileField[];

type ProfileLike = Partial<Pick<User, ProfileField>> | Record<ProfileField, unknown>;

export type Summary = {
  age: number;
  bmr: number;
  tdee: number;
  dailyDeficit: number;
  calorieTarget: number;
  wasClamped: boolean;
  bmi: number;
  bmiCategory: string;
  weeksToGoal: number | null;
};

/** Profile fields still missing for the summary. Note weeklyGoalKg can be 0, so check for null/undefined. */
export function missingSummaryFields(user: ProfileLike): (typeof REQUIRED_FOR_SUMMARY)[number][] {
  const u = user as Record<string, unknown>;
  return REQUIRED_FOR_SUMMARY.filter((f) => u[f] === undefined || u[f] === null);
}

/** The daily numbers, or null if the profile isn't complete yet. */
export function buildSummary(user: Partial<Pick<User, ProfileField>>): Summary | null {
  if (missingSummaryFields(user).length > 0) return null;

  // Safe: every field below was checked above
  const weight = user.currentWeightKg!;
  const height = user.heightCm!;
  const sex = user.sex!;
  const weeklyGoalKg = user.weeklyGoalKg!;

  const age = calculateAge(user.birthYear!);
  const bmr = calculateBMR({ weightKg: weight, heightCm: height, age, sex });
  const tdee = calculateTDEE(bmr, user.activityLevel!);
  const { target, wasClamped } = calculateCalorieTarget({ tdee, weeklyGoalKg, sex });
  const bmi = calculateBMI(weight, height);

  return {
    age,
    bmr,
    tdee,
    dailyDeficit: calculateDailyDeficit(weeklyGoalKg),
    calorieTarget: target,
    wasClamped,
    bmi,
    bmiCategory: bmiCategory(bmi),
    weeksToGoal: user.goalWeightKg != null ? estimateWeeksToGoal(weight, user.goalWeightKg, weeklyGoalKg) : null,
  };
}
