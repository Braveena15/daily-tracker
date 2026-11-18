// Pure functions for body and calorie maths. No database or request code here,
// so every function is easy to test on its own.

export type Sex = "male" | "female";

export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

// 0 means "maintain my weight"
export const WEEKLY_GOALS = [0, 0.25, 0.5, 0.75, 1] as const;
export type WeeklyGoalKg = (typeof WEEKLY_GOALS)[number];

// About 7700 kcal of energy is stored in 1 kg of body fat.
export const KCAL_PER_KG = 7700;

// Below these daily intakes it is hard to get enough nutrients without medical supervision.
export const MIN_CALORIES: Record<Sex, number> = { male: 1500, female: 1200 };

/**
 * Age in whole years. We only store the birth year, so this is the age the
 * person turns this calendar year (it can be one year high before their birthday).
 */
export function calculateAge(birthYear: number, today: Date = new Date()): number {
  return today.getFullYear() - birthYear;
}

/**
 * Basal Metabolic Rate: calories the body burns per day at complete rest.
 * Mifflin–St Jeor equation:
 *   10 × weight(kg) + 6.25 × height(cm) − 5 × age + 5   (male)
 *   10 × weight(kg) + 6.25 × height(cm) − 5 × age − 161 (female)
 */
export function calculateBMR(input: { weightKg: number; heightCm: number; age: number; sex: Sex }): number {
  const { weightKg, heightCm, age, sex } = input;
  const sexOffset = sex === "male" ? 5 : -161;
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset);
}

/** How much more than BMR a person burns per day, based on how active they are. */
export function activityMultiplier(level: ActivityLevel): number {
  const multipliers: Record<ActivityLevel, number> = {
    sedentary: 1.2, // little or no exercise
    light: 1.375, // light exercise 1–3 days a week
    moderate: 1.55, // moderate exercise 3–5 days a week
    active: 1.725, // hard exercise 6–7 days a week
    very_active: 1.9, // very hard exercise or a physical job
  };
  return multipliers[level];
}

/** Total Daily Energy Expenditure: estimated calories burned per day including activity. */
export function calculateTDEE(bmr: number, level: ActivityLevel): number {
  return Math.round(bmr * activityMultiplier(level));
}

/** Calories to eat below TDEE each day to lose `weeklyGoalKg` per week. */
export function calculateDailyDeficit(weeklyGoalKg: number): number {
  return Math.round((weeklyGoalKg * KCAL_PER_KG) / 7);
}

/**
 * Daily calorie target = TDEE − deficit, but never below the safe minimum for the
 * person's sex. `wasClamped` is true when the minimum kicked in.
 */
export function calculateCalorieTarget(input: { tdee: number; weeklyGoalKg: number; sex: Sex }): {
  target: number;
  wasClamped: boolean;
} {
  const { tdee, weeklyGoalKg, sex } = input;
  const wanted = Math.round(tdee - calculateDailyDeficit(weeklyGoalKg));
  const minimum = MIN_CALORIES[sex];

  if (wanted < minimum) {
    return { target: minimum, wasClamped: true };
  }
  return { target: wanted, wasClamped: false };
}

/** Body Mass Index = weight(kg) / height(m)², rounded to 1 decimal. */
export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export type BmiCategory = "Underweight" | "Healthy weight" | "Overweight" | "Obese";

/** Standard adult BMI ranges (WHO). */
export function bmiCategory(bmi: number): BmiCategory {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Healthy weight";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

/**
 * Whole weeks needed to go from current weight down to the goal at `weeklyGoalKg` per week.
 * Returns null when maintaining (0 kg/week) or when the goal is already reached
 * (or is above the current weight, since the weekly goal is a loss rate).
 */
export function estimateWeeksToGoal(currentKg: number, goalKg: number, weeklyGoalKg: number): number | null {
  const kgToLose = currentKg - goalKg;
  if (weeklyGoalKg <= 0 || kgToLose <= 0) return null;
  return Math.ceil(kgToLose / weeklyGoalKg);
}

/**
 * Trailing moving average: each result is the average of that day and the previous
 * `window − 1` days. Missing days (null) are skipped; a result is null only when the
 * whole window has no values.
 *
 * Example with window 3: [70, null, 72, 74] → [70, 70, 71, 73]
 */
export function movingAverage(values: (number | null)[], window = 7): (number | null)[] {
  if (!Number.isInteger(window) || window < 1) {
    throw new RangeError("window must be a positive whole number");
  }

  return values.map((_, i) => {
    const inWindow = values
      .slice(Math.max(0, i - window + 1), i + 1)
      .filter((v): v is number => v !== null);

    if (inWindow.length === 0) return null;
    return inWindow.reduce((sum, v) => sum + v, 0) / inWindow.length;
  });
}
