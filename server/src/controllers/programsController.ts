// Transformation programs. Every query filters by req.userId, so users only ever see and change
// their own programs and photos. Free text is encrypted before saving and decrypted only for its
// owner; photos are encrypted in GridFS (bucket "programPhotos") and never public.
import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { isValidObjectId } from "mongoose";
import { fieldCrypto } from "../config/encryption";
import { DailyEntryModel } from "../models/DailyEntry";
import { PROGRAM_LIMITS, ProgramModel } from "../models/Program";
import { UserModel } from "../models/User";
import { deleteFiles, readFile, storeFile, totalBytesUsed } from "../services/encryptedFiles";
import { activeProgram } from "../services/programs";
import { computeProgramProgress } from "../services/programStats";
import { buildSummary } from "../services/profileSummary";
import { AppError } from "../utils/AppError";
import { addDays, isValidDateString, todayInTimezone } from "../utils/dates";
import { createUploadQuota, sniffReceiptType } from "../utils/expenses";
import { canUndoEnd, dueCheckIn, plannedEndDate, programClock } from "../utils/program";
import { STORAGE_LIMIT_BYTES } from "./expensesController";
import {
  checkInSchema,
  createProgramSchema,
  endProgramSchema,
  habitsDoneSchema,
  snapshotSchema,
  updateProgramSchema,
} from "../validation/programSchema";
import type { z } from "zod";

const today = () => todayInTimezone();
const PHOTO_SLOTS = ["baseline", "midpoint", "final"] as const;
type PhotoSlot = (typeof PHOTO_SLOTS)[number];
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

type ProgramDoc = NonNullable<Awaited<ReturnType<typeof ProgramModel.findOne>>>;
type Snapshot = {
  date?: string | null;
  weightKg?: number | null;
  waistCm?: number | null;
  chestCm?: number | null;
  hipsCm?: number | null;
  armCm?: number | null;
  ratings?: unknown;
  habits?: string[];
  text?: string | null;
  photos?: { fileId: string; mimeType?: string | null; size?: number | null; uploadedAt?: Date | null }[];
  skipped?: boolean | null;
} | null | undefined;

const open = (stored: string | null | undefined) => (stored ? (fieldCrypto.tryDecrypt(stored) ?? "") : "");
const seal = (plain: string | null | undefined) => (plain ? fieldCrypto.encrypt(plain) : undefined);

function snapshotOut(s: Snapshot) {
  if (!s) return null;
  return {
    date: s.date ?? null,
    weightKg: s.weightKg ?? null,
    waistCm: s.waistCm ?? null,
    chestCm: s.chestCm ?? null,
    hipsCm: s.hipsCm ?? null,
    armCm: s.armCm ?? null,
    ratings: s.ratings ?? {},
    habits: s.habits ?? [],
    text: open(s.text),
    photos: (s.photos ?? []).map((p) => ({ fileId: p.fileId, mimeType: p.mimeType ?? null, size: p.size ?? null, uploadedAt: p.uploadedAt ?? null })),
    skipped: s.skipped === true,
  };
}

