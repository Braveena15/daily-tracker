import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { fieldCrypto } from "../config/encryption";
import { DiaryEntryModel, type DiaryEntry } from "../models/Mind";
import { AppError } from "../utils/AppError";
import { isValidDateString, todayInTimezone } from "../utils/dates";
import { containsCrisisLanguage } from "../utils/safety";
import { createDiarySchema, updateDiarySchema } from "../validation/mindSchema";

// Titles and bodies are encrypted before saving and decrypted before sending.
// Every query filters by req.userId, so users only ever see their own entries.

const PREVIEW_CHARS = 140;
const UNREADABLE = "(This entry can't be opened — it may have been saved with a different encryption key.)";

type DiaryDoc = DiaryEntry & { _id: unknown; createdAt: Date; updatedAt: Date };

function preview(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS).trimEnd()}…` : flat;
}

function toSummary(doc: DiaryDoc) {
  const body = fieldCrypto.tryDecrypt(doc.body);
  return {
    id: String(doc._id),
    date: doc.date,
    title: fieldCrypto.tryDecrypt(doc.title) ?? "",
    preview: body === null ? UNREADABLE : preview(body),
    tags: doc.tags,
    isFavourite: doc.isFavourite,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toEntry(doc: DiaryDoc) {
  const body = fieldCrypto.tryDecrypt(doc.body);
  return {
    id: String(doc._id),
    date: doc.date,
    title: fieldCrypto.tryDecrypt(doc.title) ?? "",
    body: body ?? UNREADABLE,
    unreadable: body === null,
    tags: doc.tags,
    isFavourite: doc.isFavourite,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function findOwn(req: Request) {
  const { id } = req.params;
  const doc = isValidObjectId(id) ? await DiaryEntryModel.findOne({ _id: id, userId: req.userId }) : null;
  if (!doc) throw new AppError(404, "Diary entry not found");
  return doc;
}

function queryDate(value: unknown, name: string): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (!isValidDateString(value)) throw new AppError(400, `"${name}" must be a real date in YYYY-MM-DD format`);
  return value;
}

/** GET /api/diary?from=&to=&tag=&favourites=true&limit= — titles and short previews, newest first. */
export async function listDiary(req: Request, res: Response): Promise<void> {
  const from = queryDate(req.query.from, "from");
  const to = queryDate(req.query.to, "to");
  const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new AppError(400, '"limit" must be 1–500');

  const filter: Record<string, unknown> = { userId: req.userId };
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (typeof req.query.tag === "string" && req.query.tag.trim()) filter.tags = req.query.tag.trim().toLowerCase();
  if (req.query.favourites === "true") filter.isFavourite = true;

  const [docs, allTags] = await Promise.all([
    DiaryEntryModel.find(filter).sort({ date: -1, createdAt: -1 }).limit(limit).lean(),
    DiaryEntryModel.distinct("tags", { userId: req.userId }),
  ]);

  res.json({ entries: docs.map((d) => toSummary(d as DiaryDoc)), tags: (allTags as string[]).sort() });
}

export async function getDiaryEntry(req: Request, res: Response): Promise<void> {
  const doc = await findOwn(req);
  res.json({ entry: toEntry(doc.toObject() as DiaryDoc) });
}

export async function createDiaryEntry(req: Request, res: Response): Promise<void> {
  const body = createDiarySchema.parse(req.body ?? {});
  const doc = await DiaryEntryModel.create({
    userId: req.userId,
    date: body.date ?? todayInTimezone(),
    title: fieldCrypto.encrypt(body.title),
    body: fieldCrypto.encrypt(body.body),
    tags: body.tags,
    isFavourite: body.isFavourite,
  });
  // Saving always succeeds; support contacts are offered alongside if the words suggest it
  res.status(201).json({ entry: toEntry(doc.toObject() as DiaryDoc), showSupport: containsCrisisLanguage(body.title, body.body) });
}

export async function updateDiaryEntry(req: Request, res: Response): Promise<void> {
  const changes = updateDiarySchema.parse(req.body ?? {});
  const doc = await findOwn(req);

  if (changes.date !== undefined) doc.date = changes.date;
  if (changes.title !== undefined) doc.title = fieldCrypto.encrypt(changes.title);
  if (changes.body !== undefined) doc.body = fieldCrypto.encrypt(changes.body);
  if (changes.tags !== undefined) doc.set("tags", changes.tags);
  if (changes.isFavourite !== undefined) doc.isFavourite = changes.isFavourite;
  await doc.save();

  res.json({ entry: toEntry(doc.toObject() as DiaryDoc), showSupport: containsCrisisLanguage(changes.title, changes.body) });
}

export async function deleteDiaryEntry(req: Request, res: Response): Promise<void> {
  const doc = await findOwn(req);
  await doc.deleteOne();
  res.json({ deleted: true });
}
