/// <reference types="vitest/globals" />
import { createFieldCrypto } from "./crypto";
import { canNoteMissedDay, missedCategoryCounts, openMissedReason } from "./missedReason";
import { missedReasonSchema } from "../validation/entrySchema";

const crypto = createFieldCrypto("d".repeat(64));

describe("missed-day reasons", () => {
  it("can only be noted for today or yesterday", () => {
    expect(canNoteMissedDay("2026-11-25", "2026-11-25")).toBe(true);
    expect(canNoteMissedDay("2026-11-24", "2026-11-25")).toBe(true);
    expect(canNoteMissedDay("2026-11-23", "2026-11-25")).toBe(false);
    expect(canNoteMissedDay("2026-11-26", "2026-11-25")).toBe(false);
  });

  it("takes a known category and an optional note of up to 300 characters", () => {
    expect(missedReasonSchema.parse({ category: "needed a break" })).toEqual({ category: "needed a break" });
    expect(missedReasonSchema.safeParse({ category: "lazy" }).success).toBe(false);
    expect(missedReasonSchema.safeParse({ category: "busy", note: "x".repeat(301) }).success).toBe(false);
  });

  it("decrypts the note for its owner, and gives the AI categories and counts only", () => {
    const opened = openMissedReason(crypto, { category: "busy", note: crypto.encrypt("Work trip"), createdAt: "2026-11-25T03:00:00.000Z" });
    expect(opened).toEqual({ category: "busy", note: "Work trip", createdAt: "2026-11-25T03:00:00.000Z" });
    expect(openMissedReason(crypto, null)).toBeNull();
    const counts = missedCategoryCounts([opened, { category: "busy", note: "x", createdAt: null }, { category: "forgot", note: "", createdAt: null }, null]);
    expect(counts).toEqual({ busy: 2, forgot: 1 });
    expect(JSON.stringify(counts)).not.toMatch(/Work trip/);
  });
});
