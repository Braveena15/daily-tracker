import type { Request, Response } from "express";
import { CHECKED_IN, DailyEntryModel } from "../models/DailyEntry";
import { goalNumbers, journeyStart, loadUserContext, loadWater } from "../services/dayData";
import { clampFrom } from "../utils/journey";
import { computeInsights, computeWeeklyReview } from "../services/progressData";
import { AppError } from "../utils/AppError";
import { UserModel } from "../models/User";
import { waterSeries, waterWeek } from "../utils/water";
import { addDays, isValidDateString, todayInTimezone } from "../utils/dates";
import {
  changeSinceStart,
  expectedWeeklyChange,
  journeyProgress,
  sleepSeries,
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
  // The chart starts at the journey start when that's more recent
  const from = clampFrom(addDays(to, -(days - 1)), start);
  // Load at least 5 weeks so the 4-week trend has a full average at both ends (never before the start)
  const loadFrom = clampFrom([from, addDays(to, -34)].sort()[0]!, start);

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

/** GET /api/progress/sleep?days=14 — hours slept and sleep score per day, including watch-only days. */
export async function getSleep(req: Request, res: Response): Promise<void> {
  const days = req.query.days === undefined ? 14 : Number(req.query.days);
  if (!Number.isInteger(days) || days < 7 || days > 90) {
    throw new AppError(400, '"days" must be a whole number from 7 to 90');
  }
  const to = today();
  const from = clampFrom(addDays(to, -(days - 1)), await journeyStart(req.userId));
  const rows = await DailyEntryModel.find({ userId: req.userId, date: { $gte: from, $lte: to }, sleepHours: { $ne: null } })
    .select("date sleepHours sleepScoreValue -_id")
    .lean();
  const nights = new Map(rows.map((r) => [r.date, { hours: r.sleepHours ?? null, score: r.sleepScoreValue ?? null }]));
  const points = sleepSeries(nights, from, to);
  const average = (values: (number | null)[], digits: number) => {
    const present = values.filter((v): v is number => v !== null);
    if (present.length === 0) return null;
    const f = 10 ** digits;
    return Math.round((present.reduce((s, v) => s + v, 0) / present.length) * f) / f;
  };

  res.json({
    from,
    to,
    days: points,
    avgHours: average(points.map((p) => p.hours), 1),
    avgScore: average(points.map((p) => p.score), 0),
  });
}

/** GET /api/progress/weekly-review?weekEnding=YYYY-MM-DD — this week vs the week before. */
export async function getWeeklyReview(req: Request, res: Response): Promise<void> {
  const weekEnding = req.query.weekEnding === undefined || req.query.weekEnding === "" ? today() : req.query.weekEnding;
  if (!isValidDateString(weekEnding)) throw new AppError(400, '"weekEnding" must be a real date in YYYY-MM-DD format');
  if (weekEnding > today()) throw new AppError(400, "That week hasn't happened yet");

  // entriesThisWeek is only for the AI's safety check; purpose text is sent only to its owner here
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

/** GET /api/progress/water?days=7 — each day's water (0 when none), from the journey start, with the goal. */
export async function getWater(req: Request, res: Response): Promise<void> {
  const days = req.query.days === undefined ? 7 : Number(req.query.days);
  if (!Number.isInteger(days) || days < 7 || days > 90) {
    throw new AppError(400, '"days" must be a whole number from 7 to 90');
  }
  const to = today();
  const [start, user] = await Promise.all([journeyStart(req.userId), UserModel.findById(req.userId).select("waterGoalMl glassSizeMl").lean()]);
  const from = clampFrom(addDays(to, -(days - 1)), start);
  const goalMl = goalNumbers(user ?? {}).waterGoalMl;
  const points = waterSeries(await loadWater(req.userId, from, to), from, to);
  res.json({ from, to, goalMl, days: points, ...waterWeek(points.map((p) => p.ml), goalMl) });
}
