// Today's purpose: the day's intention, up to 5 small intentions, and the evening reflection.
// Text is encrypted before it's stored and decrypted only for its owner. Every query filters by req.userId.
import type { Request, Response } from "express";
import { isValidObjectId, Types } from "mongoose";
import { fieldCrypto } from "../config/encryption";
import { DailyEntryModel, ENTRY_LIMITS } from "../models/DailyEntry";
import { PurposeModel } from "../models/Mind";
import { journeyStart } from "../services/journey";
import { AppError } from "../utils/AppError";
import { addDays, daysBetween, isValidDateString, todayInTimezone } from "../utils/dates";
import { purposeDaysRange, splitPurposeDays } from "../utils/dailyPurpose";
import { LEGACY_PURPOSE_ID, MAX_PURPOSES, canAddIntention, hasDailyPurpose, isEmptyPurpose, openDailyPurpose, toPurposeContent, openHistory, pickFocusValues, purposeStats, sealText, type StoredDailyPurpose } from "../utils/dailyPurpose";
import { clampFrom } from "../utils/journey";
import { dateParam, dayResponse, type LeanDay } from "./entriesController";
import { dayStatus } from "../utils/dates";
import { dailyPurposeSchema, intentionPatchSchema, intentionSchema, purposeLineSchema, reflectionSchema } from "../validation/purposeSchema";

const MAX_RANGE_DAYS = 366;

/**
 * The day's purpose can only be created or changed on that day itself (Asia/Colombo): a past day's
 * purpose is locked, and a future day can't have one yet. There is one dailyPurpose per DailyEntry,
 * and one DailyEntry per user per date, so a day never has two.
 */
function purposeDate(req: Request): string {
  const date = dateParam(req);
  const status = dayStatus(date);
  if (status === "past") throw new AppError(403, "This day has ended — its purpose is locked.");
  if (status === "future") throw new AppError(400, "You can only set a purpose for today.");
  return date;
}

