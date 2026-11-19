import type { Request, Response } from "express";
import { Types } from "mongoose";
import { DailyEntryModel } from "../models/DailyEntry";
import { FoodModel } from "../models/Food";
import { MEAL_LIMITS, MealDayModel } from "../models/MealDay";
import { UserModel } from "../models/User";
import { buildSummary } from "../services/profileSummary";
import { AppError } from "../utils/AppError";
import { MIN_CALORIES } from "../utils/calories";
import { addDays, isValidDateString, listDates, todayInTimezone } from "../utils/dates";
import {
  calorieBalance,
  dayTotals,
  estimatedBurn,
  isLowIntake,
  totalsByMeal,
  weeklySummary,
  LOW_INTAKE_DAYS,
  type MealItemLike,
} from "../utils/meals";
import { copyMealsSchema, saveMealDaySchema, type MealItemInput } from "../validation/mealSchema";

// Every query filters by req.userId, so users only ever see and change their own meals.

const today = () => todayInTimezone();

function dateParam(req: Request): string {
  const { date } = req.params;
  if (!isValidDateString(date)) {
    throw new AppError(400, "Date must be a real date in YYYY-MM-DD format");
  }
  return date;
}

function rejectFuture(date: string): void {
  if (date > today()) throw new AppError(400, "You can't log meals for a day in the future");
}

type StoredItem = MealItemLike & { foodId?: Types.ObjectId | null };

async function findItems(userId: string | undefined, date: string): Promise<StoredItem[]> {
  const day = await MealDayModel.findOne({ userId, date }).lean();
  return (day?.items ?? []) as StoredItem[];
}

/**
 * Totals per meal and for the day, plus the day's calorie balance.
 * Target and burn need a complete profile; without one they're null.
 */
async function buildDaySummary(userId: string | undefined, date: string, items: StoredItem[]) {
  const [user, entry] = await Promise.all([
    UserModel.findById(userId).lean(),
    DailyEntryModel.findOne({ userId, date }).select("activeCalories").lean(),
  ]);
  const profile = user ? buildSummary(user) : null;
  const totals = dayTotals(items);
  const activeCalories = entry?.activeCalories ?? null;

  const burn = profile ? estimatedBurn({ bmr: profile.bmr, tdee: profile.tdee, activeCalories }) : null;
  const balance =
    profile && burn ? calorieBalance({ eaten: totals.kcal, target: profile.calorieTarget, burn: burn.burn }) : null;

  return {
    totalsByMeal: totalsByMeal(items),
    totals,
    profileComplete: profile !== null,
    calorieTarget: profile?.calorieTarget ?? null,
    activeCalories,
    estimatedBurn: burn,
    remaining: balance?.remaining ?? null,
    netVsBurn: balance?.netVsBurn ?? null,
  };
}

async function sendDay(req: Request, res: Response, date: string, items: StoredItem[]): Promise<void> {
  res.json({ date, items, summary: await buildDaySummary(req.userId, date, items) });
}

/** How many times each food id appears in a list of items. */
function countFoodIds(items: { foodId?: unknown }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.foodId) counts.set(String(item.foodId), (counts.get(String(item.foodId)) ?? 0) + 1);
  }
  return counts;
}

/**
 * Bumps timesUsed/lastUsedAt for foods that were newly added to a day. Only *new*
 * uses count, so saving the same day again (e.g. after changing servings) doesn't
 * inflate the numbers.
 */
async function recordFoodUse(userId: string | undefined, before: { foodId?: unknown }[], after: { foodId?: unknown }[]) {
  const old = countFoodIds(before);
  const added = [...countFoodIds(after)].filter(([id, n]) => n > (old.get(id) ?? 0));
  if (added.length === 0) return;

  const now = new Date();
  await FoodModel.bulkWrite(
    added.map(([id, n]) => ({
      updateOne: {
        filter: { _id: id, userId },
        update: { $inc: { timesUsed: n - (old.get(id) ?? 0) }, $set: { lastUsedAt: now } },
      },
    })),
  );
}

