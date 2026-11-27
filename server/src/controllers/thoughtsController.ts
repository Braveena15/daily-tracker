import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { fieldCrypto } from "../config/encryption";
import { ThoughtLogModel, type ThoughtLog } from "../models/Mind";
import { AppError } from "../utils/AppError";
import { todayInTimezone } from "../utils/dates";
import { containsCrisisLanguage } from "../utils/safety";
import { thoughtStats } from "../utils/thoughts";
import { THOUGHT_TEXT_FIELDS, createThoughtSchema, updateThoughtSchema } from "../validation/mindSchema";

// Every text field is encrypted before saving and decrypted before sending.
// Every query filters by req.userId, so users only ever see their own logs.

type TextField = (typeof THOUGHT_TEXT_FIELDS)[number];
type ThoughtDoc = ThoughtLog & { _id: unknown; createdAt: Date; updatedAt: Date };

export function toLog(doc: ThoughtDoc) {
  const texts = Object.fromEntries(
    THOUGHT_TEXT_FIELDS.map((field) => [field, doc[field] ? (fieldCrypto.tryDecrypt(doc[field]) ?? "") : ""]),
  ) as Record<TextField, string>;
  return {
    id: String(doc._id),
    date: doc.date,
    ...texts,
    feelings: doc.feelings.map((f) => ({ name: f.name, intensityBefore: f.intensityBefore })),
    distortions: doc.distortions,
    smallStepDone: doc.smallStepDone,
    smallStepDoneAt: doc.smallStepDoneAt ?? null,
    intensityAfter: doc.intensityAfter ?? null,
    isPrivate: doc.isPrivate,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/** Encrypts the text fields that were sent; an empty string clears a field. */
function applyText(doc: InstanceType<typeof ThoughtLogModel>, input: Partial<Record<TextField, string>>) {
  for (const field of THOUGHT_TEXT_FIELDS) {
    const value = input[field];
    if (value === undefined) continue;
    doc.set(field, value === "" ? undefined : fieldCrypto.encrypt(value));
  }
}

function crisisIn(input: Partial<Record<TextField, string>>): boolean {
  return containsCrisisLanguage(...THOUGHT_TEXT_FIELDS.map((f) => input[f]));
}

async function findOwn(req: Request) {
  const { id } = req.params;
  const doc = isValidObjectId(id) ? await ThoughtLogModel.findOne({ _id: id, userId: req.userId }) : null;
  if (!doc) throw new AppError(404, "Thought log not found");
  return doc;
}

export async function listThoughts(req: Request, res: Response): Promise<void> {
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new AppError(400, '"limit" must be 1–200');
  const docs = await ThoughtLogModel.find({ userId: req.userId }).sort({ date: -1, createdAt: -1 }).limit(limit).lean();
  res.json({ logs: docs.map((d) => toLog(d as ThoughtDoc)) });
}

/** GET /api/thoughts/stats — logs this month and the average drop in intensity. */
export async function getThoughtStats(req: Request, res: Response): Promise<void> {
  const month = todayInTimezone().slice(0, 7);
  // Only plain fields are needed, so nothing is decrypted here
  const docs = await ThoughtLogModel.find({ userId: req.userId }).select("date feelings intensityAfter -_id").lean();
  res.json(thoughtStats(docs, month));
}

export async function getThought(req: Request, res: Response): Promise<void> {
  const doc = await findOwn(req);
  res.json({ log: toLog(doc.toObject() as ThoughtDoc) });
}

export async function createThought(req: Request, res: Response): Promise<void> {
  const body = createThoughtSchema.parse(req.body ?? {});
  const doc = new ThoughtLogModel({
    userId: req.userId,
    date: body.date ?? todayInTimezone(),
    feelings: body.feelings ?? [],
    distortions: body.distortions ?? [],
    smallStepDone: body.smallStepDone ?? false,
    smallStepDoneAt: body.smallStepDone ? new Date() : undefined,
    intensityAfter: body.intensityAfter ?? undefined,
    isPrivate: body.isPrivate ?? false,
  });
  applyText(doc, body);
  await doc.save();
  res.status(201).json({ log: toLog(doc.toObject() as ThoughtDoc), showSupport: crisisIn(body) });
}

export async function updateThought(req: Request, res: Response): Promise<void> {
  const changes = updateThoughtSchema.parse(req.body ?? {});
  const doc = await findOwn(req);

  applyText(doc, changes);
  if (!doc.thought) throw new AppError(400, "The thought is required");
  if (changes.date !== undefined) doc.date = changes.date;
  if (changes.feelings !== undefined) doc.set("feelings", changes.feelings);
  if (changes.distortions !== undefined) doc.set("distortions", changes.distortions);
  if (changes.intensityAfter !== undefined) doc.set("intensityAfter", changes.intensityAfter ?? undefined);
  if (changes.isPrivate !== undefined) doc.isPrivate = changes.isPrivate;
  if (changes.smallStepDone !== undefined && changes.smallStepDone !== doc.smallStepDone) {
    doc.smallStepDone = changes.smallStepDone;
    doc.set("smallStepDoneAt", changes.smallStepDone ? new Date() : undefined);
  }
  await doc.save();

  res.json({ log: toLog(doc.toObject() as ThoughtDoc), showSupport: crisisIn(changes) });
}

export async function deleteThought(req: Request, res: Response): Promise<void> {
  const doc = await findOwn(req);
  await doc.deleteOne();
  res.json({ deleted: true });
}
