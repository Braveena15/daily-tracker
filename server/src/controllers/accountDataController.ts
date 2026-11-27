// Settings → Data → Danger zone → "Delete everything and start fresh": permanently deletes ALL the
// user's data (entries, meals, expenses and their receipt files, diary, thought logs, purposes,
// programs and their photos, AI messages, weekly goals) but keeps the account, the profile basics
// and settings (and My Foods, the quote/video library and the daily AI-use counter). Every query is
// limited to the user's own id.
import type { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import { z } from "zod";
import { AiMessageModel } from "../models/Ai";
import { DailyEntryModel } from "../models/DailyEntry";
import { ExpenseModel } from "../models/Expense";
import { MealDayModel } from "../models/MealDay";
import { DiaryEntryModel, PurposeModel, ThoughtLogModel } from "../models/Mind";
import { ProgramModel } from "../models/Program";
import { UserModel } from "../models/User";
import { WeeklyGoalModel } from "../models/WeeklyGoal";
import { deleteAllFilesOf } from "../services/encryptedFiles";
import { AppError } from "../utils/AppError";

const PARTS = [
  { key: "days", model: DailyEntryModel },
  { key: "mealDays", model: MealDayModel },
  { key: "expenses", model: ExpenseModel },
  { key: "diaryEntries", model: DiaryEntryModel },
  { key: "thoughtLogs", model: ThoughtLogModel },
  { key: "purposes", model: PurposeModel },
  { key: "programs", model: ProgramModel },
  { key: "aiMessages", model: AiMessageModel },
  { key: "weeklyGoals", model: WeeklyGoalModel },
] as const;

type Counts = Record<(typeof PARTS)[number]["key"] | "receiptFiles" | "photoFiles", number>;

async function fileCount(bucket: string, userId: string): Promise<number> {
  const db = mongoose.connection.db;
  if (!db) return 0;
  return db.collection(`${bucket}.files`).countDocuments({ "metadata.userId": new Types.ObjectId(userId) });
}

async function counts(userId: string): Promise<Counts> {
  const values = await Promise.all(PARTS.map((p) => (p.model as typeof DailyEntryModel).countDocuments({ userId })));
  const [receiptFiles, photoFiles] = await Promise.all([fileCount("receipts", userId), fileCount("programPhotos", userId)]);
  return { ...(Object.fromEntries(PARTS.map((p, i) => [p.key, values[i]])) as Record<(typeof PARTS)[number]["key"], number>), receiptFiles, photoFiles };
}

const total = (c: Counts) => Object.values(c).reduce((s, n) => s + n, 0);

/** GET /api/account/data — how much would be deleted. */
export async function countAccountData(req: Request, res: Response): Promise<void> {
  const c = await counts(String(req.userId));
  res.json({ counts: c, total: total(c) });
}

const confirmSchema = z.strictObject({ confirm: z.literal("DELETE", { error: "Type DELETE to confirm" }) });

/** DELETE /api/account/data { confirm: "DELETE" } — deletes everything listed above. */
export async function deleteAccountData(req: Request, res: Response): Promise<void> {
  confirmSchema.parse(req.body ?? {});
  const userId = String(req.userId);
  if (!(await UserModel.exists({ _id: userId }))) throw new AppError(401, "Please log in to continue");

  // Files first (their owner is in their metadata), then the documents
  const [receiptFiles, photoFiles] = await Promise.all([deleteAllFilesOf("receipts", userId), deleteAllFilesOf("programPhotos", userId)]);
  const results = await Promise.all(PARTS.map((p) => (p.model as typeof DailyEntryModel).deleteMany({ userId })));
  // A fresh start: no old journey start date, no "last synced" from before
  await UserModel.updateOne({ _id: userId }, { $unset: { journeyStartDate: 1, lastHealthSyncAt: 1, dismissedMilestones: 1 } });

  const deleted = { ...(Object.fromEntries(PARTS.map((p, i) => [p.key, results[i]!.deletedCount])) as Record<(typeof PARTS)[number]["key"], number>), receiptFiles, photoFiles };
  res.json({ deleted, total: total(deleted) });
}
