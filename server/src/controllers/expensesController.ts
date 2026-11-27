// Expenses and their receipts. Every query filters by req.userId, so users only ever see and change
// their own. The title and note are encrypted; receipt files are encrypted in GridFS (services/receipts.ts).
// Amounts, titles and files are never logged and never sent to the AI.
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { isValidObjectId } from "mongoose";
import { fieldCrypto } from "../config/encryption";
import { EXPENSE_LIMITS, ExpenseModel, type ExpenseCategory } from "../models/Expense";
import { UserModel } from "../models/User";
import { journeyStart } from "../services/journey";
import { deleteReceipts, readReceipt, sampleReceiptSvg, storeReceipt } from "../services/receipts";
import { totalBytesUsed } from "../services/encryptedFiles";
import { AppError } from "../utils/AppError";
import { addDays, daysBetween, todayInTimezone } from "../utils/dates";
import { cleanFilename, createUploadQuota, receiptProblem, sniffReceiptType, summarizeExpenses } from "../utils/expenses";
import { expenseCreateSchema, expenseListSchema, expensePatchSchema, expenseSettingsSchema } from "../validation/expenseSchema";

/** The receipt storage each account is meant to stay under (shown on the Profile) */
export const STORAGE_LIMIT_BYTES = 500 * 1024 * 1024;
const MAX_RANGE_DAYS = 366;

type StoredExpense = {
  _id: unknown;
  date: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  title: string;
  note?: string | null;
  paymentMethod?: string | null;
  receipts?: { fileId: string; filename: string; mimeType: string; size: number; uploadedAt: Date }[];
  createdAt?: Date;
  updatedAt?: Date;
};

/** For the API: the title and note decrypted (only ever sent to their owner). */
export function serializeExpense(e: StoredExpense) {
  return {
    id: String(e._id),
    date: e.date,
    amount: e.amount,
    currency: e.currency,
    category: e.category,
    title: fieldCrypto.tryDecrypt(e.title) ?? "",
    note: e.note ? (fieldCrypto.tryDecrypt(e.note) ?? "") : "",
    paymentMethod: e.paymentMethod ?? null,
    receipts: (e.receipts ?? []).map((r) => ({ fileId: r.fileId, filename: r.filename, mimeType: r.mimeType, size: r.size, uploadedAt: r.uploadedAt })),
    createdAt: e.createdAt ?? null,
    updatedAt: e.updatedAt ?? null,
  };
}

/** A date expenses can be written for: not in the future, and not before the journey start. */
async function writableDate(req: Request, date: string): Promise<string> {
  if (date > todayInTimezone()) throw new AppError(400, "You can't add expenses for a future day");
  if (date < (await journeyStart(req.userId))) throw new AppError(400, "This day is before your journey started");
  return date;
}

async function ownExpense(req: Request): Promise<StoredExpense & { userId: unknown }> {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new AppError(404, "Expense not found");
  const expense = await ExpenseModel.findOne({ _id: id, userId: req.userId }).lean();
  if (!expense) throw new AppError(404, "Expense not found");
  return expense as unknown as StoredExpense & { userId: unknown };
}

async function userCurrency(userId: string | undefined): Promise<{ currency: string; weeklyBudget: number | null }> {
  const user = await UserModel.findById(userId).select("currency weeklyBudget").lean();
  return { currency: user?.currency ?? "LKR", weeklyBudget: user?.weeklyBudget ?? null };
}

// ---------- Expenses ----------

/** GET /api/expenses?date= or ?from=&to= (&category=) — newest first within a day. */
export async function listExpenses(req: Request, res: Response): Promise<void> {
  const q = expenseListSchema.parse(req.query);
  const today = todayInTimezone();
  const from = q.date ?? q.from ?? addDays(today, -6);
  const to = q.date ?? q.to ?? today;
  if (from > to) throw new AppError(400, '"from" must be on or before "to"');
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw new AppError(400, `You can load at most ${MAX_RANGE_DAYS} days at a time`);
  const rows = await ExpenseModel.find({ userId: req.userId, date: { $gte: from, $lte: to }, ...(q.category && { category: q.category }) })
    .sort({ date: -1, createdAt: -1 })
    .lean();
  res.json({ from, to, expenses: rows.map((r) => serializeExpense(r as unknown as StoredExpense)) });
}

/** POST /api/expenses */
export async function createExpense(req: Request, res: Response): Promise<void> {
  const body = expenseCreateSchema.parse(req.body ?? {});
  const date = await writableDate(req, body.date);
  const { currency } = await userCurrency(req.userId);
  const expense = await ExpenseModel.create({
    userId: req.userId,
    date,
    amount: body.amount,
    currency: body.currency ?? currency,
    category: body.category,
    title: fieldCrypto.encrypt(body.title),
    ...(body.note?.trim() && { note: fieldCrypto.encrypt(body.note.trim()) }),
    ...(body.paymentMethod && { paymentMethod: body.paymentMethod }),
  });
  res.status(201).json({ expense: serializeExpense(expense.toObject() as unknown as StoredExpense) });
}