/** Saves a day's items (an empty day is removed) and records which foods were used. */
async function writeDay(userId: string | undefined, date: string, items: StoredItem[], before: StoredItem[]) {
  if (items.length === 0) {
    await MealDayModel.deleteOne({ userId, date });
  } else {
    await MealDayModel.findOneAndUpdate(
      { userId, date },
      { $set: { items } },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }
  await recordFoodUse(userId, before, items);
}

// ---------- Handlers ----------

export async function getMealDay(req: Request, res: Response): Promise<void> {
  const date = dateParam(req);
  await sendDay(req, res, date, await findItems(req.userId, date));
}

export async function saveMealDay(req: Request, res: Response): Promise<void> {
  const date = dateParam(req);
  rejectFuture(date);
  const { items } = saveMealDaySchema.parse(req.body ?? {});

  // Keep food links only for foods this user owns; the snapshot stays either way
  const requestedIds = [...new Set(items.flatMap((i) => (i.foodId ? [i.foodId] : [])))];
  const owned = new Set(
    (await FoodModel.find({ userId: req.userId, _id: { $in: requestedIds } }).select("_id").lean()).map((f) =>
      String(f._id),
    ),
  );
  const cleaned: StoredItem[] = items.map(({ foodId, ...rest }: MealItemInput) =>
    foodId && owned.has(foodId) ? { ...rest, foodId: new Types.ObjectId(foodId) } : rest,
  );

  const before = await findItems(req.userId, date);
  await writeDay(req.userId, date, cleaned, before);
  await sendDay(req, res, date, cleaned);
}

/** Adds one meal (or the whole day) from another date onto this date. Existing items are kept. */
export async function copyMeals(req: Request, res: Response): Promise<void> {
  const date = dateParam(req);
  rejectFuture(date);
  const { fromDate, mealType } = copyMealsSchema.parse(req.body ?? {});
  if (fromDate === date) throw new AppError(400, "Choose a different day to copy from");

  const source = (await findItems(req.userId, fromDate)).filter((i) => !mealType || i.mealType === mealType);
  if (source.length === 0) {
    throw new AppError(400, mealType ? `Nothing was logged for that meal on ${fromDate}` : `Nothing was logged on ${fromDate}`);
  }

  const before = await findItems(req.userId, date);
  const items = [...before, ...source.map(({ time: _time, ...rest }: StoredItem & { time?: string }) => rest)];
  if (items.length > MEAL_LIMITS.itemsPerDay) {
    throw new AppError(400, `You can log up to ${MEAL_LIMITS.itemsPerDay} items a day`);
  }

  await writeDay(req.userId, date, items, before);
  await sendDay(req, res, date, items);
}

/** GET /api/meals/stats/weekly?to= — the 7 days ending on `to` (default today). */
export async function getWeeklyStats(req: Request, res: Response): Promise<void> {
  const to = req.query.to === undefined || req.query.to === "" ? today() : req.query.to;
  if (!isValidDateString(to)) throw new AppError(400, '"to" must be a real date in YYYY-MM-DD format');
  const from = addDays(to, -6);

  const [rows, user] = await Promise.all([
    MealDayModel.find({ userId: req.userId, date: { $gte: from, $lte: to } }).lean(),
    UserModel.findById(req.userId).lean(),
  ]);
  const kcalByDate = new Map(rows.map((r) => [r.date, dayTotals(r.items as StoredItem[]).kcal]));
  const days = listDates(from, to).map((date) => ({ date, kcal: kcalByDate.get(date) ?? null }));
  const calorieTarget = (user && buildSummary(user)?.calorieTarget) ?? null;

  res.json({ from, to, calorieTarget, days, ...weeklySummary(days, calorieTarget) });
}

/** GET /api/meals/stats/daily?days=14 — kcal per day for the last N days (null = nothing logged). */
export async function getDailyStats(req: Request, res: Response): Promise<void> {
  const days = req.query.days === undefined ? 14 : Number(req.query.days);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new AppError(400, '"days" must be a whole number from 1 to 90');
  }
  const to = today();
  const from = addDays(to, -(days - 1));

  const [rows, user] = await Promise.all([
    MealDayModel.find({ userId: req.userId, date: { $gte: from, $lte: to }, "items.0": { $exists: true } }).lean(),
    UserModel.findById(req.userId).lean(),
  ]);
  const kcalByDate = new Map(rows.map((r) => [r.date, dayTotals(r.items as StoredItem[]).kcal]));

  res.json({
    from,
    to,
    calorieTarget: (user && buildSummary(user)?.calorieTarget) ?? null,
    days: listDates(from, to).map((date) => ({ date, kcal: kcalByDate.get(date) ?? null })),
  });
}

/**
 * GET /api/meals/stats/low-intake — true if each of the last 3 logged days was below the safe
 * minimum for the user's sex. Today is left out because it's usually still in progress.
 */
export async function getLowIntake(req: Request, res: Response): Promise<void> {
  const user = await UserModel.findById(req.userId).lean();
  if (!user?.sex) {
    res.json({ lowIntake: false });
    return;
  }

  const recent = await MealDayModel.find({ userId: req.userId, date: { $lt: today() }, "items.0": { $exists: true } })
    .sort({ date: -1 })
    .limit(LOW_INTAKE_DAYS)
    .lean();

  res.json({ lowIntake: isLowIntake(recent.map((d) => dayTotals(d.items as StoredItem[]).kcal), MIN_CALORIES[user.sex]) });
}
