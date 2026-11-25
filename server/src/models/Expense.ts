import { Schema, model, type InferSchemaType } from "mongoose";
import { demoExpiryPlugin } from "../demo/expiryPlugin";

// Expenses: one document per expense, with up to 5 receipt files (stored encrypted in GridFS, bucket
// "receipts" — see services/receipts.ts). The title and note are encrypted (DIARY_ENCRYPTION_KEY);
// their lengths are checked on the plain text in validation/expenseSchema.ts.

export const EXPENSE_CATEGORIES = ["food", "transport", "bills", "shopping", "health", "education", "entertainment", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const PAYMENT_METHODS = ["cash", "card", "online", "other"] as const;

export const EXPENSE_LIMITS = {
  amount: { min: 0.01, max: 100_000_000 },
  title: 120,
  note: 500,
  receipts: 5,
  /** Bytes per file, after the browser has compressed it */
  fileBytes: 5 * 1024 * 1024,
} as const;

const receiptSchema = new Schema(
  {
    // The GridFS file id (or "sample-…" for the demo's placeholder images, which aren't stored)
    fileId: { type: String, required: true },
    filename: { type: String, required: true, maxlength: 200 },
    mimeType: { type: String, required: true },
    // The original (unencrypted) size in bytes
    size: { type: Number, required: true, min: 0 },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

const expenseSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // The user's local calendar day (Asia/Colombo)
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    amount: { type: Number, required: true, min: EXPENSE_LIMITS.amount.min, max: EXPENSE_LIMITS.amount.max },
    currency: { type: String, required: true, match: /^[A-Z]{3}$/ },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    title: { type: String, required: true },
    note: String,
    paymentMethod: { type: String, enum: PAYMENT_METHODS },
    receipts: { type: [receiptSchema], default: [] },
  },
  { timestamps: true },
);

expenseSchema.index({ userId: 1, date: 1 });
expenseSchema.plugin(demoExpiryPlugin);

export type Expense = InferSchemaType<typeof expenseSchema>;
export const ExpenseModel = model("Expense", expenseSchema);