/** GET /api/expenses/:id */
export async function getExpense(req: Request, res: Response): Promise<void> {
  res.json({ expense: serializeExpense(await ownExpense(req)) });
}

/** PATCH /api/expenses/:id — null clears the note or payment method. */
export async function updateExpense(req: Request, res: Response): Promise<void> {
  await ownExpense(req);
  const body = expensePatchSchema.parse(req.body ?? {});
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  if (body.date !== undefined) $set.date = await writableDate(req, body.date);
  if (body.amount !== undefined) $set.amount = body.amount;
  if (body.currency !== undefined) $set.currency = body.currency;
  if (body.category !== undefined) $set.category = body.category;
  if (body.title !== undefined) $set.title = fieldCrypto.encrypt(body.title);
  if (body.note !== undefined) {
    if (body.note?.trim()) $set.note = fieldCrypto.encrypt(body.note.trim());
    else $unset.note = 1;
  }
  if (body.paymentMethod !== undefined) {
    if (body.paymentMethod) $set.paymentMethod = body.paymentMethod;
    else $unset.paymentMethod = 1;
  }
  const updated = await ExpenseModel.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    Object.keys($unset).length ? { $set, $unset } : { $set },
    { returnDocument: "after", runValidators: true },
  ).lean();
  if (!updated) throw new AppError(404, "Expense not found");
  res.json({ expense: serializeExpense(updated as unknown as StoredExpense) });
}

/** DELETE /api/expenses/:id — and its receipt files. */
export async function deleteExpense(req: Request, res: Response): Promise<void> {
  const expense = await ownExpense(req);
  await ExpenseModel.deleteOne({ _id: expense._id, userId: req.userId });
  await deleteReceipts((expense.receipts ?? []).map((r) => r.fileId));
  res.json({ deleted: true });
}

// ---------- Receipts ----------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: EXPENSE_LIMITS.fileBytes, files: EXPENSE_LIMITS.receipts, fields: 5 },
});

/** multer for "files" (up to 5), with its errors turned into friendly messages. */
export function receiptUpload(req: Request, res: Response, next: NextFunction): void {
  upload.array("files", EXPENSE_LIMITS.receipts)(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Each file can be at most 5 MB"
          : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
            ? `Send up to ${EXPENSE_LIMITS.receipts} files, in a field called "files"`
            : "That upload couldn't be read";
      return next(new AppError(400, message));
    }
    next(err);
  });
}

const uploadQuota = createUploadQuota(30);

/** POST /api/expenses/:id/receipts (multipart, field "files") — up to 5 receipts per expense. */
export async function addReceipts(req: Request, res: Response): Promise<void> {
  const expense = await ownExpense(req);
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw new AppError(400, "Choose at least one photo or PDF");
  if ((expense.receipts?.length ?? 0) + files.length > EXPENSE_LIMITS.receipts) {
    throw new AppError(400, `An expense can have up to ${EXPENSE_LIMITS.receipts} receipts`);
  }
  // Check every file before storing any
  for (const file of files) {
    const problem = receiptProblem({ size: file.size, bytes: file.buffer });
    if (problem) throw new AppError(400, `${cleanFilename(file.originalname, sniffReceiptType(file.buffer) ?? "image/jpeg")}: ${problem}`);
  }
  const used = await totalBytesUsed(String(req.userId));
  if (used + files.reduce((s, f) => s + f.size, 0) > STORAGE_LIMIT_BYTES) {
    throw new AppError(400, "Your storage is full. Delete some older receipts or photos to add new ones.");
  }
  if (!uploadQuota.take(String(req.userId), files.length)) {
    throw new AppError(429, "That's a lot of uploads for one hour. Please try again a little later.");
  }

  const added = [];
  for (const file of files) {
    const type = sniffReceiptType(file.buffer)!;
    const filename = cleanFilename(file.originalname, type);
    const fileId = await storeReceipt(String(req.userId), file.buffer, filename, type);
    added.push({ fileId, filename, mimeType: type, size: file.size, uploadedAt: new Date() });
  }
  const updated = await ExpenseModel.findOneAndUpdate(
    { _id: expense._id, userId: req.userId },
    { $push: { receipts: { $each: added } } },
    { returnDocument: "after" },
  ).lean();
  res.status(201).json({ expense: serializeExpense(updated as unknown as StoredExpense) });
}

