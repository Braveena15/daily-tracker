// "What matters to me today": up to 5 a day, each with how strongly it's felt (intensity 0–10) and
// optional focus values, plus one evening note for the whole day. (Older purposes may still hold
// intentions in the database; they're no longer used or shown.)
// Text is encrypted before it's stored and decrypted only for its owner. Every query filters by req.userId.
import type { Request, Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { fieldCrypto } from "../config/encryption";
import { DailyEntryModel } from "../models/DailyEntry";
import { PurposeModel } from "../models/Mind";
import { journeyStart } from "../services/journey";
import { AppError } from "../utils/AppError";
import { addDays, daysBetween, dayStatus, isValidDateString, todayInTimezone } from "../utils/dates";
import {
  MAX_PURPOSES,
  hasDayPurposes,
  isEmptyPurpose,
  openDayPurposes,
  openHistory,
  pickFocusValues,
  purposeDaysRange,
  purposeStats,
  purposeSuggestions,
  recurringPurposes,
  sealText,
  splitPurposeDays,
  toPurposeContent,
} from "../utils/dailyPurpose";
import { dateParam, dayResponse, type LeanDay } from "./entriesController";
import {
  purposeCreateSchema,
  purposePatchSchema,
  reflectionNoteSchema,
} from "../validation/purposeSchema";

const MAX_RANGE_DAYS = 366;

/**
 * Purposes and the evening note can be added or changed for today and any earlier day from the
 * journey start (no lock at midnight); a future day can't have any yet.
 */
async function purposeDate(req: Request): Promise<string> {
  const date = dateParam(req);
  if (dayStatus(date) === "future") throw new AppError(400, "You can't add purposes for a future day.");
  if (date < (await journeyStart(req.userId))) throw new AppError(400, "This day is before your journey started.");
  return date;
}

function objectId(value: unknown, what: string): Types.ObjectId {
  if (typeof value !== "string" || !isValidObjectId(value)) throw new AppError(404, `${what} not found`);
  return new Types.ObjectId(value);
}

const purposeId = (req: Request) => objectId(req.params.purposeId, "Purpose");

/** One update on this user's day; null when the filter matched nothing (and there's no upsert). */
async function update(
  req: Request,
  date: string,
  filter: Record<string, unknown>,
  change: Record<string, unknown>,
  options: { upsert?: boolean; arrayFilters?: Record<string, unknown>[] } = {},
) {
  return (await DailyEntryModel.findOneAndUpdate({ userId: req.userId, date, ...filter }, change, {
    upsert: options.upsert ?? false,
    ...(options.arrayFilters && { arrayFilters: options.arrayFilters }),
    returnDocument: "after",
    runValidators: true,
    setDefaultsOnInsert: true,
  }).lean()) as LeanDay | null;
}

/** Focus values must be some of the user's core values (spelled as they are there). */
async function checkFocusValues(req: Request, chosen: string[]): Promise<string[]> {
  const purpose = await PurposeModel.findOne({ userId: req.userId }).select("coreValues").lean();
  const { values, unknown } = pickFocusValues(chosen, purpose?.coreValues ?? []);
  if (unknown.length > 0) throw new AppError(400, `Focus values must be from your core values (not "${unknown[0]}")`);
  return values;
}

const tooManyPurposes = () =>
  new AppError(400, `You already have ${MAX_PURPOSES} purposes today, which is plenty. Edit one, or let one go to make room.`);

// ---------- Purposes ----------

/** POST /api/entries/:date/purposes — add one of today's purposes (up to 5). */
export async function addPurpose(req: Request, res: Response): Promise<void> {
  const date = await purposeDate(req);
  const body = purposeCreateSchema.parse(req.body ?? {});
  const focusValues = body.focusValues ? await checkFocusValues(req, body.focusValues) : [];
  const now = new Date();
  const purpose = {
    _id: new Types.ObjectId(),
    text: fieldCrypto.encrypt(body.text),
    intensity: body.intensity,
    focusValues,
    intentions: [],
    createdAt: now,
    updatedAt: now,
  };

  const existing = await DailyEntryModel.exists({ userId: req.userId, date });
  // The limit is part of the update's filter, so two quick adds can't make a 6th
  const doc = await update(
    req,
    date,
    existing ? { [`dailyPurposes.${MAX_PURPOSES - 1}`]: { $exists: false } } : {},
    { $push: { dailyPurposes: purpose } },
    { upsert: !existing },
  );
  if (!doc) throw tooManyPurposes();
  res.status(201).json(dayResponse(date, doc));
}

/** PATCH /api/entries/:date/purposes/:purposeId — change the text, intensity or focus values. */
export async function updatePurpose(req: Request, res: Response): Promise<void> {
  const date = await purposeDate(req);
  const id = purposeId(req);
  const body = purposePatchSchema.parse(req.body ?? {});

  const $set: Record<string, unknown> = { "dailyPurposes.$.updatedAt": new Date() };
  if (body.text !== undefined) $set["dailyPurposes.$.text"] = fieldCrypto.encrypt(body.text);
  if (body.focusValues !== undefined) $set["dailyPurposes.$.focusValues"] = await checkFocusValues(req, body.focusValues);
  if (body.intensity !== undefined) $set["dailyPurposes.$.intensity"] = body.intensity;

  const doc = await update(req, date, { "dailyPurposes._id": id }, { $set });
  if (!doc) throw new AppError(404, "Purpose not found");
  res.json(dayResponse(date, doc));
}

/** DELETE /api/entries/:date/purposes/:purposeId */
export async function deletePurpose(req: Request, res: Response): Promise<void> {
  const date = await purposeDate(req);
  const id = purposeId(req);
  const doc = await update(req, date, { "dailyPurposes._id": id }, { $pull: { dailyPurposes: { _id: id } } });
  if (!doc) throw new AppError(404, "Purpose not found");
  res.json(dayResponse(date, doc));
}

// ---------- The evening note ----------

/** PUT /api/entries/:date/reflection-note — one note for the whole day; empty clears it. */
export async function saveReflectionNote(req: Request, res: Response): Promise<void> {
  const date = await purposeDate(req);
  const { note } = reflectionNoteSchema.parse(req.body ?? {});
  const sealed = sealText(fieldCrypto, note);
  const doc = await update(req, date, {}, sealed ? { $set: { dailyReflectionNote: sealed } } : { $unset: { dailyReflectionNote: 1 } }, { upsert: true });
  res.json(dayResponse(date, doc));
}

// ---------- /api/purpose ----------

/** GET /api/purpose/days?from=&to= — days with a purpose (decrypted), newest first, from the journey start only. */
export async function listPurposeDays(req: Request, res: Response): Promise<void> {
  const today = todayInTimezone();
  const date = (value: unknown, name: string, fallback: string) => {
    if (value === undefined || value === "") return fallback;
    if (!isValidDateString(value)) throw new AppError(400, `"${name}" must be a real date in YYYY-MM-DD format`);
    return value;
  };
  const start = await journeyStart(req.userId);
  // Inclusive of the journey start and of today (Asia/Colombo)
  const { from, to } = purposeDaysRange(
    { from: date(req.query.from, "from", "") || undefined, to: date(req.query.to, "to", "") || undefined },
    start,
    today,
  );
  if (from <= to && daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw new AppError(400, `You can load at most ${MAX_RANGE_DAYS} days at a time`);

  const rows = from > to
    ? []
    : await DailyEntryModel.find({ userId: req.userId, date: { $gte: from, $lte: to }, $or: [{ "dailyPurposes.0": { $exists: true } }, { dailyReflectionNote: { $exists: true } }] })
        .select("date dailyPurposes dailyReflectionNote")
        .sort({ date: -1 })
        .lean();
  const days = rows.flatMap((r) => {
    const day = openDayPurposes(fieldCrypto, r);
    return hasDayPurposes(day) ? [{ date: r.date, ...day }] : [];
  });
  // days: every day, newest first; today/past/isEmpty/canSetToday: what the list shows (see splitPurposeDays)
  res.json({
    from,
    to,
    todayDate: today,
    journeyStartDate: start,
    days,
    ...splitPurposeDays(days, today),
    stats: purposeStats(days),
    // What keeps coming back, most frequent first, with each one's last 30 days
    recurring: recurringPurposes(days, today),
  });
}

const SUGGESTION_DAYS = 365;

/**
 * GET /api/purpose/suggestions — wordings used on earlier days (one per normalized text, most used
 * first), so the same thing can be reused while typing. Decrypted for the owner only.
 */
export async function purposeSuggestionList(req: Request, res: Response): Promise<void> {
  const today = todayInTimezone();
  const rows = await DailyEntryModel.find({
    userId: req.userId,
    date: { $gte: addDays(today, -SUGGESTION_DAYS), $lte: today },
    "dailyPurposes.0": { $exists: true },
  })
    .select("date dailyPurposes")
    .lean();
  const days = rows.map((r) => ({ date: r.date, ...openDayPurposes(fieldCrypto, r) }));
  res.set("Cache-Control", "no-store");
  res.json({ suggestions: purposeSuggestions(days) });
}

/** GET /api/purpose/history — the current version, then earlier versions newest first. */
export async function getPurposeHistory(req: Request, res: Response): Promise<void> {
  const purpose = await PurposeModel.findOne({ userId: req.userId }).lean();
  const content = toPurposeContent(purpose);
  res.json({
    // null until something has been saved
    current:
      purpose && !isEmptyPurpose(content)
        ? {
            statement: content.purposeStatement,
            coreValues: content.coreValues,
            goals: content.longTermGoals,
            savedAt: new Date(purpose.updatedAt).toISOString(),
          }
        : null,
    history: openHistory(fieldCrypto, purpose?.purposeHistory ?? []),
  });
}
