// Loads what the scores and progress routes need, so every route computes them the same way.
import { CHECKED_IN, DailyEntryModel, isCheckedIn } from "../models/DailyEntry";
import { MealDayModel } from "../models/MealDay";
import { GOAL_LIMITS, UserModel, type User } from "../models/User";
import { buildSummary, type Summary } from "./profileSummary";
import { AppError } from "../utils/AppError";
import { MIN_CALORIES } from "../utils/calories";
import { todayInTimezone } from "../utils/dates";
import { dayTotals, type MealItemLike } from "../utils/meals";
import { dayScores, type DayScores, type ScoreEntry, type ScoreGoals } from "../utils/scores";

export type Goals = ScoreGoals & { journeyLengthDays: number };

/** The user's goals, with defaults filled in for accounts created before goals existed. */
export function goalNumbers(user: Partial<Pick<User, keyof typeof GOAL_LIMITS>>): Goals {
  const pick = (key: keyof typeof GOAL_LIMITS) => user[key] ?? GOAL_LIMITS[key].default;
  return {
    stepGoal: pick("stepGoal"),
    activeCalorieGoal: pick("activeCalorieGoal"),
    workoutMinutesGoal: pick("workoutMinutesGoal"),
    learningMinutesGoal: pick("learningMinutesGoal"),
    journeyLengthDays: pick("journeyLengthDays"),
  };
}

/** The journey start: the date the user chose, else their first check-in, else today. */
export async function journeyStart(userId: string | undefined, user: { journeyStartDate?: string | null }): Promise<string> {
  if (user.journeyStartDate) return user.journeyStartDate;
  const first = await DailyEntryModel.findOne({ userId, ...CHECKED_IN }).sort({ date: 1 }).select("date").lean();
  return first?.date ?? todayInTimezone();
}

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
  // Check-ins only: a day with just Apple Health data has no scores yet
  const rows = await DailyEntryModel.find({ userId, date: { $gte: from, $lte: to }, ...CHECKED_IN }).lean();
  return new Map(rows.filter(isCheckedIn).map((r) => [r.date, r]));
}

/** Check-ins and eaten kcal (only for days with meals logged) for a date range. */
export async function loadDays(userId: string | undefined, from: string, to: string) {
  const [entries, mealDays] = await Promise.all([
    loadEntries(userId, from, to),
    MealDayModel.find({ userId, date: { $gte: from, $lte: to }, "items.0": { $exists: true } }).lean(),
  ]);
  const mealKcal = new Map(mealDays.map((m) => [m.date, dayTotals(m.items as MealItemLike[]).kcal]));
  return { entries, mealKcal };
}

/** A stored entry in the shape the score functions expect. */
export function toScoreEntry(entry: LeanEntry): ScoreEntry {
  return {
    mood: entry.mood,
    energy: entry.energy,
    sleepHours: entry.sleepHours,
    sleepScore: entry.sleep?.score ?? null,
    steps: entry.steps,
    activeCalories: entry.activeCalories,
    workouts: entry.workouts.map((w) => ({ type: w.type, durationMin: w.durationMin })),
    mentalActivities: entry.mentalActivities.map((a) => ({ type: a.type, durationMin: a.durationMin })),
    outdoorActivities: entry.outdoorActivities.map((a) => ({ type: a.type, durationMin: a.durationMin })),
    goodThings: [...entry.goodThings],
    learnings: entry.learnings.map((l) => ({ topic: l.topic, details: l.details, minutes: l.minutes })),
    presentMoment: entry.presentMoment,
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
