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
import { canAddIntention, hasDailyPurpose, isEmptyPurpose, openDailyPurpose, toPurposeContent, openHistory, pickFocusValues, purposeStats, sealText, type StoredDailyPurpose } from "../utils/dailyPurpose";
import { clampFrom } from "../utils/journey";
import { dayResponse, writableDate, type LeanDay } from "./entriesController";
import { dailyPurposeSchema, intentionPatchSchema, intentionSchema, reflectionSchema } from "../validation/purposeSchema";

const MAX_RANGE_DAYS = 366;

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
  const date = writableDate(req);
  const body = dailyPurposeSchema.parse(req.body ?? {});
  const now = new Date();

  const $set: Record<string, unknown> = { "dailyPurpose.updatedAt": now };
  const $unset: Record<string, 1> = {};
  if (body.text !== undefined) {
    const sealed = sealText(fieldCrypto, body.text);
    if (sealed) $set["dailyPurpose.text"] = sealed;
    else $unset["dailyPurpose.text"] = 1;
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

/** POST /api/entries/:date/purpose/intentions — up to 5 a day. */
export async function addIntention(req: Request, res: Response): Promise<void> {
  const date = writableDate(req);
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
  const date = writableDate(req);
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
  const date = writableDate(req);
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
  const date = writableDate(req);
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
  const to = date(req.query.to, "to", today);
  const start = await journeyStart(req.userId);
  const from = clampFrom(date(req.query.from, "from", addDays(to, -29)), start);
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw new AppError(400, `You can load at most ${MAX_RANGE_DAYS} days at a time`);

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
  res.json({ from, to, journeyStartDate: start, days, stats: purposeStats(days) });
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
