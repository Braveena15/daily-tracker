import type { Request, Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { fieldCrypto } from "../config/encryption";
import { openDayPurposes, type StoredDayPurposes } from "../utils/dailyPurpose";
import { CHECKED_IN, DailyEntryModel, ENTRY_LIMITS, isCheckedIn } from "../models/DailyEntry";
import { updateProfileWeightIfLatest } from "../services/profileWeight";
import { AppError } from "../utils/AppError";
import { addDays, daysBetween, isValidDateString, todayInTimezone } from "../utils/dates";
import { journeyStart } from "../services/journey";
import { clampFrom, streaksSince } from "../utils/journey";
import {
  KIND_FIELDS,
  LoggedAtError,
  atTime,
  buildTimeline,
  isEntryKind,
  learnedList,
  resolveLoggedAt,
  type EntryKind,
  type TimelineSource,
} from "../utils/timeline";
import { CLEARABLE, dailySchema, entryPatchSchemas, entrySchemas, missedReasonSchema, waterTotalSchema } from "../validation/entrySchema";
import { canNoteMissedDay, openMissedReason, type StoredMissedReason } from "../utils/missedReason";
import { UserModel } from "../models/User";
import { goalNumbers } from "../services/dayData";
import { waterTotal, waterTotalRange } from "../utils/water";
import { planDailySave } from "../utils/dailySave";

const MAX_RANGE_DAYS = 366;
const LISTS = Object.values(KIND_FIELDS);

// ---------- Helpers ----------

// The app's "today", in the user's timezone
const today = () => todayInTimezone();

export function dateParam(req: Request): string {
  const { date } = req.params;
  if (!isValidDateString(date)) {
    throw new AppError(400, "Date must be a real date in YYYY-MM-DD format");
  }
  return date;
}

/** A date that can be written to: not in the future. */
export function writableDate(req: Request): string {
  const date = dateParam(req);
  if (date > today()) throw new AppError(400, "You can't log a day in the future");
  return date;
}

function kindParam(req: Request): EntryKind {
  const { kind } = req.params;
  if (!isEntryKind(kind)) {
    throw new AppError(404, `Unknown entry kind. Use one of: ${Object.keys(KIND_FIELDS).join(", ")}`);
  }
  return kind;
}

function idParam(req: Request): string {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new AppError(404, "Entry not found");
  return String(id);
}

function queryDate(value: unknown, name: string, fallback: string): string {
  if (value === undefined || value === "") return fallback;
  if (!isValidDateString(value)) {
    throw new AppError(400, `"${name}" must be a real date in YYYY-MM-DD format`);
  }
  return value;
}

function loggedAt(date: string, time: string | undefined): Date {
  try {
    return resolveLoggedAt(date, time, new Date(), today());
  } catch (err) {
    if (err instanceof LoggedAtError) throw new AppError(400, err.message);
    throw err;
  }
}

export type LeanDay = Record<string, unknown> & TimelineSource & { _id: unknown };

const withId = (item: Record<string, unknown>) => {
  const { _id, ...rest } = item;
  return _id === undefined ? rest : { id: String(_id), ...rest };
};

/** A stored day for the API: ids as strings, and every list newest first. */
export function serializeEntry(doc: LeanDay) {
  const { _id, __v, userId, ...rest } = doc;
  const out: Record<string, unknown> = { id: String(_id), ...rest };
  for (const field of LISTS) {
    const list = (doc[field] as Record<string, unknown>[] | undefined) ?? [];
    out[field] = list
      .map(withId)
      .sort((a, b) => new Date(String(b.loggedAt)).getTime() - new Date(String(a.loggedAt)).getTime());
  }
  // The day's purposes and evening note, decrypted (only ever sent to its owner)
  const { purposes, reflectionNote } = openDayPurposes(fieldCrypto, doc as StoredDayPurposes);
  out.dailyPurposes = purposes;
  out.dailyReflectionNote = reflectionNote;
  delete out.dailyPurpose; // an older day not moved yet (see services/purposesMigration.ts)
  // Older days may still hold these from when the watch synced steps and calories; they're no longer used
  for (const legacy of ["healthSnapshots", "restingCalories", "exerciseMinutes"]) delete out[legacy];
  // Why the day wasn't logged, with its note decrypted (only ever sent to its owner)
  out.missedReason = openMissedReason(fieldCrypto, doc.missedReason as StoredMissedReason);
  return out;
}

/** Everything the Today page and day views need. */
export function dayResponse(date: string, doc: LeanDay | null) {
  return {
    date,
    entry: doc ? serializeEntry(doc) : null,
    logged: doc ? isCheckedIn(doc) : false,
    timeline: doc ? buildTimeline(doc) : [],
    // Learnings have no time of day: the timeline lists them apart ("Learned today")
    learned: doc ? learnedList(doc) : [],
    // Water is shown on its own; it isn't part of the scores
    waterTotalMl: waterTotal(doc?.waterLogs),
  };
}

export const findDay = (userId: string | undefined, date: string) =>
  DailyEntryModel.findOne({ userId, date }).lean() as Promise<LeanDay | null>;

// ---------- Handlers ----------
// Every query filters by req.userId, so users only ever see and change their own entries.

export async function getToday(req: Request, res: Response): Promise<void> {
  const date = today();
  res.json(dayResponse(date, await findDay(req.userId, date)));
}

/** GET /api/entries/:date — the day, its chronological timeline and the intraday health snapshots. */
export async function getByDate(req: Request, res: Response): Promise<void> {
  const date = dateParam(req);
  res.json(dayResponse(date, await findDay(req.userId, date)));
}

/** PUT /api/entries/:date/daily — weight, steps and active calories typed in by hand. Always replaces. */
export async function saveDaily(req: Request, res: Response): Promise<void> {
  const date = writableDate(req);
  const body = dailySchema.parse(req.body ?? {});

  const before = await DailyEntryModel.findOne({ userId: req.userId, date }).select("sleep").lean();
  const { $set, $unset } = planDailySave(body, before?.sleep ?? null);

  const doc = (await DailyEntryModel.findOneAndUpdate(
    { userId: req.userId, date },
    Object.keys($unset).length > 0 ? { $set, $unset } : { $set },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  ).lean()) as LeanDay | null;

  // If this is the most recent day with a weight, it becomes the profile's current weight.
  const profileWeightUpdated = body.weightKg != null ? await updateProfileWeightIfLatest(req.userId, date, body.weightKg) : false;

  res.json({ ...dayResponse(date, doc), profileWeightUpdated });
}

/** POST /api/entries/:date/:kind — adds one entry, logged now (or at `time` earlier that day). */
export async function addEntry(req: Request, res: Response): Promise<void> {
  const date = writableDate(req);
  const kind = kindParam(req);
  const field = KIND_FIELDS[kind];
  const { time, ...values } = entrySchemas[kind].parse(req.body ?? {}) as Record<string, unknown> & { time?: string };

  const existing = await DailyEntryModel.findOne({ userId: req.userId, date }).select(field).lean();
  const count = ((existing as Record<string, unknown[] | undefined> | null)?.[field] ?? []).length;
  if (count >= ENTRY_LIMITS.listItems) {
    throw new AppError(400, `You can add up to ${ENTRY_LIMITS.listItems} of these a day`);
  }

  const item = {
    _id: new Types.ObjectId(),
    // A learning has no time of day: when it was added is kept only to sort the list (never shown)
    loggedAt: kind === "learnings" ? new Date() : loggedAt(date, time),
    ...Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)),
    ...(kind === "workouts" && { source: "manual" }),
  };
  const doc = (await DailyEntryModel.findOneAndUpdate(
    { userId: req.userId, date },
    { $push: { [field]: item } },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  ).lean()) as LeanDay | null;

  res.status(201).json({ ...dayResponse(date, doc), id: String(item._id) });
}

