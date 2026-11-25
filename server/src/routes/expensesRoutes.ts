import { Router } from "express";
import {
  addReceipts,
  createExpense,
  deleteExpense,
  downloadReceipt,
  expenseSummary,
  getExpense,
  getExpenseSettings,
  listExpenses,
  receiptUpload,
  removeReceipt,
  saveExpenseSettings,
  storageUsage,
  updateExpense,
} from "../controllers/expensesController";
import { requireAuth } from "../middleware/requireAuth";

export const expensesRouter = Router().use(requireAuth);
// Fixed paths before "/:id"
expensesRouter.get("/", listExpenses);
expensesRouter.post("/", createExpense);
expensesRouter.get("/summary", expenseSummary);
expensesRouter.get("/settings", getExpenseSettings);
expensesRouter.put("/settings", saveExpenseSettings);
expensesRouter.get("/:id", getExpense);
expensesRouter.patch("/:id", updateExpense);
expensesRouter.delete("/:id", deleteExpense);
expensesRouter.post("/:id/receipts", receiptUpload, addReceipts);
expensesRouter.delete("/:id/receipts/:fileId", removeReceipt);

// Receipt files: only ever streamed to their owner, never cached
export const receiptsRouter = Router().use(requireAuth);
receiptsRouter.get("/:fileId", downloadReceipt);

export const storageRouter = Router().use(requireAuth);
storageRouter.get("/usage", storageUsage);
