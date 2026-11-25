// Expenses: totals, the period summary and receipt file checks. Pure functions, so the rules are easy
// to test. Money is added up in cents, so 0.1 + 0.2 is 0.30, not 0.30000000000000004.
import { EXPENSE_LIMITS, type ExpenseCategory } from "../models/Expense";
import { addDays, daysBetween, listDates } from "./dates";

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

/** Adds amounts exactly (to the cent). */
export const sumAmounts = (amounts: number[]) => fromCents(amounts.reduce((s, a) => s + toCents(a), 0));

export type SummaryExpense = { id: string; date: string; amount: number; currency: string; category: ExpenseCategory; title: string };

export type ExpenseSummary = {
  from: string;
  to: string;
  currency: string;
  /** In `currency` only (expenses in other currencies are listed in otherCurrencies) */
  total: number;
  count: number;
  /** Every day of the period, oldest first (0 on days without expenses) */
  perDay: { date: string; total: number; count: number }[];
  /** Biggest first */
  perCategory: { category: ExpenseCategory; total: number; count: number }[];
  biggest: SummaryExpense | null;
  /** The same number of days just before this period */
  previous: { from: string; to: string; total: number };
  /** total − previous total */
  change: number;
  /** Whole percent, null when the previous period had nothing */
  changePercent: number | null;
  /** The weekly budget scaled to the period's length (null without a budget) */
  budget: number | null;
  /** Whole percent of `budget`, null without a budget */
  budgetUsedPercent: number | null;
  /** Totals of expenses in other currencies (not added to `total`) */
  otherCurrencies: Record<string, number>;
};

/** The summary of `from`–`to` (both included), compared with the same number of days before it. */
export function summarizeExpenses(input: {
  from: string;
  to: string;
  currency: string;
  expenses: SummaryExpense[];
  previous: SummaryExpense[];
  weeklyBudget?: number | null;
}): ExpenseSummary {
  const { from, to, currency } = input;
  const inPeriod = input.expenses.filter((e) => e.date >= from && e.date <= to);
  const mine = inPeriod.filter((e) => e.currency === currency);
  const days = daysBetween(from, to) + 1;

  const perDay = listDates(from, to).map((date) => {
    const list = mine.filter((e) => e.date === date);
    return { date, total: sumAmounts(list.map((e) => e.amount)), count: list.length };
  });
  const byCategory = new Map<ExpenseCategory, SummaryExpense[]>();
  for (const e of mine) byCategory.set(e.category, [...(byCategory.get(e.category) ?? []), e]);
  const perCategory = [...byCategory]
    .map(([category, list]) => ({ category, total: sumAmounts(list.map((e) => e.amount)), count: list.length }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

  const total = sumAmounts(mine.map((e) => e.amount));
  const previousTotal = sumAmounts(input.previous.filter((e) => e.currency === currency).map((e) => e.amount));
  const budget = input.weeklyBudget ? fromCents(Math.round((toCents(input.weeklyBudget) * days) / 7)) : null;
  const otherCurrencies: Record<string, number> = {};
  for (const e of inPeriod.filter((x) => x.currency !== currency)) {
    otherCurrencies[e.currency] = sumAmounts([otherCurrencies[e.currency] ?? 0, e.amount]);
  }

  return {
    from,
    to,
    currency,
    total,
    count: mine.length,
    perDay,
    perCategory,
    biggest: mine.reduce<SummaryExpense | null>((big, e) => (big === null || e.amount > big.amount ? e : big), null),
    previous: { from: addDays(from, -days), to: addDays(from, -1), total: previousTotal },
    change: fromCents(toCents(total) - toCents(previousTotal)),
    changePercent: previousTotal > 0 ? Math.round(((total - previousTotal) / previousTotal) * 100) : null,
    budget,
    budgetUsedPercent: budget ? Math.round((total / budget) * 100) : null,
    otherCurrencies,
  };
}

// ---------- Receipt files ----------

export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"] as const;
export type ReceiptType = (typeof RECEIPT_TYPES)[number];

/**
 * The file's real type from its first bytes (what the browser says is only a hint): JPEG, PNG,
 * WebP, HEIC or PDF. Null for anything else.
 */
export function sniffReceiptType(bytes: Buffer): ReceiptType | null {
  const ascii = (from: number, to: number) => bytes.subarray(from, to).toString("latin1");
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 5 && ascii(0, 5) === "%PDF-") return "application/pdf";
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(8, 12))) return "image/heic";
  return null;
}

/** Why a file can't be a receipt, or null when it's fine. */
export function receiptProblem(file: { size: number; bytes: Buffer }): string | null {
  if (file.size === 0) return "That file is empty";
  if (file.size > EXPENSE_LIMITS.fileBytes) return "Each file can be at most 5 MB";
  if (!sniffReceiptType(file.bytes)) return "Receipts can be photos (JPEG, PNG, WebP, HEIC) or PDFs";
  return null;
}

/** A safe file name to keep: no paths or control characters, at most 120 characters. */
export function cleanFilename(name: string | undefined, type: ReceiptType): string {
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" }[type];
  const base = (name ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f"<>|:*?]/g, "")
    .trim()
    .slice(0, 120);
  return base || `receipt.${ext}`;
}

// ---------- Upload quota ----------

/** Up to `limit` files per user per hour (kept in memory: one server process). */
export function createUploadQuota(limit = 30, windowMs = 60 * 60 * 1000) {
  const uploads = new Map<string, number[]>();
  return {
    /** True (and counted) when `count` more files fit in the user's last hour */
    take(userId: string, count: number, now = Date.now()): boolean {
      const recent = (uploads.get(userId) ?? []).filter((t) => now - t < windowMs);
      if (recent.length + count > limit) {
        uploads.set(userId, recent);
        return false;
      }
      uploads.set(userId, [...recent, ...Array.from({ length: count }, () => now)]);
      return true;
    },
  };
}