/**
 * PUT /api/entries/:date/water/total — sets the day's water to exactly `totalMl` (ml, or as typed:
 * "1.5 L"). The day's drinks are replaced by one entry holding the total, or none for 0.
 * Range: 0 to 2 × the water goal, never above 6000 ml. No future days, nothing before the journey start.
 */
export async function setWaterTotal(req: Request, res: Response): Promise<void> {
  const date = writableDate(req);
  const { totalMl } = waterTotalSchema.parse(req.body ?? {});
  const user = await UserModel.findById(req.userId).select("waterGoalMl journeyStartDate").lean();
  if (user?.journeyStartDate && date < user.journeyStartDate) {
    throw new AppError(400, "This day is before your journey started");
  }
  const { min, max } = waterTotalRange(goalNumbers(user ?? {}).waterGoalMl);
  if (totalMl < min || totalMl > max) {
    throw new AppError(400, `Today's water can be from ${min} to ${max} ml (2 × your goal)`);
  }

  // Keep the time of the day's latest drink, so the day reads the same; otherwise now (or midday on a past day)
  const existing = await DailyEntryModel.findOne({ userId: req.userId, date }).select("waterLogs").lean();
  const times = (existing?.waterLogs ?? []).map((w) => new Date(w.loggedAt).getTime());
  const at = times.length > 0 ? new Date(Math.max(...times)) : date === today() ? new Date() : atTime(date, "12:00");

  const doc = (await DailyEntryModel.findOneAndUpdate(
    { userId: req.userId, date },
    { $set: { waterLogs: totalMl > 0 ? [{ _id: new Types.ObjectId(), loggedAt: at, amountMl: totalMl }] : [] } },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  ).lean()) as LeanDay | null;
  res.json(dayResponse(date, doc));
}

/** The entry with this id on this day, or a 404. Watch workouts can't be changed by hand. */
async function findItem(req: Request, date: string, kind: EntryKind, id: string) {
  const field = KIND_FIELDS[kind];
  const doc = await DailyEntryModel.findOne({ userId: req.userId, date, [`${field}._id`]: id }).select(field).lean();
  const list = ((doc as Record<string, { _id: unknown; source?: string }[] | undefined> | null)?.[field] ?? []);
  const item = list.find((i) => String(i._id) === id);
  if (!item) throw new AppError(404, "Entry not found");
  return { field, item };
}

