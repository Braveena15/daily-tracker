// Validation for /api/expenses. The title and note are checked on the plain text here, because
// they're stored encrypted.
import { z } from "zod";
import { EXPENSE_CATEGORIES, EXPENSE_LIMITS as L, PAYMENT_METHODS } from "../models/Expense";
import { isValidDateString } from "../utils/dates";

const text = (label: string, max: number) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be ${max} characters or less`);

/** More than 0, at most 2 decimals ("12.50", not "12.505"). */
export const amount = z
  .number({ error: "Amount must be a number" })
  .refine((n) => Number.isFinite(n), "Amount must be a number")
  .min(L.amount.min, "Amount must be more than 0")
  .max(L.amount.max, "That amount is too large")
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "Amount can have at most 2 decimals");

const date = z.string({ error: "Date is required" }).refine(isValidDateString, "Date must be a real date in YYYY-MM-DD format");
const currency = z
  .string({ error: "Currency must be text" })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code, e.g. "LKR"');

export const expenseCreateSchema = z.strictObject({
  date,
  amount,
  currency: currency.optional(),
  category: z.enum(EXPENSE_CATEGORIES, { error: `Choose a category: ${EXPENSE_CATEGORIES.join(", ")}` }),
  title: text("Title", L.title).min(1, "Give the expense a title"),
  note: text("Note", L.note).nullable().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS, { error: `Payment method must be one of: ${PAYMENT_METHODS.join(", ")}` }).nullable().optional(),
});

export const expensePatchSchema = expenseCreateSchema
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");

export const expenseListSchema = z.object({
  date: date.optional(),
  from: date.optional(),
  to: date.optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
});

export const expenseSettingsSchema = z
  .strictObject({
    currency: currency.optional(),
    // null removes the budget
    weeklyBudget: z.number({ error: "Weekly budget must be a number" }).min(0, "Weekly budget can't be negative").max(L.amount.max).nullable().optional(),
  })
  .refine((v) => v.currency !== undefined || v.weeklyBudget !== undefined, "Nothing to change");
