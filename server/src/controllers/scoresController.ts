import type { Request, Response } from "express";
import { journeyStart, loadDays, loadUserContext, scoresFor } from "../services/dayData";
import { AppError } from "../utils/AppError";
import { addDays, daysBetween, isValidDateString, listDates, todayInTimezone } from "../utils/dates";

const MAX_RANGE_DAYS = 366;

function queryDate(value: unknown, name: string, fallback: string): string {
  if (value === undefined || value === "") return fallback;
  if (!isValidDateString(value)) throw new AppError(400, `"${name}" must be a real date in YYYY-MM-DD format`);
  return value;
}

/** GET /api/scores/:date — physical, mental and learning scores with breakdowns, plus overall. */
export async function getDayScores(req: Request, res: Response): Promise<void> {
  const { date } = req.params;
  if (!isValidDateString(date)) throw new AppError(400, "Date must be a real date in YYYY-MM-DD format");

  const [ctx, { entries, mealKcal }] = await Promise.all([loadUserContext(req.userId), loadDays(req.userId, date, date)]);
  res.json({ date, logged: entries.has(date), ...scoresFor(ctx, entries.get(date), mealKcal.get(date)) });
}

/** GET /api/scores?from=&to= — one row per day; scores are null on days without a check-in. */
export async function listScores(req: Request, res: Response): Promise<void> {
  const to = queryDate(req.query.to, "to", todayInTimezone());
  const from = queryDate(req.query.from, "from", addDays(to, -29));
  if (from > to) throw new AppError(400, '"from" must be on or before "to"');
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
    throw new AppError(400, `You can load at most ${MAX_RANGE_DAYS} days at a time`);
  }

  // Days before the journey start aren't listed at all
  const start = await journeyStart(req.userId);
  const [ctx, { entries, mealKcal }] = await Promise.all([loadUserContext(req.userId), loadDays(req.userId, from, to, start)]);
  const days = listDates(from < start ? start : from, to).map((date) => {
    const s = scoresFor(ctx, entries.get(date), mealKcal.get(date));
    return { date, physical: s.physical.score, mental: s.mental.score, learning: s.learning.score, overall: s.overall };
  });

  res.json({ from, to, journeyStartDate: start, days });
}
