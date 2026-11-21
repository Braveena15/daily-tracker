/// <reference types="vitest/globals" />
import { createFieldCrypto } from "./crypto";
import {
  MAX_INTENTIONS,
  canAddIntention,
  hasDailyPurpose,
  openDailyPurpose,
  openHistory,
  isEmptyPurpose,
  pickFocusValues,
  previousVersion,
  purposeChanged,
  toPurposeContent,
  purposeFacts,
  purposeStats,
  purposeText,
  sealText,
  type DailyPurpose,
} from "./dailyPurpose";
import { clampFrom } from "./journey";
import { safeValueWord } from "../ai/buildContext";
import { ENTRY_LIMITS } from "../models/DailyEntry";
import { purposeSchema } from "../validation/mindSchema";
import { dailyPurposeSchema, intentionPatchSchema, intentionSchema, reflectionSchema } from "../validation/purposeSchema";

const crypto = createFieldCrypto("a".repeat(64));
const otherKey = createFieldCrypto("b".repeat(64));
const at = new Date("2026-11-21T03:00:00.000Z");

const day = (overrides: Partial<DailyPurpose> = {}): DailyPurpose => ({
  text: "Be present with family",
  purposes: [{ id: "p1", text: "Be present with family" }],
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
      // An older day's single purpose shows as its one purpose line
      purposes: [{ id: "legacy", text: "Be present with family" }],
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

  it("opens several purposes a day, in order, and joins them into `text`", () => {
    const stored = {
      text: sealText(crypto, "An old single purpose"), // ignored once there are purpose lines
      purposes: [
        { _id: "a", text: crypto.encrypt("Be patient with the kids"), at },
        { _id: "b", text: crypto.encrypt("Finish the report calmly"), at },
      ],
      setAt: at,
    };
    expect(JSON.stringify(stored)).not.toMatch(/patient|report/);
    const opened = openDailyPurpose(crypto, stored)!;
    expect(opened.purposes).toEqual([
      { id: "a", text: "Be patient with the kids" },
      { id: "b", text: "Finish the report calmly" },
    ]);
    expect(opened.text).toBe("Be patient with the kids\nFinish the report calmly");
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

describe("saving the main purpose", () => {
  it("keeps the statement, core values and long-term goals through a save and reload", () => {
    const body = purposeSchema.parse({
      purposeStatement: "  Be healthy and present for my family  ",
      coreValues: ["Family", "Health", "Family"],
      longTermGoals: [{ title: "Run a 10k", why: "To feel strong" }, { title: "Learn Tamil" }],
    });
    // What PUT stores ($set body) is what GET returns
    const stored = { ...body, updatedAt: at };
    expect(toPurposeContent(stored)).toEqual({
      purposeStatement: "Be healthy and present for my family",
      coreValues: ["Family", "Health"],
      longTermGoals: [
        { title: "Run a 10k", why: "To feel strong" },
        { title: "Learn Tamil", why: "" },
      ],
    });
  });

  it("returns an empty purpose before anything is saved", () => {
    expect(toPurposeContent(null)).toEqual({ purposeStatement: "", coreValues: [], longTermGoals: [] });
    expect(isEmptyPurpose(toPurposeContent(null))).toBe(true);
  });
});

describe("purpose history", () => {
  const v1 = { purposeStatement: "Old purpose", coreValues: ["Growth"], longTermGoals: [{ title: "Run 10k", why: "Health" }], updatedAt: new Date("2026-10-01T05:00:00Z") };
  const next = (changes: Partial<typeof v1> = {}) => ({ ...toPurposeContent(v1), ...changes });

  it("keeps the replaced version, encrypted, dated when it was saved", () => {
    const version = previousVersion(crypto, v1, next({ purposeStatement: "New purpose" }), at)!;
    expect(JSON.stringify(version)).not.toMatch(/Old purpose|Run 10k|Health/);
    expect(version.savedAt).toEqual(v1.updatedAt);
    expect(version.replacedAt).toEqual(at);
    expect(openHistory(crypto, [version])).toEqual([
      { statement: "Old purpose", coreValues: ["Growth"], goals: [{ title: "Run 10k", why: "Health" }], savedAt: v1.updatedAt.toISOString() },
    ]);
  });

  it("makes a new version when only the values or goals change", () => {
    expect(previousVersion(crypto, v1, next({ coreValues: ["Growth", "Calm"] }), at)).not.toBeNull();
    expect(previousVersion(crypto, v1, next({ longTermGoals: [] }), at)).not.toBeNull();
  });

  it("keeps nothing when nothing changed, or nothing was saved before", () => {
    expect(previousVersion(crypto, v1, next({ purposeStatement: " Old purpose " }), at)).toBeNull();
    expect(purposeChanged(toPurposeContent(v1), next())).toBe(false);
    expect(previousVersion(crypto, null, next({ purposeStatement: "First" }), at)).toBeNull();
    expect(previousVersion(crypto, { purposeStatement: "", coreValues: [], longTermGoals: [] }, next(), at)).toBeNull();
  });

  it("lists versions newest first, and reads older entries without goals", () => {
    const older = { statement: crypto.encrypt("v1"), coreValues: [], savedAt: new Date("2026-10-01T00:00:00Z") };
    const newer = previousVersion(crypto, { ...v1, purposeStatement: "v2", updatedAt: new Date("2026-11-01T00:00:00Z") }, next({ purposeStatement: "v3" }), at)!;
    const opened = openHistory(crypto, [older, newer]);
    expect(opened.map((h) => h.statement)).toEqual(["v2", "v1"]);
    expect(opened[1]!.goals).toEqual([]);
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
    const several = day({ purposes: [{ id: "a", text: "One" }, { id: "b", text: "Two" }] });
    expect(purposeText(several).slice(0, 2)).toEqual(["One", "Two"]);
  });
});

describe("date range", () => {
  it("starts the purpose list at the journey start", () => {
    expect(clampFrom("2026-10-23", "2026-11-21")).toBe("2026-11-21");
    expect(clampFrom("2026-11-22", "2026-11-21")).toBe("2026-11-22");
  });
});
