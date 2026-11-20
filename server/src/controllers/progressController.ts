import type { Request, Response } from "express";
import { CHECKED_IN, DailyEntryModel } from "../models/DailyEntry";
import { journeyStart, loadUserContext } from "../services/dayData";
import { computeInsights, computeWeeklyReview } from "../services/progressData";
import { AppError } from "../utils/AppError";
import { addDays, isValidDateString, todayInTimezone } from "../utils/dates";
import {
  changeSinceStart,
  expectedWeeklyChange,
  journeyProgress,
  weeklyChangeFromAverage,
  weightSeries,
} from "../utils/progress";

const today = () => todayInTimezone();

/** GET /api/progress/weight?days=90 */
export async function getWeight(req: Request, res: Response): Promise<void> {
  const days = req.query.days === undefined ? 90 : Number(req.query.days);
  if (!Number.isInteger(days) || days < 7 || days > 366) {
    throw new AppError(400, '"days" must be a whole number from 7 to 366');
  }

  const ctx = await loadUserContext(req.userId);
  const start = await journeyStart(req.userId, ctx.user);
  const to = today();
  const from = addDays(to, -(days - 1));
  // Load at least 5 weeks so the 4-week trend has a full average at both ends
  const loadFrom = [from, addDays(to, -34), start].sort()[0]!;

  const rows = await DailyEntryModel.find({
    userId: req.userId,
    date: { $gte: loadFrom, $lte: to },
    weightKg: { $ne: null },
  })
    .select("date weightKg -_id")
    .lean();
  const weights = rows.filter((r) => r.weightKg != null).map((r) => ({ date: r.date, weightKg: r.weightKg! }));

  const series = weightSeries(new Map(weights.map((w) => [w.date, w.weightKg])), loadFrom, to);
  const latest = [...weights].sort((a, b) => a.date.localeCompare(b.date)).pop() ?? null;

  res.json({
    from,
    to,
    points: series.filter((p) => p.date >= from),
    latestKg: latest?.weightKg ?? null,
    goalWeightKg: ctx.user.goalWeightKg ?? null,
    journeyStartDate: start,
    changeSinceStartKg: changeSinceStart(weights, start),
    weeklyChangeKg: weeklyChangeFromAverage(series),
    expectedWeeklyChangeKg: ctx.summary ? expectedWeeklyChange(ctx.summary.calorieTarget, ctx.summary.tdee) : null,
  });
}

/** GET /api/progress/weekly-review?weekEnding=YYYY-MM-DD — this week vs the week before. */
export async function getWeeklyReview(req: Request, res: Response): Promise<void> {
  const weekEnding = req.query.weekEnding === undefined || req.query.weekEnding === "" ? today() : req.query.weekEnding;
  if (!isValidDateString(weekEnding)) throw new AppError(400, '"weekEnding" must be a real date in YYYY-MM-DD format');
  if (weekEnding > today()) throw new AppError(400, "That week hasn't happened yet");

  const { entriesThisWeek: _entries, ...review } = await computeWeeklyReview(req.userId, weekEnding);
  res.json(review);
}

/** GET /api/progress/journey — "Day X of 100". */
export async function getJourney(req: Request, res: Response): Promise<void> {
  const ctx = await loadUserContext(req.userId);
  const startDate = await journeyStart(req.userId, ctx.user);
  const rows = await DailyEntryModel.find({ userId: req.userId, date: { $gte: startDate }, ...CHECKED_IN }).select("date -_id").lean();

  res.json(
    journeyProgress({
      startDate,
      lengthDays: ctx.goals.journeyLengthDays,
      today: today(),
      loggedDates: rows.map((r) => r.date),
    }),
  );
}


/** GET /api/progress/insights — up to 3 patterns from the last 180 days of check-ins. */
export async function getInsights(req: Request, res: Response): Promise<void> {
  res.json(await computeInsights(req.userId));
}
