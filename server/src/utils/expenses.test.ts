/// <reference types="vitest/globals" />
import { createFieldCrypto } from "./crypto";
import { cleanFilename, createUploadQuota, receiptProblem, sniffReceiptType, sumAmounts, summarizeExpenses, type SummaryExpense } from "./expenses";
import { amount, expenseCreateSchema } from "../validation/expenseSchema";

const e = (date: string, amount: number, category: SummaryExpense["category"] = "food", extra: Partial<SummaryExpense> = {}): SummaryExpense => ({
  id: `${date}-${amount}`,
  date,
  amount,
  currency: "LKR",
  category,
  title: "x",
  ...extra,
});

describe("amounts", () => {
  it("must be more than 0 with at most 2 decimals", () => {
    for (const ok of [0.01, 1, 12.5, 12.34, 1999.99]) expect(amount.safeParse(ok).success, String(ok)).toBe(true);
    for (const bad of [0, -1, 12.345, Number.POSITIVE_INFINITY, "5"]) expect(amount.safeParse(bad).success, String(bad)).toBe(false);
    expect(expenseCreateSchema.safeParse({ date: "2026-11-25", amount: 5, category: "food", title: "  " }).success).toBe(false);
    expect(expenseCreateSchema.safeParse({ date: "2026-11-25", amount: 5, category: "pets", title: "Cat food" }).success).toBe(false);
  });

  it("adds up exactly, to the cent", () => {
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
    expect(sumAmounts([1250.5, 120, 0.05])).toBe(1370.55);
  });
});

describe("summarizeExpenses", () => {
  it("totals per day and category, with the biggest, the period before and the budget", () => {
    const s = summarizeExpenses({
      from: "2026-11-19",
      to: "2026-11-25",
      currency: "LKR",
      weeklyBudget: 10_000,
      expenses: [e("2026-11-19", 1000, "food"), e("2026-11-19", 500, "transport"), e("2026-11-25", 3000, "bills"), e("2026-11-25", 9, "food", { currency: "USD" })],
      previous: [e("2026-11-14", 2000)],
    });
    expect(s).toMatchObject({ total: 4500, count: 3, change: 2500, changePercent: 125, budget: 10_000, budgetUsedPercent: 45, otherCurrencies: { USD: 9 } });
    expect(s.previous).toEqual({ from: "2026-11-12", to: "2026-11-18", total: 2000 });
    expect(s.perDay).toHaveLength(7);
    expect(s.perDay[0]).toEqual({ date: "2026-11-19", total: 1500, count: 2 });
    expect(s.perDay[1]).toEqual({ date: "2026-11-20", total: 0, count: 0 });
    expect(s.perCategory.map((c) => [c.category, c.total])).toEqual([
      ["bills", 3000],
      ["food", 1000],
      ["transport", 500],
    ]);
    expect(s.biggest?.amount).toBe(3000);
  });

  it("has no percentages without a previous period or a budget", () => {
    const s = summarizeExpenses({ from: "2026-11-25", to: "2026-11-25", currency: "LKR", expenses: [], previous: [] });
    expect(s).toMatchObject({ total: 0, count: 0, biggest: null, changePercent: null, budget: null, budgetUsedPercent: null });
  });
});

describe("receipt files", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  it("are recognised by their bytes, not their name", () => {
    expect(sniffReceiptType(png)).toBe("image/png");
    expect(sniffReceiptType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffReceiptType(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffReceiptType(Buffer.from("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffReceiptType(Buffer.from("\0\0\0\x18ftypheic0000"))).toBe("image/heic");
    expect(sniffReceiptType(Buffer.from("<html>"))).toBeNull();
    expect(sniffReceiptType(Buffer.from("GIF89a"))).toBeNull();
  });

  it("are limited to 5 MB and must not be empty", () => {
    expect(receiptProblem({ size: png.length, bytes: png })).toBeNull();
    expect(receiptProblem({ size: 0, bytes: Buffer.alloc(0) })).toMatch(/empty/);
    expect(receiptProblem({ size: 5 * 1024 * 1024 + 1, bytes: png })).toMatch(/5 MB/);
    expect(receiptProblem({ size: 10, bytes: Buffer.from("plain text") })).toMatch(/photos/);
  });

  it("keep a safe file name", () => {
    expect(cleanFilename("../../etc/passwd", "application/pdf")).toBe("passwd");
    expect(cleanFilename("C:\\Users\\me\\IMG_0001.HEIC", "image/heic")).toBe("IMG_0001.HEIC");
    expect(cleanFilename("", "image/jpeg")).toBe("receipt.jpg");
  });

  it("round-trip through encryption, and can't be read with another key", () => {
    const crypto = createFieldCrypto("e".repeat(64));
    const sealed = crypto.encryptBytes(png);
    expect(sealed.equals(png)).toBe(false);
    expect(crypto.decryptBytes(sealed).equals(png)).toBe(true);
    expect(() => createFieldCrypto("f".repeat(64)).decryptBytes(sealed)).toThrow();
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1]! ^= 1;
    expect(() => crypto.decryptBytes(tampered)).toThrow();
  });

  it("are limited to 30 uploads an hour per user", () => {
    const quota = createUploadQuota(30, 60_000);
    expect(quota.take("u1", 25, 0)).toBe(true);
    expect(quota.take("u1", 6, 1000)).toBe(false);
    expect(quota.take("u1", 5, 1000)).toBe(true);
    expect(quota.take("u2", 5, 1000)).toBe(true);
    expect(quota.take("u1", 30, 61_001)).toBe(true);
  });
});