/** A program for its owner: text decrypted, with where it stands today. */
export function serializeProgram(p: ProgramDoc | Record<string, any>, now: Date = new Date()) {
  const doc = (typeof (p as ProgramDoc).toObject === "function" ? (p as ProgramDoc).toObject() : p) as Record<string, any>;
  const day = todayInTimezone(undefined, now);
  const clock = programClock(doc.startDate, doc.lengthDays, day);
  return {
    id: String(doc._id),
    name: doc.name,
    lengthDays: doc.lengthDays,
    startDate: doc.startDate,
    plannedEndDate: plannedEndDate(doc.startDate, doc.lengthDays),
    status: doc.status,
    endedOn: doc.endedOn ?? null,
    endedOnDay: doc.endedOnDay ?? null,
    endedAt: doc.endedAt ?? null,
    endReason: doc.endReason ?? null,
    endNote: open(doc.endNote),
    migrated: doc.migrated === true,
    baseline: snapshotOut(doc.baseline),
    goals: {
      goalWeightKg: doc.goals?.goalWeightKg ?? null,
      ratings: doc.goals?.ratings ?? {},
      habits: doc.goals?.habits ?? [],
      focusAreas: doc.goals?.focusAreas ?? [],
      notes: open(doc.goals?.notes),
    },
    plan: {
      waterMl: doc.plan?.waterMl ?? null,
      calorieTarget: doc.plan?.calorieTarget ?? null,
      sleepHours: doc.plan?.sleepHours ?? null,
      workoutsPerWeek: doc.plan?.workoutsPerWeek ?? null,
      learningMinutes: doc.plan?.learningMinutes ?? null,
      customHabits: (doc.plan?.customHabits ?? []).map((h: { id: string; label: string }) => ({ id: h.id, label: h.label })),
    },
    midpoint: snapshotOut(doc.midpoint),
    final: snapshotOut(doc.final),
    clock,
    dueCheckIn: dueCheckIn(
      { status: doc.status, startDate: doc.startDate, lengthDays: doc.lengthDays, midpointDone: !!doc.midpoint, finalDone: !!doc.final },
      day,
    ),
    canUndoEnd: canUndoEnd({ status: doc.status, endedAt: doc.endedAt }, now),
    createdAt: doc.createdAt ?? null,
  };
}

function snapshotIn(input: z.infer<typeof snapshotSchema>, date: string, keepPhotos: Snapshot = null) {
  return {
    date,
    weightKg: input.weightKg ?? undefined,
    waistCm: input.waistCm ?? undefined,
    chestCm: input.chestCm ?? undefined,
    hipsCm: input.hipsCm ?? undefined,
    armCm: input.armCm ?? undefined,
    ratings: input.ratings,
    habits: input.habits,
    text: seal(input.text),
    photos: keepPhotos?.photos ?? [],
    skipped: false,
  };
}

const habitId = () => randomBytes(4).toString("hex");

function planIn(plan: z.infer<typeof createProgramSchema>["plan"], previous: { id: string; label: string }[] = []) {
  // Keep the id of a habit that's still there, so its ticks on past days still match
  const customHabits = plan.customHabits.map((label) => previous.find((h) => h.label === label) ?? { id: habitId(), label });
  return { ...plan, customHabits };
}

async function ownProgram(req: Request): Promise<ProgramDoc> {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new AppError(404, "Program not found");
  const program = await ProgramModel.findOne({ _id: id, userId: req.userId });
  if (!program) throw new AppError(404, "Program not found");
  return program;
}

// ---------- Reading ----------

/** GET /api/programs — every program, newest first. */
export async function listPrograms(req: Request, res: Response): Promise<void> {
  await activeProgram(req.userId); // settles a program whose last day has passed
  const programs = await ProgramModel.find({ userId: req.userId }).sort({ startDate: -1, createdAt: -1 }).lean();
  res.json({ programs: programs.map((p) => serializeProgram(p)) });
}

/**
 * GET /api/programs/active — the active program (or null), and the most recent finished one, so
 * Today can say "Program ended on day 37 — view your report".
 */
export async function getActiveProgram(req: Request, res: Response): Promise<void> {
  const program = await activeProgram(req.userId);
  const latest = program ? null : await ProgramModel.findOne({ userId: req.userId, status: { $ne: "active" } }).sort({ updatedAt: -1 }).lean();
  res.json({ today: today(), program: program ? serializeProgram(program) : null, latestEnded: latest ? serializeProgram(latest) : null });
}

/** GET /api/programs/:id */
export async function getProgram(req: Request, res: Response): Promise<void> {
  res.json({ program: serializeProgram(await ownProgram(req)) });
}

/**
 * GET /api/programs/:id/progress — baseline vs goal vs latest, weekly progress, habits and targets,
 * over day 1 → today (or the day it ended).
 */
