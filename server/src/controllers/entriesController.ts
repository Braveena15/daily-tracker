import type { Request, Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { fieldCrypto } from "../config/encryption";
import { hasDailyPurpose, openDailyPurpose, type StoredDailyPurpose } from "../utils/dailyPurpose";
import { CHECKED_IN, DailyEntryModel, ENTRY_LIMITS, isCheckedIn } from "../models/DailyEntry";
import { updateProfileWeightIfLatest } from "../services/profileWeight";
import { fieldsStillFromWatch } from "../utils/healthSyncMerge";
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
  resolveLoggedAt,
  type EntryKind,
  type TimelineSource,
} from "../utils/timeline";
import { CLEARABLE, DAILY_FIELDS, dailySchema, entryPatchSchemas, entrySchemas } from "../validation/entrySchema";

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
  // Today's purpose, decrypted (only ever sent to its owner)
  const purpose = openDailyPurpose(fieldCrypto, doc.dailyPurpose as StoredDailyPurpose | undefined);
  out.dailyPurpose = hasDailyPurpose(purpose) ? purpose : null;
  return out;
}

/** Everything the Today page and day views need. */
export function dayResponse(date: string, doc: LeanDay | null) {
  return {
    date,
    entry: doc ? serializeEntry(doc) : null,
    logged: doc ? isCheckedIn(doc) : false,
    timeline: doc ? buildTimeline(doc) : [],
    healthSnapshots: doc?.healthSnapshots ?? [],
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

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  for (const key of DAILY_FIELDS) {
    if (body[key] === undefined) continue;
    if (body[key] === null) $unset[key] = 1;
    else $set[key] = body[key];
  }

  // A watch value you changed by hand loses its ⌚ mark (see utils/healthSyncMerge.ts)
  const before = await DailyEntryModel.findOne({ userId: req.userId, date }).select("weightKg steps activeCalories healthSync").lean();
  const marked = before?.healthSync?.fields ?? [];
  if (marked.length > 0) {
    const after = { ...before, ...Object.fromEntries(DAILY_FIELDS.filter((k) => k in body).map((k) => [k, body[k] ?? null])) };
    $set["healthSync.fields"] = fieldsStillFromWatch(marked, before ?? {}, after);
  }

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
    loggedAt: loggedAt(date, time),
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

/** The entry with this id on this day, or a 404. Watch workouts can't be changed by hand. */
async function findItem(req: Request, date: string, kind: EntryKind, id: string) {
  const field = KIND_FIELDS[kind];
  const doc = await DailyEntryModel.findOne({ userId: req.userId, date, [`${field}._id`]: id }).select(field).lean();
  const list = ((doc as Record<string, { _id: unknown; source?: string }[] | undefined> | null)?.[field] ?? []);
  const item = list.find((i) => String(i._id) === id);
  if (!item) throw new AppError(404, "Entry not found");
  if (kind === "workouts" && item.source === "watch") {
    throw new AppError(400, "Workouts from Apple Watch are updated by the next sync, so they can't be changed here");
  }
  return field;
}

/** PATCH /api/entries/:date/:kind/:id — changes some fields of one entry (null clears an optional one). */
export async function updateEntry(req: Request, res: Response): Promise<void> {
  const date = writableDate(req);
  const kind = kindParam(req);
  const id = idParam(req);
  const { time, ...values } = entryPatchSchemas[kind].parse(req.body ?? {}) as Record<string, unknown> & { time?: string };
  const field = await findItem(req, date, kind, id);

  const $set: Record<string, unknown> = {};
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
  const field = await findItem(req, date, kind, id);

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
  res.json({ from, to, journeyStartDate: start, entries: rows.map(serializeEntry) });
}

export async function getStreak(req: Request, res: Response): Promise<void> {
  // Only the date strings are needed, so this stays light even after years of entries.
  const start = await journeyStart(req.userId);
  const rows = await DailyEntryModel.find({ userId: req.userId, date: { $gte: start }, ...CHECKED_IN }).select("date -_id").lean();
  const todayDate = today();
  res.json({ today: todayDate, journeyStartDate: start, ...streaksSince(rows.map((r) => r.date), start, todayDate) });
}
