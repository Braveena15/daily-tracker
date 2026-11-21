// Pure functions for meal and calorie-balance maths. No database or request code here,
// so every function is easy to test on its own.

export const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/** The parts of a meal item the maths needs. Macros are grams per serving. */
export type MealItemLike = {
  mealType: MealType;
  servings: number;
  kcalPerServing: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  fiberG?: number | null;
};

/** Macros (and fibre) are null when none of the items included them. */
export type Totals = {
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
};

const MACROS = ["proteinG", "carbsG", "fatG", "fiberG"] as const;
type Macro = (typeof MACROS)[number];

const roundTo1 = (n: number) => Math.round(n * 10) / 10;

/** Calories for one item: servings × kcal per serving, rounded to a whole number. */
export function itemKcal(item: Pick<MealItemLike, "servings" | "kcalPerServing">): number {
  return Math.round(item.servings * item.kcalPerServing);
}

/** Grams of one macro for one item: servings × grams per serving, 1 decimal (null when the food has none). */
export function itemMacro(item: Pick<MealItemLike, "servings" | Macro>, key: Macro): number | null {
  const perServing = item[key];
  return perServing === undefined || perServing === null ? null : roundTo1(item.servings * perServing);
}

function sumMacro(items: MealItemLike[], key: Macro): number | null {
  const withMacro = items.filter((i) => i[key] !== undefined && i[key] !== null);
  if (withMacro.length === 0) return null;
  return roundTo1(withMacro.reduce((sum, i) => sum + i.servings * (i[key] as number), 0));
}

/**
 * Day (or meal) totals. kcal is the sum of each item's rounded kcal, so the
 * numbers shown per item always add up to the total shown.
 */
export function dayTotals(items: MealItemLike[]): Totals {
  return {
    kcal: items.reduce((sum, i) => sum + itemKcal(i), 0),
    proteinG: sumMacro(items, "proteinG"),
    carbsG: sumMacro(items, "carbsG"),
    fatG: sumMacro(items, "fatG"),
    fiberG: sumMacro(items, "fiberG"),
  };
}

/** Average daily fibre over the days that have any (null when none do), 1 decimal. */
export function averageFiber(days: { fiberG: number | null }[]): number | null {
  const logged = days.map((d) => d.fiberG).filter((g): g is number => g !== null);
  return logged.length === 0 ? null : roundTo1(logged.reduce((s, g) => s + g, 0) / logged.length);
}

/** Totals for each of the four meals (a meal with no items has kcal 0). */
export function totalsByMeal(items: MealItemLike[]): Record<MealType, Totals> {
  return Object.fromEntries(
    MEAL_TYPES.map((type) => [type, dayTotals(items.filter((i) => i.mealType === type))]),
  ) as Record<MealType, Totals>;
}

export type BurnSource = "watch" | "estimate";

/**
 * Calories burned in the day.
 * - With the watch's active calories: BMR (burned at rest) + active calories (burned moving).
 *   When Apple Health also sent resting calories, those replace the BMR estimate: they're the
 *   watch's own measurement of what you burned at rest (so far today, like the active calories).
 * - Without: TDEE, which is BMR × an activity multiplier — a guess at the same thing.
 * Never both: TDEE already includes an estimate of activity, so adding active calories
 * to it would count your movement twice.
 */
export function estimatedBurn(input: {
  bmr: number;
  tdee: number;
  activeCalories?: number | null;
  restingCalories?: number | null;
}): { burn: number; source: BurnSource } {
  const { bmr, tdee, activeCalories, restingCalories } = input;
  if (activeCalories !== undefined && activeCalories !== null) {
    const atRest = restingCalories ?? bmr;
    return { burn: Math.round(atRest + activeCalories), source: "watch" };
  }
  return { burn: Math.round(tdee), source: "estimate" };
}

/**
 * remaining: how much of today's target is left (negative = over the target).
 * netVsBurn: eaten minus burned (negative = you burned more than you ate).
 */
export function calorieBalance(input: { eaten: number; target: number; burn: number }): {
  remaining: number;
  netVsBurn: number;
} {
  const { eaten, target, burn } = input;
  return { remaining: target - eaten, netVsBurn: eaten - burn };
}

/** "On target" means within ±10% of the target. */
export const ON_TARGET_TOLERANCE = 0.1;

export function isOnTarget(kcal: number, target: number): boolean {
  return Math.abs(kcal - target) <= target * ON_TARGET_TOLERANCE;
}

/**
 * Summary of a run of days. Days with nothing logged (null) are left out of the
 * average and the on-target count, so a forgotten day doesn't look like a day of not eating.
 */
export function weeklySummary(
  days: { date: string; kcal: number | null }[],
  target: number | null,
): { average: number | null; loggedDays: number; daysOnTarget: number | null } {
  const logged = days.map((d) => d.kcal).filter((k): k is number => k !== null);
  const average = logged.length > 0 ? Math.round(logged.reduce((s, k) => s + k, 0) / logged.length) : null;
  const daysOnTarget = target === null ? null : logged.filter((k) => isOnTarget(k, target)).length;
  return { average, loggedDays: logged.length, daysOnTarget };
}

/** How many recent logged days are checked for low intake. */
export const LOW_INTAKE_DAYS = 3;

/**
 * True when each of the most recent `LOW_INTAKE_DAYS` logged days is below the safe minimum.
 * `recentKcal` is the kcal of the most recent logged days, newest first.
 */
export function isLowIntake(recentKcal: number[], minimum: number): boolean {
  const lastDays = recentKcal.slice(0, LOW_INTAKE_DAYS);
  return lastDays.length === LOW_INTAKE_DAYS && lastDays.every((k) => k < minimum);
}
