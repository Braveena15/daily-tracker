/// <reference types="vitest/globals" />
import { createFieldCrypto } from "./crypto";
import {
  MAX_INTENTIONS,
  canAddIntention,
  hasDailyPurpose,
  openDailyPurpose,
  openHistory,
  pickFocusValues,
  previousVersion,
  purposeFacts,
  purposeStats,
  purposeText,
  sealText,
  type DailyPurpose,
} from "./dailyPurpose";
import { clampFrom } from "./journey";
import { safeValueWord } from "../ai/buildContext";
import { ENTRY_LIMITS } from "../models/DailyEntry";
import { dailyPurposeSchema, intentionPatchSchema, intentionSchema, reflectionSchema } from "../validation/purposeSchema";

const crypto = createFieldCrypto("a".repeat(64));
const otherKey = createFieldCrypto("b".repeat(64));
const at = new Date("2026-11-21T03:00:00.000Z");

const day = (overrides: Partial<DailyPurpose> = {}): DailyPurpose => ({
  text: "Be present with family",
  focusValues: ["Family"],
  intentions: [],
  reflection: null,
  setAt: at.toISOString(),
  updatedAt: at.toISOString(),
  ...overrides,
});

describe("encryption", () => {
  it("round-trips the purpose text, intentions and reflection note", () => {
    const stored = {
      text: sealText(crypto, "  Be present with family  "),
      focusValues: ["Family", "Health"],
      intentions: [
        { _id: "i1", text: crypto.encrypt("Call Amma"), done: true, doneAt: at },
        { _id: "i2", text: crypto.encrypt("Go cycling"), done: false },
      ],
      reflection: { rating: 4, note: crypto.encrypt("A calm, good day"), at },
      setAt: at,
    };
    // Nothing readable is stored
    expect(JSON.stringify(stored)).not.toMatch(/Amma|cycling|present|calm/);

    expect(openDailyPurpose(crypto, stored)).toEqual({
      text: "Be present with family",
      focusValues: ["Family", "Health"],
      intentions: [
        { id: "i1", text: "Call Amma", done: true, doneAt: at.toISOString() },
        { id: "i2", text: "Go cycling", done: false, doneAt: null },
      ],
      reflection: { rating: 4, note: "A calm, good day", at: at.toISOString() },
      setAt: at.toISOString(),
      updatedAt: null,
    });
  });

  it("stores nothing for empty text", () => {
    expect(sealText(crypto, "   ")).toBeUndefined();
    expect(sealText(crypto, undefined)).toBeUndefined();
  });

  it("shows text it can't decrypt (another key) as empty instead of failing", () => {
    expect(openDailyPurpose(otherKey, { text: crypto.encrypt("secret") })?.text).toBe("");
  });

  it("knows when a day has no purpose", () => {
    expect(openDailyPurpose(crypto, null)).toBeNull();
    expect(hasDailyPurpose(day({ text: "", focusValues: [] }))).toBe(false);
    expect(hasDailyPurpose(day({ text: "", focusValues: [], intentions: [{ id: "x", text: "Run", done: false, doneAt: null }] }))).toBe(true);
  });
});