/** DELETE /api/expenses/:id/receipts/:fileId */
export async function removeReceipt(req: Request, res: Response): Promise<void> {
  const expense = await ownExpense(req);
  const { fileId } = req.params;
  if (!(expense.receipts ?? []).some((r) => r.fileId === fileId)) throw new AppError(404, "Receipt not found");
  const updated = await ExpenseModel.findOneAndUpdate({ _id: expense._id, userId: req.userId }, { $pull: { receipts: { fileId } } }, { returnDocument: "after" }).lean();
  await deleteReceipts([String(fileId)]);
  res.json({ expense: serializeExpense(updated as unknown as StoredExpense) });
}

/**
 * GET /api/receipts/:fileId — decrypts and sends a receipt, only to the owner of the expense it
 * belongs to (anyone else gets a 404, as if it didn't exist). Never cached.
 */
export async function downloadReceipt(req: Request, res: Response): Promise<void> {
  const fileId = String(req.params.fileId);
  const expense = await ExpenseModel.findOne({ userId: req.userId, "receipts.fileId": fileId }).select("receipts title").lean();
  const receipt = expense?.receipts.find((r) => r.fileId === fileId);
  if (!expense || !receipt) throw new AppError(404, "Receipt not found");

  // The demo's sample receipts are placeholders, not stored files
  const bytes = fileId.startsWith("sample-")
    ? sampleReceiptSvg(fieldCrypto.tryDecrypt(expense.title) ?? "")
    : await readReceipt(fileId);
  if (!bytes) throw new AppError(404, "Receipt not found");

  res.set({
    "Content-Type": fileId.startsWith("sample-") ? "image/svg+xml" : receipt.mimeType,
    "Content-Length": String(bytes.length),
    "Cache-Control": "private, no-store",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(receipt.filename)}`,
  });
  res.end(bytes);
}

/** GET /api/storage/usage — bytes used by receipts and program photos together (one shared budget). */
export async function storageUsage(req: Request, res: Response): Promise<void> {
  const bytesUsed = await totalBytesUsed(String(req.userId));
  res.json({ bytesUsed, limitBytes: STORAGE_LIMIT_BYTES, percentUsed: Math.round((bytesUsed / STORAGE_LIMIT_BYTES) * 100) });
}

// ---------- Summary and settings ----------

/** GET /api/expenses/summary?from=&to= — totals per day and category, the biggest, and vs the period before. */
export async function expenseSummary(req: Request, res: Response): Promise<void> {
  const q = expenseListSchema.parse(req.query);
  const today = todayInTimezone();
  const to = q.to ?? today;
  const from = q.from ?? addDays(to, -6);
  if (from > to) throw new AppError(400, '"from" must be on or before "to"');
  const days = daysBetween(from, to) + 1;
  if (days > MAX_RANGE_DAYS) throw new AppError(400, `You can load at most ${MAX_RANGE_DAYS} days at a time`);
  res.json(await loadExpenseSummary(req.userId, from, to));
}

/** The summary for any period (also used by the weekly review). Titles are decrypted for the owner only. */
export async function loadExpenseSummary(userId: string | undefined, from: string, to: string) {
  const days = daysBetween(from, to) + 1;
  const [{ currency, weeklyBudget }, rows] = await Promise.all([
    userCurrency(userId),
    ExpenseModel.find({ userId, date: { $gte: addDays(from, -days), $lte: to } })
      .select("date amount currency category title")
      .lean(),
  ]);
  const all = rows.map((r) => ({
    id: String(r._id),
    date: r.date,
    amount: r.amount,
    currency: r.currency,
    category: r.category as ExpenseCategory,
    title: fieldCrypto.tryDecrypt(r.title) ?? "",
  }));
  return summarizeExpenses({ from, to, currency, weeklyBudget, expenses: all.filter((e) => e.date >= from), previous: all.filter((e) => e.date < from) });
}

/** GET /api/expenses/settings */
export async function getExpenseSettings(req: Request, res: Response): Promise<void> {
  res.json(await userCurrency(req.userId));
}

/** PUT /api/expenses/settings — currency and weekly budget (null removes it). */
export async function saveExpenseSettings(req: Request, res: Response): Promise<void> {
  const body = expenseSettingsSchema.parse(req.body ?? {});
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  if (body.currency !== undefined) $set.currency = body.currency;
  if (body.weeklyBudget === null) $unset.weeklyBudget = 1;
  else if (body.weeklyBudget !== undefined) $set.weeklyBudget = body.weeklyBudget;
  await UserModel.updateOne({ _id: req.userId }, { ...(Object.keys($set).length && { $set }), ...(Object.keys($unset).length && { $unset }) });
  res.json(await userCurrency(req.userId));
}

