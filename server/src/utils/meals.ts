// Pure functions for meal and calorie-balance maths. No database or request code here,
// so every function is easy to test on its own.
import { DEFAULT_TIMEZONE, todayInTimezone } from "./dates";

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

const MINUTES_PER_DAY = 24 * 60;

/** Minutes since local midnight in `tz` (with seconds as a fraction). */
export function minutesSinceMidnight(now: Date, tz: string = DEFAULT_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0) % (type === "hour" ? 24 : 60);
  return get("hour") * 60 + get("minute") + get("second") / 60;
}

/**
 * How much of `date` has gone by at `now` (Asia/Colombo): 1 for a past day, 0 for a future
 * day, and the share of the day since midnight for today (06:00 → 0.25).
 */
export function dayFraction(date: string, now: Date = new Date(), tz: string = DEFAULT_TIMEZONE): number {
  const today = todayInTimezone(tz, now);
  if (date < today) return 1;
  if (date > today) return 0;
  return Math.min(1, minutesSinceMidnight(now, tz) / MINUTES_PER_DAY);
}

export type Burn = {
  /** Burned so far (the whole day for a past day) */
  burn: number;
  source: BurnSource;
  /** The resting part of `burn` (with the watch); the TDEE share without it */
  resting: number;
  /** Active calories from the watch (null without watch data) */
  active: number | null;
  /** The expected burn for the whole day */
  projected: number;
  /** True while the day is still going (today), so `burn` is only "so far" */
  soFar: boolean;
};

/**
 * Calories burned in a day, using only that day's own data.
 * - With the watch's active calories: resting + active. For a past day, resting is the watch's
 *   resting calories (or BMR when it didn't send them). For today it's BMR × the share of the
 *   day gone by (06:00 → 25% of BMR), because the body has only been "at rest" since midnight;
 *   the expected full-day burn is BMR + the active calories so far.
 * - Without watch data: TDEE (BMR × an activity multiplier), or for today the same share of it.
 * Never both: TDEE already includes an estimate of activity, so adding active calories
 * to it would count your movement twice.
 * Leave out `date` for a whole day.
 */
export function estimatedBurn(input: {
  bmr: number;
  tdee: number;
  activeCalories?: number | null;
  restingCalories?: number | null;
  /** The day the burn is for ("YYYY-MM-DD", Asia/Colombo) */
  date?: string;
  now?: Date;
}): Burn {
  const { bmr, tdee, activeCalories, restingCalories } = input;
  const fraction = input.date === undefined ? 1 : dayFraction(input.date, input.now ?? new Date());
  const soFar = fraction < 1;

  if (activeCalories !== undefined && activeCalories !== null) {
    const resting = Math.round(soFar ? bmr * fraction : (restingCalories ?? bmr));
    const projected = Math.round(soFar ? bmr + activeCalories : resting + activeCalories);
    return { burn: resting + Math.round(activeCalories), source: "watch", resting, active: Math.round(activeCalories), projected, soFar };
  }
  const resting = Math.round(tdee * fraction);
  return { burn: resting, source: "estimate", resting, active: null, projected: Math.round(tdee), soFar };
}

/**
 * remaining: how much of the day's target is left (negative = over the target).
 * netVsBurn: eaten minus burned so far (negative = you burned more than you ate).
 * netVsProjected: eaten minus the expected burn for the whole day (when given).
 */
export function calorieBalance(input: { eaten: number; target: number; burn: number; projectedBurn?: number }): {
  remaining: number;
  netVsBurn: number;
  netVsProjected: number | null;
} {
  const { eaten, target, burn, projectedBurn } = input;
  return {
    remaining: target - eaten,
    netVsBurn: eaten - burn,
    netVsProjected: projectedBurn === undefined ? null : eaten - projectedBurn,
  };
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
