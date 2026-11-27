// Settings → Data → "Export my data": everything the user wrote, as one JSON download.
// Encrypted text is decrypted, because this goes only to its owner. Receipt files are left out
// (they can be downloaded from the Expenses page); their names are listed.
import type { Request, Response } from "express";
import { DailyEntryModel } from "../models/DailyEntry";
import { ExpenseModel } from "../models/Expense";
import { MealDayModel } from "../models/MealDay";
import { DiaryEntryModel, PurposeModel, ThoughtLogModel } from "../models/Mind";
import { UserModel } from "../models/User";
import { AppError } from "../utils/AppError";
import { todayInTimezone } from "../utils/dates";
import { serializeEntry, type LeanDay } from "./entriesController";
import { serializeExpense } from "./expensesController";
import { toEntry } from "./diaryController";
import { toPurpose } from "./mindController";
import { toLog } from "./thoughtsController";

/** GET /api/profile/export */
export async function exportMyData(req: Request, res: Response): Promise<void> {
  const userId = req.userId;
  const user = await UserModel.findById(userId).select("name email createdAt").lean();
  if (!user) throw new AppError(401, "Please log in to continue");

  const [entries, mealDays, expenses, purpose, diary, thoughts] = await Promise.all([
    DailyEntryModel.find({ userId }).sort({ date: 1 }).lean(),
    MealDayModel.find({ userId }).sort({ date: 1 }).lean(),
    ExpenseModel.find({ userId }).sort({ date: 1, createdAt: 1 }).lean(),
    PurposeModel.findOne({ userId }).lean(),
    DiaryEntryModel.find({ userId }).sort({ date: 1, createdAt: 1 }).lean(),
    ThoughtLogModel.find({ userId }).sort({ date: 1, createdAt: 1 }).lean(),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    account: { name: user.name, email: user.email, createdAt: user.createdAt ?? null },
    note: "Receipt files aren't included — download them from the Expenses page (report or evidence view).",
    entries: entries.map((d) => serializeEntry(d as unknown as LeanDay)),
    meals: mealDays.map(({ _id, __v, userId: _u, ...rest }) => ({ id: String(_id), ...rest })),
    expenses: expenses.map((e) => {
      const { receipts, ...rest } = serializeExpense(e as Parameters<typeof serializeExpense>[0]);
      return { ...rest, receiptFiles: receipts.map((r) => r.filename) };
    }),
    purpose: purpose ? toPurpose(purpose as Parameters<typeof toPurpose>[0]) : null,
    diary: diary.map((d) => toEntry(d as Parameters<typeof toEntry>[0])),
    thoughtLogs: thoughts.map((t) => toLog(t as Parameters<typeof toLog>[0])),
  };

  res.set("Cache-Control", "no-store");
  res.set("Content-Disposition", `attachment; filename="daily-tracker-export-${todayInTimezone()}.json"`);
  res.json(data);
}
