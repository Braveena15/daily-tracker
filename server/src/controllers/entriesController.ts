import type { Request, Response } from "express";
import { CHECKED_IN, DailyEntryModel } from "../models/DailyEntry";
import { updateProfileWeightIfLatest } from "../services/profileWeight";
import { fieldsStillFromWatch } from "../utils/healthSyncMerge";
import { sleepScoreAfterSave } from "../utils/sleepScoreField";
import { AppError } from "../utils/AppError";
import { addDays, daysBetween, isValidDateString, todayInTimezone } from "../utils/dates";
import { calculateStreaks } from "../utils/streaks";
import { OPTIONAL_NUMBERS, entrySchema } from "../validation/entrySchema";

const MAX_RANGE_DAYS = 366;

// ---------- Helpers ----------

// The app's "today", in the user's timezone
const today = () => todayInTimezone();

function dateParam(req: Request): string {
  const { date } = req.params;
  if (!isValidDateString(date)) {
    throw new AppError(400, "Date must be a real date in YYYY-MM-DD format");
  }
  return date;
}

function queryDate(value: unknown, name: string, fallback: string): string {
  if (value === undefined || value === "") return fallback;
  if (!isValidDateString(value)) {
    throw new AppError(400, `"${name}" must be a real date in YYYY-MM-DD format`);
  }
  return value;
}

async function findEntry(userId: string | undefined, date: string) {
  return DailyEntryModel.findOne({ userId, date });
}

// ---------- Handlers ----------
// Every query filters by req.userId, so users only ever see their own entries.

export async function getToday(req: Request, res: Response): Promise<void> {
  const date = today();
  res.json({ date, entry: await findEntry(req.userId, date) });
}

export async function getByDate(req: Request, res: Response): Promise<void> {
  const date = dateParam(req);
  res.json({ date, entry: await findEntry(req.userId, date) });
}

export async function saveByDate(req: Request, res: Response): Promise<void> {
  const date = dateParam(req);
  if (date > today()) {
    throw new AppError(400, "You can't log a day in the future");
  }

  const body = entrySchema.parse(req.body ?? {});

  // Optional numbers that were left out or set to null are removed from the entry.
  const { sleepScoreValue, ...rest } = body;
  const $set: Record<string, unknown> = { ...rest };
  const $unset: Record<string, 1> = {};
  for (const key of OPTIONAL_NUMBERS) {
    if (body[key] === undefined || body[key] === null) {
      delete $set[key];
      $unset[key] = 1;
    }
  }

  const before = await DailyEntryModel.findOne({ userId: req.userId, date })
    .select("weightKg steps activeCalories sleepHours healthSync sleepScoreValue sleepScoreSource sleep.score")
    .lean();

  // Sleep score: a typed value is "manual"; clearing it goes back to the calculated score
  const sleepScore = sleepScoreAfterSave(before, sleepScoreValue);
  Object.assign($set, sleepScore.set);
  for (const key of sleepScore.unset) $unset[key] = 1;

  // A watch value you changed by hand loses its ⌚ mark (see utils/healthSyncMerge.ts)
  const marked = before?.healthSync?.fields ?? [];
  if (marked.length > 0) {
    $set["healthSync.fields"] = fieldsStillFromWatch(marked, before ?? {}, body);
  }

  // Upsert: update this day's entry, or create it if it doesn't exist yet.
  const entry = await DailyEntryModel.findOneAndUpdate(
    { userId: req.userId, date },
    Object.keys($unset).length > 0 ? { $set, $unset } : { $set },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  );

  // If this is the most recent day with a weight, it becomes the profile's current weight.
  const profileWeightUpdated =
    body.weightKg != null ? await updateProfileWeightIfLatest(req.userId, date, body.weightKg) : false;

  res.json({ date, entry, profileWeightUpdated });
}

export async function deleteByDate(req: Request, res: Response): Promise<void> {
  const date = dateParam(req);
  const result = await DailyEntryModel.deleteOne({ userId: req.userId, date });
  res.json({ date, deleted: result.deletedCount > 0 });
}

export async function listEntries(req: Request, res: Response): Promise<void> {
  const to = queryDate(req.query.to, "to", today());
  const from = queryDate(req.query.from, "from", addDays(to, -29));

  if (from > to) {
    throw new AppError(400, '"from" must be on or before "to"');
  }
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) {
    throw new AppError(400, `You can load at most ${MAX_RANGE_DAYS} days at a time`);
  }

  // Check-ins only: days that so far only hold Apple Health data are left out
  const entries = await DailyEntryModel.find({ userId: req.userId, date: { $gte: from, $lte: to }, ...CHECKED_IN }).sort({
    date: -1,
  });
  res.json({ from, to, entries });
}

export async function getStreak(req: Request, res: Response): Promise<void> {
  // Only the date strings are needed, so this stays light even after years of entries.
  const rows = await DailyEntryModel.find({ userId: req.userId, ...CHECKED_IN }).select("date -_id").lean();
  const todayDate = today();
  res.json({ today: todayDate, ...calculateStreaks(rows.map((r) => r.date), todayDate) });
}
