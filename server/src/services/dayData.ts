// Loads what the scores and progress routes need, so every route computes them the same way.
import { CHECKED_IN, DailyEntryModel, isCheckedIn } from "../models/DailyEntry";
import { MealDayModel } from "../models/MealDay";
import { GOAL_LIMITS, UserModel, type User } from "../models/User";
import { buildSummary, type Summary } from "./profileSummary";
import { AppError } from "../utils/AppError";
import { MIN_CALORIES } from "../utils/calories";
import { todayInTimezone } from "../utils/dates";
import { clampFrom } from "../utils/journey";
import { journeyStart } from "./journey";
import { dayTotals, type MealItemLike } from "../utils/meals";
import { dayScores, type DayScores, type ScoreEntry, type ScoreGoals } from "../utils/scores";
import { waterTotal } from "../utils/water";

export type Goals = ScoreGoals & { journeyLengthDays: number; fiberGoalG: number; waterGoalMl: number; glassSizeMl: number };

/** The user's goals, with defaults filled in for accounts created before goals existed. */
export function goalNumbers(user: Partial<Pick<User, keyof typeof GOAL_LIMITS>>): Goals {
  const pick = (key: keyof typeof GOAL_LIMITS) => user[key] ?? GOAL_LIMITS[key].default;
  return {
    stepGoal: pick("stepGoal"),
    activeCalorieGoal: pick("activeCalorieGoal"),
    workoutMinutesGoal: pick("workoutMinutesGoal"),
    learningMinutesGoal: pick("learningMinutesGoal"),
    journeyLengthDays: pick("journeyLengthDays"),
    fiberGoalG: pick("fiberGoalG"),
    waterGoalMl: pick("waterGoalMl"),
    glassSizeMl: pick("glassSizeMl"),
  };
}

export { journeyStart } from "./journey";

export type UserContext = {
  user: User;
  summary: Summary | null;
  goals: Goals;
  minimumKcal: number | null;
};

export async function loadUserContext(userId: string | undefined): Promise<UserContext> {
  const user = await UserModel.findById(userId).lean();
  if (!user) throw new AppError(401, "Please log in to continue");
  return {
    user,
    summary: buildSummary(user),
    goals: goalNumbers(user),
    minimumKcal: user.sex ? MIN_CALORIES[user.sex] : null,
  };
}

type LeanEntry = Awaited<ReturnType<typeof loadEntries>> extends Map<string, infer E> ? E : never;

async function loadEntries(userId: string | undefined, from: string, to: string) {
  // Logged days only: a day with just Apple Health data has no scores yet
  const rows = await DailyEntryModel.find({ userId, date: { $gte: from, $lte: to }, ...CHECKED_IN }).lean();
  return new Map(rows.filter(isCheckedIn).map((r) => [r.date, r]));
}

/**
 * Logged days, plus eaten kcal and fibre (only for days with meals logged) for a date range.
 * Days before the journey start are left out (hidden, not deleted), so they never count as
 * logged or missed. Pass `start` when it's already known, to save a lookup.
 */
export async function loadDays(userId: string | undefined, rangeFrom: string, to: string, start?: string) {
  const from = clampFrom(rangeFrom, start ?? (await journeyStart(userId)));
  const [entries, mealDays] = await Promise.all([
    loadEntries(userId, from, to),
    MealDayModel.find({ userId, date: { $gte: from, $lte: to }, "items.0": { $exists: true } }).lean(),
  ]);
  const totals = mealDays.map((m) => [m.date, dayTotals(m.items as MealItemLike[])] as const);
  const mealKcal = new Map(totals.map(([date, t]) => [date, t.kcal]));
  // Only days where at least one food had fibre
  const mealFiber = new Map(totals.flatMap(([date, t]) => (t.fiberG === null ? [] : [[date, t.fiberG] as const])));
  return { entries, mealKcal, mealFiber };
}

/** A stored entry in the shape the score functions expect. */
export function toScoreEntry(entry: LeanEntry): ScoreEntry {
  return {
    moods: entry.moodLogs.map((m) => ({ mood: m.mood, energy: m.energy, note: m.note, loggedAt: m.loggedAt })),
    sleepHours: entry.sleepHours,
    sleepScore: entry.sleepScoreValue ?? null,
    steps: entry.steps,
    activeCalories: entry.activeCalories,
    workouts: entry.workouts.map((w) => ({ type: w.type, durationMin: w.durationMin, loggedAt: w.loggedAt })),
    mentalActivities: entry.mentalActivities.map((a) => ({ type: a.type, durationMin: a.durationMin, loggedAt: a.loggedAt })),
    outdoorActivities: entry.outdoorActivities.map((a) => ({ type: a.type, durationMin: a.durationMin, loggedAt: a.loggedAt })),
    goodThings: entry.goodThings.map((g) => g.text),
    learnings: entry.learnings.map((l) => ({ topic: l.topic, details: l.details, minutes: l.minutes, loggedAt: l.loggedAt })),
    presentMoments: entry.presentMoments.map((p) => p.text),
  };
}

/** Scores for one day. Unlogged days (no entry) get null scores. */
export function scoresFor(ctx: UserContext, entry: LeanEntry | undefined, eatenKcal: number | undefined): DayScores {
  return dayScores(entry ? toScoreEntry(entry) : null, ctx.goals, {
    eatenKcal: eatenKcal ?? null,
    targetKcal: ctx.summary?.calorieTarget ?? null,
    minimumKcal: ctx.minimumKcal,
  });
}

/**
 * Each day's water total (ml) from `from` to `to`, including days with nothing else logged.
 * Only days with water are in the map.
 */
export async function loadWater(userId: string | undefined, from: string, to: string): Promise<Map<string, number>> {
  const rows = await DailyEntryModel.find({ userId, date: { $gte: from, $lte: to }, "waterLogs.0": { $exists: true } })
    .select("date waterLogs.amountMl -_id")
    .lean();
  return new Map(rows.map((r) => [r.date, waterTotal(r.waterLogs)]));
}
