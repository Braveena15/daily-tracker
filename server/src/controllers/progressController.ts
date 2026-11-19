import type { Request, Response } from "express";
import { DailyEntryModel } from "../models/DailyEntry";
import { journeyStart, loadDays, loadUserContext, scoresFor, toScoreEntry } from "../services/dayData";
import { AppError } from "../utils/AppError";
import { addDays, isValidDateString, listDates, todayInTimezone } from "../utils/dates";
import { findInsights, type InsightDay } from "../utils/insights";
import {
  changeSinceStart,
  encouragement,
  expectedWeeklyChange,
  journeyProgress,
  summariseWeek,
  weekDifferences,
  weekRanges,
  weeklyChangeFromAverage,
  weightSeries,
  type ReviewDay,
} from "../utils/progress";
import { mentalScore } from "../utils/scores";

const today = () => todayInTimezone();
const minutes = (items: { durationMin?: number | null; minutes?: number | null }[]) =>
  items.reduce((s, i) => s + (i.durationMin ?? i.minutes ?? 0), 0);

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

  const { current, previous } = weekRanges(weekEnding);
  const [ctx, { entries, mealKcal }] = await Promise.all([
    loadUserContext(req.userId),
    loadDays(req.userId, previous.from, current.to),
  ]);

  const reviewDays = (from: string, to: string): ReviewDay[] =>
    listDates(from, to).map((date) => {
      const entry = entries.get(date);
      const s = scoresFor(ctx, entry, mealKcal.get(date));
      return {
        date,
        physical: s.physical.score,
        mental: s.mental.score,
        learning: s.learning.score,
        overall: s.overall,
        mood: entry?.mood ?? null,
        workouts: entry?.workouts.length ?? 0,
        workoutMinutes: entry ? minutes(entry.workouts) : 0,
        learningMinutes: entry ? minutes(entry.learnings) : 0,
        kcal: mealKcal.get(date) ?? null,
      };
    });

  const thisWeek = summariseWeek(reviewDays(current.from, current.to), current.from, current.to);
  const lastWeek = summariseWeek(reviewDays(previous.from, previous.to), previous.from, previous.to);
  const differences = weekDifferences(thisWeek, lastWeek);

  res.json({
    weekEnding,
    calorieTarget: ctx.summary?.calorieTarget ?? null,
    thisWeek,
    lastWeek,
    differences,
    message: encouragement(thisWeek, differences),
  });
}

/** GET /api/progress/journey — "Day X of 100". */
export async function getJourney(req: Request, res: Response): Promise<void> {
  const ctx = await loadUserContext(req.userId);
  const startDate = await journeyStart(req.userId, ctx.user);
  const rows = await DailyEntryModel.find({ userId: req.userId, date: { $gte: startDate } }).select("date -_id").lean();

  res.json(
    journeyProgress({
      startDate,
      lengthDays: ctx.goals.journeyLengthDays,
      today: today(),
      loggedDates: rows.map((r) => r.date),
    }),
  );
}

const INSIGHT_DAYS = 180;

/** GET /api/progress/insights — up to 3 patterns from the last 180 days of check-ins. */
export async function getInsights(req: Request, res: Response): Promise<void> {
  const to = today();
  const rows = await DailyEntryModel.find({ userId: req.userId, date: { $gte: addDays(to, -(INSIGHT_DAYS - 1)), $lte: to } }).lean();

  const days: InsightDay[] = rows.map((entry) => ({
    date: entry.date,
    mood: entry.mood,
    mentalScore: mentalScore(toScoreEntry(entry)).score ?? 0,
    activities: [...entry.workouts, ...entry.mentalActivities, ...entry.outdoorActivities].map((a) => a.type),
    outdoor: entry.outdoorActivities.length > 0,
    sleepHours: entry.sleepHours ?? null,
  }));

  res.json({ daysAnalysed: days.length, insights: findInsights(days) });
}