export async function getProgramProgress(req: Request, res: Response): Promise<void> {
  const program = await ownProgram(req);
  res.json(await computeProgramProgress(req.userId, program, today()));
}

// ---------- Creating and changing ----------

/** POST /api/programs — "Review & start". Only one program can be active. */
export async function createProgram(req: Request, res: Response): Promise<void> {
  const input = createProgramSchema.parse(req.body);
  const day = today();
  if (input.startDate < addDays(day, -365) || input.startDate > addDays(day, 60)) {
    throw new AppError(400, "The start date must be within the last year or the next 60 days");
  }
  if (await activeProgram(req.userId, day)) {
    throw new AppError(409, "You already have an active program. End it first to start a new one.");
  }
  // The calorie target defaults to the one calculated from the profile
  let calorieTarget = input.plan.calorieTarget;
  if (calorieTarget == null) {
    const user = await UserModel.findById(req.userId).lean();
    calorieTarget = user ? buildSummary(user)?.calorieTarget : undefined;
  }

  try {
    const program = await ProgramModel.create({
      userId: req.userId,
      name: input.name,
      lengthDays: input.lengthDays,
      startDate: input.startDate,
      status: "active",
      baseline: snapshotIn(input.baseline, input.startDate),
      goals: { ...input.goals, notes: seal(input.goals.notes) },
      plan: planIn({ ...input.plan, calorieTarget }),
    });
    res.status(201).json({ program: serializeProgram(program) });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, "You already have an active program. End it first to start a new one.");
    throw err;
  }
}

/** PUT /api/programs/:id — name, goals or the daily plan (not the dates). */
export async function updateProgram(req: Request, res: Response): Promise<void> {
  const program = await ownProgram(req);
  const input = updateProgramSchema.parse(req.body);
  if (input.name !== undefined) program.name = input.name;
  if (input.goals) program.set("goals", { ...input.goals, notes: seal(input.goals.notes) });
  if (input.plan) {
    const previous = (program.plan?.customHabits ?? []).map((h) => ({ id: h.id, label: h.label }));
    program.set("plan", planIn(input.plan, previous));
  }
  await program.save();
  res.json({ program: serializeProgram(program) });
}

/** PUT /api/programs/:id/baseline — edit "Where I am now" (photos are kept). */
export async function updateBaseline(req: Request, res: Response): Promise<void> {
  const program = await ownProgram(req);
  const input = snapshotSchema.parse(req.body);
  program.set("baseline", snapshotIn(input, program.startDate, program.baseline as Snapshot));
  await program.save();
  res.json({ program: serializeProgram(program) });
}

/**
 * PUT /api/programs/:id/check-ins/:kind — the midpoint or final check-in, or { skipped: true }.
 * The midpoint is for an active program; the final also for one that's completed or ended early.
 */
export async function saveCheckIn(req: Request, res: Response): Promise<void> {
  const kind = req.params.kind;
  if (kind !== "midpoint" && kind !== "final") throw new AppError(404, "Check-in not found");
  const program = await ownProgram(req);
  if (program.status === "abandoned" || (kind === "midpoint" && program.status !== "active")) {
    throw new AppError(400, "This check-in isn't available for this program");
  }
  if (programClock(program.startDate, program.lengthDays, today()).phase === "upcoming") {
    throw new AppError(400, "This program hasn't started yet");
  }
  const input = checkInSchema.parse(req.body);
  const previous = program.get(kind) as Snapshot;
  if ("skipped" in input) {
    // A skipped check-in keeps any photos already added (none, normally)
    program.set(kind, { date: today(), skipped: true, photos: previous?.photos ?? [] });
  } else {
    program.set(kind, snapshotIn(input, today(), previous));
  }
  await program.save();
  res.json({ program: serializeProgram(program) });
}

// ---------- Ending ----------