/** PATCH /api/entries/:date/:kind/:id — changes some fields of one entry (null clears an optional one). */
export async function updateEntry(req: Request, res: Response): Promise<void> {
  const date = writableDate(req);
  const kind = kindParam(req);
  const id = idParam(req);
  const { time, ...values } = entryPatchSchemas[kind].parse(req.body ?? {}) as Record<string, unknown> & { time?: string };
  const { field, item } = await findItem(req, date, kind, id);

  const $set: Record<string, unknown> = {};
  // An older day's workout from a watch sync becomes your own once you change it
  if (kind === "workouts" && item.source === "watch") $set[`${field}.$.source`] = "manual";
  const $unset: Record<string, 1> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    if (value === null && CLEARABLE[kind].includes(key)) $unset[`${field}.$.${key}`] = 1;
    else $set[`${field}.$.${key}`] = value;
  }
  if (time !== undefined) {
    const at = atTime(date, time);
    if (at.getTime() > Date.now() + 60_000) throw new AppError(400, "That time hasn't happened yet");
    $set[`${field}.$.loggedAt`] = at;
  }

  const doc = (await DailyEntryModel.findOneAndUpdate(
    { userId: req.userId, date, [`${field}._id`]: id },
    Object.keys($unset).length > 0 ? { $set, $unset } : { $set },
    { returnDocument: "after", runValidators: true },
  ).lean()) as LeanDay | null;

  res.json(dayResponse(date, doc));
}

/** DELETE /api/entries/:date/:kind/:id */
export async function deleteEntry(req: Request, res: Response): Promise<void> {
  const date = dateParam(req);
  const kind = kindParam(req);
  const id = idParam(req);
  const { field } = await findItem(req, date, kind, id);

  const doc = (await DailyEntryModel.findOneAndUpdate(
    { userId: req.userId, date },
    { $pull: { [field]: { _id: new Types.ObjectId(id) } } },
    { returnDocument: "after" },
  ).lean()) as LeanDay | null;

  res.json(dayResponse(date, doc));
}

/** DELETE /api/entries/:date — the whole day. */
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

  // Logged days from the journey start only: days that only hold Apple Health data are left out,
  // and days before the start are hidden (not deleted)
  const start = await journeyStart(req.userId);
  const rows = (await DailyEntryModel.find({ userId: req.userId, date: { $gte: clampFrom(from, start), $lte: to }, ...CHECKED_IN })
    .select("-healthSnapshots")
    .sort({ date: -1 })
    .lean()) as LeanDay[];
  // Days that weren't logged but have a reason ("Not logged · busy")
  const missed = await DailyEntryModel.find({ userId: req.userId, date: { $gte: clampFrom(from, start), $lte: to }, "missedReason.category": { $exists: true } })
    .select("date missedReason")
    .lean();
  res.json({
    from,
    to,
    journeyStartDate: start,
    entries: rows.map(serializeEntry),
    missed: missed.flatMap((m) => {
      const reason = openMissedReason(fieldCrypto, m.missedReason as StoredMissedReason);
      return reason && !rows.some((r) => r.date === m.date) ? [{ date: m.date, ...reason }] : [];
    }),
  });
}

/**
 * PUT /api/entries/:date/missed-reason — why the day wasn't logged: a category and an optional
 * note (encrypted). Only for today or yesterday. It doesn't make the day logged.
 */
export async function setMissedReason(req: Request, res: Response): Promise<void> {
  const date = dateParam(req);
  if (!canNoteMissedDay(date, today())) throw new AppError(400, "You can only note why for today or yesterday");
  const { category, note } = missedReasonSchema.parse(req.body ?? {});
  const sealed = note?.trim() ? fieldCrypto.encrypt(note.trim()) : undefined;
  const doc = (await DailyEntryModel.findOneAndUpdate(
    { userId: req.userId, date },
    { $set: { missedReason: { category, createdAt: new Date(), ...(sealed && { note: sealed }) } } },
    { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  ).lean()) as LeanDay | null;
  res.json(dayResponse(date, doc));
}

/** DELETE /api/entries/:date/missed-reason */
export async function clearMissedReason(req: Request, res: Response): Promise<void> {
  const date = dateParam(req);
  if (!canNoteMissedDay(date, today())) throw new AppError(400, "You can only note why for today or yesterday");
  const doc = (await DailyEntryModel.findOneAndUpdate({ userId: req.userId, date }, { $unset: { missedReason: 1 } }, { returnDocument: "after" }).lean()) as LeanDay | null;
  res.json(dayResponse(date, doc));
}

export async function getStreak(req: Request, res: Response): Promise<void> {
  // Only the date strings are needed, so this stays light even after years of entries.
  const start = await journeyStart(req.userId);
  const rows = await DailyEntryModel.find({ userId: req.userId, date: { $gte: start }, ...CHECKED_IN }).select("date -_id").lean();
  const todayDate = today();
  res.json({ today: todayDate, journeyStartDate: start, ...streaksSince(rows.map((r) => r.date), start, todayDate) });
}