async function update(req: Request, date: string, change: Record<string, unknown>, filter: Record<string, unknown> = {}, upsert = true) {
  const doc = (await DailyEntryModel.findOneAndUpdate(
    { userId: req.userId, date, ...filter },
    change,
    { upsert, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
  ).lean()) as LeanDay | null;
  if (!doc) throw new AppError(404, "Intention not found");
  return doc;
}

function intentionId(req: Request): Types.ObjectId {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new AppError(404, "Intention not found");
  return new Types.ObjectId(String(id));
}

/** PUT /api/entries/:date/purpose — the day's purpose text and focus values (from the core values). */
export async function savePurposeOfDay(req: Request, res: Response): Promise<void> {
  const date = purposeDate(req);
  const body = dailyPurposeSchema.parse(req.body ?? {});
  const now = new Date();

  const $set: Record<string, unknown> = { "dailyPurpose.updatedAt": now };
  const $unset: Record<string, 1> = {};
  if (body.text !== undefined) {
    // Sets the day's purposes to just this one (or none)
    const sealed = sealText(fieldCrypto, body.text);
    $set["dailyPurpose.purposes"] = sealed ? [{ _id: new Types.ObjectId(), text: sealed, at: now }] : [];
    $unset["dailyPurpose.text"] = 1;
  }
  if (body.focusValues !== undefined) {
    const purpose = await PurposeModel.findOne({ userId: req.userId }).select("coreValues").lean();
    const { values, unknown } = pickFocusValues(body.focusValues, purpose?.coreValues ?? []);
    if (unknown.length > 0) throw new AppError(400, `Focus values must be from your core values (not "${unknown[0]}")`);
    $set["dailyPurpose.focusValues"] = values;
  }

  const existing = await DailyEntryModel.findOne({ userId: req.userId, date }).select("dailyPurpose.setAt").lean();
  if (!existing?.dailyPurpose?.setAt) $set["dailyPurpose.setAt"] = now;

  const doc = await update(req, date, Object.keys($unset).length ? { $set, $unset } : { $set });
  res.json(dayResponse(date, doc));
}

// ---------- The day's purposes (several a day) ----------

/**
 * An older day keeps its single purpose in `dailyPurpose.text`. Before its purposes are changed,
 * move that text into `purposes` (still encrypted, same text). Returns the id of the moved line, if any.
 */
async function moveLegacyPurpose(req: Request, date: string): Promise<Types.ObjectId | null> {
  const doc = await DailyEntryModel.findOne({ userId: req.userId, date }).select("dailyPurpose").lean();
  const stored = doc?.dailyPurpose;
  if (!stored?.text || (stored.purposes?.length ?? 0) > 0) return null;
  const id = new Types.ObjectId();
  await DailyEntryModel.updateOne(
    { userId: req.userId, date, "dailyPurpose.text": stored.text },
    { $set: { "dailyPurpose.purposes": [{ _id: id, text: stored.text, at: stored.setAt ?? new Date() }] }, $unset: { "dailyPurpose.text": 1 } },
  );
  return id;
}

/** The purpose line from the URL; "legacy" means an older day's single purpose (moved first). */
async function purposeLineId(req: Request, date: string): Promise<Types.ObjectId> {
  const moved = await moveLegacyPurpose(req, date);
  const { id } = req.params;
  if (id === LEGACY_PURPOSE_ID && moved) return moved;
  if (!isValidObjectId(id)) throw new AppError(404, "Purpose not found");
  return new Types.ObjectId(String(id));
}

/** POST /api/entries/:date/purpose/lines — add one of today's purposes (up to 5). */
export async function addPurposeLine(req: Request, res: Response): Promise<void> {
  const date = purposeDate(req);
  const { text } = purposeLineSchema.parse(req.body ?? {});
  await moveLegacyPurpose(req, date);

  const existing = await DailyEntryModel.findOne({ userId: req.userId, date }).select("dailyPurpose").lean();
  if ((existing?.dailyPurpose?.purposes?.length ?? 0) >= MAX_PURPOSES) {
    throw new AppError(400, `You can set up to ${MAX_PURPOSES} purposes a day`);
  }
  const now = new Date();
  const doc = await update(req, date, {
    $push: { "dailyPurpose.purposes": { _id: new Types.ObjectId(), text: fieldCrypto.encrypt(text), at: now } },
    $set: { "dailyPurpose.updatedAt": now, ...(!existing?.dailyPurpose?.setAt && { "dailyPurpose.setAt": now }) },
  });
  res.status(201).json(dayResponse(date, doc));
}

/** PATCH /api/entries/:date/purpose/lines/:id — change one of today's purposes. */
export async function updatePurposeLine(req: Request, res: Response): Promise<void> {
  const date = purposeDate(req);
  const { text } = purposeLineSchema.parse(req.body ?? {});
  const id = await purposeLineId(req, date);
  const doc = await update(
    req,
    date,
    { $set: { "dailyPurpose.purposes.$.text": fieldCrypto.encrypt(text), "dailyPurpose.updatedAt": new Date() } },
    { "dailyPurpose.purposes._id": id },
    false,
  ).catch((err) => {
    throw err instanceof AppError ? new AppError(404, "Purpose not found") : err;
  });
  res.json(dayResponse(date, doc));
}

/** DELETE /api/entries/:date/purpose/lines/:id */
export async function deletePurposeLine(req: Request, res: Response): Promise<void> {
  const date = purposeDate(req);
  const id = await purposeLineId(req, date);
  const doc = await update(
    req,
    date,
    { $pull: { "dailyPurpose.purposes": { _id: id } }, $set: { "dailyPurpose.updatedAt": new Date() } },
    { "dailyPurpose.purposes._id": id },
    false,
  ).catch((err) => {
    throw err instanceof AppError ? new AppError(404, "Purpose not found") : err;
  });
  res.json(dayResponse(date, doc));
}

/** POST /api/entries/:date/purpose/intentions — up to 5 a day. */
export async function addIntention(req: Request, res: Response): Promise<void> {
  const date = purposeDate(req);
  const { text } = intentionSchema.parse(req.body ?? {});

  const existing = await DailyEntryModel.findOne({ userId: req.userId, date }).select("dailyPurpose").lean();
  if (!canAddIntention(existing?.dailyPurpose?.intentions?.length ?? 0)) {
    throw new AppError(400, `You can set up to ${ENTRY_LIMITS.intentions} intentions a day`);
  }
  const now = new Date();
  const doc = await update(req, date, {
    $push: { "dailyPurpose.intentions": { _id: new Types.ObjectId(), text: fieldCrypto.encrypt(text), done: false } },
    $set: { "dailyPurpose.updatedAt": now, ...(!existing?.dailyPurpose?.setAt && { "dailyPurpose.setAt": now }) },
  });
  res.status(201).json(dayResponse(date, doc));
}

/** PATCH /api/entries/:date/purpose/intentions/:id — change the text, or tick it (saved with the time). */
export async function updateIntention(req: Request, res: Response): Promise<void> {
  const date = purposeDate(req);
  const id = intentionId(req);
  const body = intentionPatchSchema.parse(req.body ?? {});
  const now = new Date();

  const $set: Record<string, unknown> = { "dailyPurpose.updatedAt": now };
  const $unset: Record<string, 1> = {};
  if (body.text !== undefined) $set["dailyPurpose.intentions.$.text"] = fieldCrypto.encrypt(body.text);
  if (body.done !== undefined) {
    $set["dailyPurpose.intentions.$.done"] = body.done;
    if (body.done) $set["dailyPurpose.intentions.$.doneAt"] = now;
    else $unset["dailyPurpose.intentions.$.doneAt"] = 1;
  }

  const doc = await update(req, date, Object.keys($unset).length ? { $set, $unset } : { $set }, { "dailyPurpose.intentions._id": id }, false);
  res.json(dayResponse(date, doc));
}

/** DELETE /api/entries/:date/purpose/intentions/:id */
export async function deleteIntention(req: Request, res: Response): Promise<void> {
  const date = purposeDate(req);
  const id = intentionId(req);
  const doc = await update(
    req,
    date,
    { $pull: { "dailyPurpose.intentions": { _id: id } }, $set: { "dailyPurpose.updatedAt": new Date() } },
    { "dailyPurpose.intentions._id": id },
    false,
  );
  res.json(dayResponse(date, doc));
}

/** PUT /api/entries/:date/purpose/reflection — "How well did I live my purpose today?" 1–5 + a note. */
export async function saveReflection(req: Request, res: Response): Promise<void> {
  const date = purposeDate(req);
  const { rating, note } = reflectionSchema.parse(req.body ?? {});
  const now = new Date();
  const sealed = sealText(fieldCrypto, note);
  const doc = await update(req, date, {
    $set: { "dailyPurpose.reflection": { rating, at: now, ...(sealed && { note: sealed }) }, "dailyPurpose.updatedAt": now },
  });
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
    : await DailyEntryModel.find({ userId: req.userId, date: { $gte: from, $lte: to }, dailyPurpose: { $exists: true } })
        .select("date dailyPurpose")
        .sort({ date: -1 })
        .lean();
  const days = rows.flatMap((r) => {
    const purpose = openDailyPurpose(fieldCrypto, r.dailyPurpose as StoredDailyPurpose);
    return hasDailyPurpose(purpose) ? [{ date: r.date, ...purpose }] : [];
  });
  // days: every day, newest first; today/past/isEmpty/canSetToday: what the list shows (see splitPurposeDays)
  res.json({ from, to, todayDate: today, journeyStartDate: start, days, ...splitPurposeDays(days, today), stats: purposeStats(days) });
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