/** POST /api/programs/:id/end — end early, on any day. The report then covers day 1 → today. */
export async function endProgram(req: Request, res: Response): Promise<void> {
  const program = await ownProgram(req);
  if (program.status !== "active") throw new AppError(400, "Only an active program can be ended");
  const day = today();
  const clock = programClock(program.startDate, program.lengthDays, day);
  if (clock.phase === "upcoming") throw new AppError(400, "This program hasn't started yet. You can delete it instead.");
  if (clock.phase === "finished") {
    program.status = "completed";
    await program.save();
    throw new AppError(400, "This program has already finished");
  }
  const input = endProgramSchema.parse(req.body ?? {});
  program.set({
    status: "ended_early",
    endedOn: day,
    endedOnDay: clock.dayNumber,
    endedAt: new Date(),
    endReason: input.reason ?? undefined,
    endNote: seal(input.note),
  });
  await program.save();
  res.json({ program: serializeProgram(program) });
}

/** POST /api/programs/:id/undo-end — within 24 hours, as if it had never ended. */
export async function undoEndProgram(req: Request, res: Response): Promise<void> {
  const program = await ownProgram(req);
  if (!canUndoEnd({ status: program.status, endedAt: program.endedAt })) {
    throw new AppError(400, "Ending can only be undone within 24 hours");
  }
  if (await ProgramModel.exists({ userId: req.userId, status: "active" })) {
    throw new AppError(409, "You've already started a new program, so this one can't be restarted");
  }
  program.set({ status: "active", endedOn: undefined, endedOnDay: undefined, endedAt: undefined, endReason: undefined, endNote: undefined });
  try {
    await program.save();
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new AppError(409, "You've already started a new program, so this one can't be restarted");
    throw err;
  }
  res.json({ program: serializeProgram(program) });
}

/** DELETE /api/programs/:id — only a program that hasn't started yet (its photos go too). */
export async function deleteUpcomingProgram(req: Request, res: Response): Promise<void> {
  const program = await ownProgram(req);
  if (programClock(program.startDate, program.lengthDays, today()).phase !== "upcoming") {
    throw new AppError(400, "A program that has started can be ended, not deleted");
  }
  await deleteFiles("programPhotos", allPhotoIds(program));
  await ProgramModel.deleteOne({ _id: program._id, userId: req.userId });
  res.json({ deleted: true });
}

// ---------- Daily habits ----------

/** PUT /api/programs/habits/:date — which of the active program's daily habits were done that day. */
export async function setHabitsDone(req: Request, res: Response): Promise<void> {
  const date = String(req.params.date);
  if (!isValidDateString(date)) throw new AppError(400, "Date must be a real date in YYYY-MM-DD format");
  const day = today();
  if (date > day) throw new AppError(400, "That day hasn't happened yet");
  const program = await activeProgram(req.userId, day);
  if (!program) throw new AppError(400, "There's no active program");
  if (date < program.startDate) throw new AppError(400, "That day is before your program started");
  const { done } = habitsDoneSchema.parse(req.body);
  const known = new Set((program.plan?.customHabits ?? []).map((h) => h.id));
  const ids = [...new Set(done.filter((id) => known.has(id)))];
  await DailyEntryModel.updateOne({ userId: req.userId, date }, { $set: { programHabitsDone: ids } }, { upsert: true });
  res.json({ date, done: ids });
}

// ---------- Photos ----------

function allPhotoIds(program: ProgramDoc): string[] {
  return PHOTO_SLOTS.flatMap((slot) => ((program.get(slot) as Snapshot)?.photos ?? []).map((p) => p.fileId));
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PHOTO_MAX_BYTES, files: PROGRAM_LIMITS.photos, fields: 2 } });

/** multer for "files" (up to 4), with friendly errors. */
export function photoUpload(req: Request, res: Response, next: NextFunction): void {
  upload.array("files", PROGRAM_LIMITS.photos)(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Each photo can be at most 5 MB"
          : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
            ? `Send up to ${PROGRAM_LIMITS.photos} photos, in a field called "files"`
            : "That upload couldn't be read";
      return next(new AppError(400, message));
    }
    next(err);
  });
}

const photoQuota = createUploadQuota(30);