describe("limits", () => {
  it("allows up to 5 intentions a day", () => {
    expect(MAX_INTENTIONS).toBe(ENTRY_LIMITS.intentions);
    expect(canAddIntention(0)).toBe(true);
    expect(canAddIntention(4)).toBe(true);
    expect(canAddIntention(5)).toBe(false);
  });

  it("checks intention text, focus values and the rating", () => {
    expect(intentionSchema.safeParse({ text: "x".repeat(200) }).success).toBe(true);
    expect(intentionSchema.safeParse({ text: "x".repeat(201) }).success).toBe(false);
    expect(intentionSchema.safeParse({ text: "  " }).success).toBe(false);
    expect(intentionPatchSchema.safeParse({}).success).toBe(false);
    expect(intentionPatchSchema.parse({ done: true })).toEqual({ done: true });

    expect(dailyPurposeSchema.safeParse({ focusValues: ["A", "B", "C"] }).success).toBe(true);
    expect(dailyPurposeSchema.safeParse({ focusValues: ["A", "B", "C", "D"] }).success).toBe(false);
    expect(dailyPurposeSchema.safeParse({ text: "x".repeat(501) }).success).toBe(false);

    expect(reflectionSchema.safeParse({ rating: 5, note: "Good" }).success).toBe(true);
    expect(reflectionSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(reflectionSchema.safeParse({ rating: 3.5 }).success).toBe(false);
    expect(reflectionSchema.safeParse({ rating: 3, note: "x".repeat(1001) }).success).toBe(false);
  });

  it("only takes focus values from the core values, spelled like them", () => {
    expect(pickFocusValues(["family", "Health", "family"], ["Family", "Health", "Growth"])).toEqual({ values: ["Family", "Health"], unknown: [] });
    expect(pickFocusValues(["Fame"], ["Family"]).unknown).toEqual(["Fame"]);
  });
});

describe("purpose history", () => {
  it("keeps the previous statement when it changes", () => {
    const version = previousVersion(crypto, { purposeStatement: "Old purpose", coreValues: ["Growth"] }, "New purpose", at)!;
    expect(version.statement).not.toContain("Old purpose");
    expect(openHistory(crypto, [version])).toEqual([{ statement: "Old purpose", coreValues: ["Growth"], savedAt: at.toISOString() }]);
  });

  it("keeps nothing when the statement is unchanged or was empty", () => {
    expect(previousVersion(crypto, { purposeStatement: "Same " }, "Same", at)).toBeNull();
    expect(previousVersion(crypto, { purposeStatement: "" }, "First purpose", at)).toBeNull();
    expect(previousVersion(crypto, null, "First purpose", at)).toBeNull();
  });

  it("lists versions newest first", () => {
    const older = previousVersion(crypto, { purposeStatement: "v1" }, "v2", new Date("2026-10-01T00:00:00Z"))!;
    const newer = previousVersion(crypto, { purposeStatement: "v2" }, "v3", new Date("2026-11-01T00:00:00Z"))!;
    expect(openHistory(crypto, [older, newer]).map((h) => h.statement)).toEqual(["v2", "v1"]);
  });
});

describe("purposeStats", () => {
  it("counts days, completed intentions, the average rating and top values", () => {
    const i = (done: boolean) => ({ id: "x", text: "t", done, doneAt: null });
    const stats = purposeStats([
      day({ focusValues: ["Family", "Health"], intentions: [i(true), i(false)], reflection: { rating: 4, note: "", at: "" } }),
      day({ focusValues: ["Family"], intentions: [i(true), i(true)], reflection: { rating: 5, note: "", at: "" } }),
      day({ focusValues: ["Growth"] }),
      null,
    ]);
    expect(stats).toEqual({
      daysWithPurpose: 3,
      intentionsTotal: 4,
      intentionsDone: 3,
      intentionsDonePercent: 75,
      avgRating: 4.5,
      topValues: [
        { value: "Family", days: 2 },
        { value: "Growth", days: 1 },
        { value: "Health", days: 1 },
      ],
    });
  });

  it("has nulls without intentions or reflections", () => {
    expect(purposeStats([])).toMatchObject({ daysWithPurpose: 0, intentionsDonePercent: null, avgRating: null, topValues: [] });
  });
});

describe("AI facts", () => {
  it("sends only counts, the rating and safe value words — never any text", () => {
    const p = day({
      text: "SECRET_PURPOSE",
      focusValues: ["Family", "SECRET_VALUE Priya"],
      intentions: [
        { id: "1", text: "SECRET_INTENTION call Amma", done: true, doneAt: null },
        { id: "2", text: "SECRET_INTENTION 2", done: false, doneAt: null },
      ],
      reflection: { rating: 4, note: "SECRET_NOTE", at: at.toISOString() },
    });
    const facts = purposeFacts(p, safeValueWord);
    expect(facts).toEqual({ set: true, intentions: 2, intentionsDone: 1, rating: 4, focusValues: ["family", "other value"] });
    expect(JSON.stringify(facts)).not.toMatch(/SECRET|Amma|Priya/);
    expect(purposeFacts(null, safeValueWord)).toEqual({ set: false });
  });

  it("still checks every purpose text for crisis language", () => {
    const p = day({ intentions: [{ id: "1", text: "Rest", done: false, doneAt: null }], reflection: { rating: 2, note: "Hard day", at: "" } });
    expect(purposeText(p)).toEqual(["Be present with family", "Rest", "Hard day"]);
  });
});

describe("date range", () => {
  it("starts the purpose list at the journey start", () => {
    expect(clampFrom("2026-10-23", "2026-11-21")).toBe("2026-11-21");
    expect(clampFrom("2026-11-22", "2026-11-21")).toBe("2026-11-22");
  });
});