function slotParam(req: Request): PhotoSlot {
  const slot = req.params.slot as PhotoSlot;
  if (!PHOTO_SLOTS.includes(slot)) throw new AppError(404, "Not found");
  return slot;
}

/** POST /api/programs/:id/photos/:slot (multipart "files") — up to 4 photos per baseline or check-in. */
export async function addPhotos(req: Request, res: Response): Promise<void> {
  const program = await ownProgram(req);
  const slot = slotParam(req);
  const snapshot = program.get(slot) as Snapshot;
  if (!snapshot) throw new AppError(400, "Save the check-in first, then add photos");
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw new AppError(400, "Choose at least one photo");
  if ((snapshot.photos?.length ?? 0) + files.length > PROGRAM_LIMITS.photos) {
    throw new AppError(400, `Up to ${PROGRAM_LIMITS.photos} photos each`);
  }
  for (const file of files) {
    const type = sniffReceiptType(file.buffer);
    if (file.size === 0 || !type || !PHOTO_TYPES.has(type)) throw new AppError(400, "Photos can be JPEG, PNG, WebP or HEIC");
  }
  const used = await totalBytesUsed(String(req.userId));
  if (used + files.reduce((s, f) => s + f.size, 0) > STORAGE_LIMIT_BYTES) {
    throw new AppError(400, "Your storage is full. Delete some older receipts or photos to add new ones.");
  }
  if (!photoQuota.take(String(req.userId), files.length)) {
    throw new AppError(429, "That's a lot of uploads for one hour. Please try again a little later.");
  }

  const added = [];
  for (const file of files) {
    const type = sniffReceiptType(file.buffer)!;
    const fileId = await storeFile("programPhotos", String(req.userId), file.buffer, `${slot}-photo`, type);
    added.push({ fileId, mimeType: type, size: file.size, uploadedAt: new Date() });
  }
  const updated = await ProgramModel.findOneAndUpdate(
    { _id: program._id, userId: req.userId },
    { $push: { [`${slot}.photos`]: { $each: added } } },
    { returnDocument: "after" },
  );
  res.status(201).json({ program: serializeProgram(updated!) });
}

/** DELETE /api/programs/:id/photos/:slot/:fileId */
export async function removePhoto(req: Request, res: Response): Promise<void> {
  const program = await ownProgram(req);
  const slot = slotParam(req);
  const fileId = String(req.params.fileId);
  if (!((program.get(slot) as Snapshot)?.photos ?? []).some((p) => p.fileId === fileId)) throw new AppError(404, "Photo not found");
  const updated = await ProgramModel.findOneAndUpdate(
    { _id: program._id, userId: req.userId },
    { $pull: { [`${slot}.photos`]: { fileId } } },
    { returnDocument: "after" },
  );
  await deleteFiles("programPhotos", [fileId]);
  res.json({ program: serializeProgram(updated!) });
}

/**
 * GET /api/program-photos/:fileId — decrypts and sends a photo, only to the owner of the program it
 * belongs to (anyone else gets a 404, as if it didn't exist). Never cached.
 */
export async function downloadPhoto(req: Request, res: Response): Promise<void> {
  const fileId = String(req.params.fileId);
  const owned = await ProgramModel.findOne({
    userId: req.userId,
    $or: PHOTO_SLOTS.map((slot) => ({ [`${slot}.photos.fileId`]: fileId })),
  }).lean();
  if (!owned) throw new AppError(404, "Photo not found");
  const photo = PHOTO_SLOTS.flatMap((slot) => ((owned as Record<string, any>)[slot]?.photos ?? []) as { fileId: string; mimeType?: string }[]).find(
    (p) => p.fileId === fileId,
  );
  const bytes = await readFile("programPhotos", fileId, String(req.userId));
  if (!bytes || !photo) throw new AppError(404, "Photo not found");
  res.set({
    "Content-Type": photo.mimeType ?? "image/jpeg",
    "Content-Length": String(bytes.length),
    "Cache-Control": "private, no-store",
  });
  res.end(bytes);
}
