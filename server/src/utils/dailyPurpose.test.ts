/// <reference types="vitest/globals" />
import { createFieldCrypto } from "./crypto";
import {
  MAX_INTENTIONS,
  MAX_PURPOSES,
  canAddIntention,
  canAddPurpose,
  daySummary,
  hasDayPurposes,
  openDayPurposes,
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
  type DayPurpose,
  type DayPurposes,
} from "./dailyPurpose";
import { clampFrom } from "./journey";
import { safeValueWord } from "../ai/buildContext";
import { ENTRY_LIMITS } from "../models/DailyEntry";
import { purposeSchema } from "../validation/mindSchema";
import { intentionPatchSchema, intentionSchema, purposeCreateSchema, purposePatchSchema, reflectionNoteSchema } from "../validation/purposeSchema";

const crypto = createFieldCrypto("a".repeat(64));
const otherKey = createFieldCrypto("b".repeat(64));
const at = new Date("2026-11-21T03:00:00.000Z");

const purpose = (overrides: Partial<DayPurpose> = {}): DayPurpose => ({
  id: "p1",
  text: "Be present with family",
  focusValues: ["Family"],
  intentions: [],
  rating: null,
  createdAt: at.toISOString(),
  updatedAt: at.toISOString(),
  ...overrides,
});
const day = (purposes: Partial<DayPurpose>[] = [{}], reflectionNote = ""): DayPurposes => ({
  purposes: purposes.map((p, i) => purpose({ id: `p${i + 1}`, ...p })),
  reflectionNote,
});
const i = (done: boolean, text = "t") => ({ id: "x", text, done, doneAt: null });

describe("encryption", () => {
  it("round-trips each purpose, its intentions and the day's evening note", () => {
    const stored = {
      dailyPurposes: [
        {
          _id: "a",
          text: sealText(crypto, "  Be present with family  "),
          focusValues: ["Family", "Health"],
          intentions: [
            { _id: "i1", text: crypto.encrypt("Call Amma"), done: true, doneAt: at },
            { _id: "i2", text: crypto.encrypt("Go cycling"), done: false },
          ],
          rating: 4,
          createdAt: at,
          updatedAt: at,
        },
        { _id: "b", text: crypto.encrypt("Finish the report calmly"), focusValues: [], intentions: [], createdAt: at, updatedAt: at },
      ],
      dailyReflectionNote: crypto.encrypt("A calm, good day"),
    };
    // Nothing readable is stored
    expect(JSON.stringify(stored)).not.toMatch(/Amma|cycling|present|calm|report/);

    expect(openDayPurposes(crypto, stored)).toEqual({
      purposes: [
        {
          id: "a",
          text: "Be present with family",
          focusValues: ["Family", "Health"],
          intentions: [
            { id: "i1", text: "Call Amma", done: true, doneAt: at.toISOString() },
            { id: "i2", text: "Go cycling", done: false, doneAt: null },
          ],
          rating: 4,
          createdAt: at.toISOString(),
          updatedAt: at.toISOString(),
        },
        { id: "b", text: "Finish the report calmly", focusValues: [], intentions: [], rating: null, createdAt: at.toISOString(), updatedAt: at.toISOString() },
      ],
      reflectionNote: "A calm, good day",
    });
  });

  it("stores nothing for empty text", () => {
    expect(sealText(crypto, "   ")).toBeUndefined();
    expect(sealText(crypto, undefined)).toBeUndefined();
  });

  it("shows text it can't decrypt (another key) as empty instead of failing", () => {
    const opened = openDayPurposes(otherKey, { dailyPurposes: [{ _id: "a", text: crypto.encrypt("secret") }], dailyReflectionNote: crypto.encrypt("note") });
    expect(opened.purposes[0]!.text).toBe("");
    expect(opened.reflectionNote).toBe("");
  });

  it("knows when a day has no purpose", () => {
    expect(openDayPurposes(crypto, null)).toEqual({ purposes: [], reflectionNote: "" });
    expect(hasDayPurposes(day([]))).toBe(false);
    expect(hasDayPurposes(day([], "Just a note"))).toBe(true);
    expect(hasDayPurposes(day())).toBe(true);
  });
});

describe("limits", () => {
  it("allows up to 5 purposes a day and 5 intentions per purpose", () => {
    expect(MAX_PURPOSES).toBe(ENTRY_LIMITS.purposes);
    expect(MAX_INTENTIONS).toBe(ENTRY_LIMITS.intentions);
    expect(canAddPurpose(4)).toBe(true);
    expect(canAddPurpose(5)).toBe(false);
    expect(canAddIntention(0)).toBe(true);
    expect(canAddIntention(4)).toBe(true);
    expect(canAddIntention(5)).toBe(false);
  });

  it("checks purpose text, focus values, intentions, the rating and the evening note", () => {
    expect(intentionSchema.safeParse({ text: "x".repeat(200) }).success).toBe(true);
    expect(intentionSchema.safeParse({ text: "x".repeat(201) }).success).toBe(false);
    expect(intentionSchema.safeParse({ text: "  " }).success).toBe(false);
    expect(intentionPatchSchema.safeParse({}).success).toBe(false);
    expect(intentionPatchSchema.parse({ done: true })).toEqual({ done: true });

    expect(purposeCreateSchema.safeParse({ text: "Be kind", focusValues: ["A", "B", "C"] }).success).toBe(true);
    expect(purposeCreateSchema.safeParse({ text: "Be kind", focusValues: ["A", "B", "C", "D"] }).success).toBe(false);
    expect(purposeCreateSchema.safeParse({ text: "x".repeat(501) }).success).toBe(false);
    expect(purposeCreateSchema.safeParse({ text: "  " }).success).toBe(false);

    expect(purposePatchSchema.safeParse({}).success).toBe(false);
    expect(purposePatchSchema.safeParse({ rating: 5 }).success).toBe(true);
    expect(purposePatchSchema.safeParse({ rating: null }).success).toBe(true);
    expect(purposePatchSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(purposePatchSchema.safeParse({ rating: 3.5 }).success).toBe(false);

    expect(reflectionNoteSchema.safeParse({ note: "x".repeat(1000) }).success).toBe(true);
    expect(reflectionNoteSchema.safeParse({ note: "x".repeat(1001) }).success).toBe(false);
    expect(reflectionNoteSchema.safeParse({ note: null }).success).toBe(true);
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
  it("counts days, purposes, completed intentions, the average rating across purposes and top values", () => {
    const stats = purposeStats([
      day([
        { focusValues: ["Family", "Health"], intentions: [i(true), i(false)], rating: 4 },
        { focusValues: ["Family"], intentions: [i(true)], rating: 3 },
      ]),
      day([{ focusValues: ["Family"], intentions: [i(true), i(true)], rating: 5 }]),
      day([{ focusValues: ["Growth"] }]),
      day([], "Only a note"),
      null,
    ]);
    expect(stats).toEqual({
      daysWithPurpose: 3,
      purposesTotal: 4,
      intentionsTotal: 5,
      intentionsDone: 4,
      intentionsDonePercent: 80,
      avgRating: 4,
      topValues: [
        { value: "Family", days: 2 },
        { value: "Growth", days: 1 },
        { value: "Health", days: 1 },
      ],
    });
  });

  it("has nulls without intentions or ratings", () => {
    expect(purposeStats([])).toMatchObject({ daysWithPurpose: 0, purposesTotal: 0, intentionsDonePercent: null, avgRating: null, topValues: [] });
  });

  it("sums a day for its header: 3 purposes · 5 of 8 intentions done", () => {
    const d = day([
      { intentions: [i(true), i(true), i(false)], rating: 4 },
      { intentions: [i(true), i(false), i(false)] },
      { intentions: [i(true), i(true)], rating: 5 },
    ]);
    expect(daySummary(d)).toEqual({ purposes: 3, intentions: 8, intentionsDone: 5, ratings: [4, 5], avgRating: 4.5 });
  });
});

describe("AI facts", () => {
  it("sends only counts, ratings and safe value words — never any text", () => {
    const d = day(
      [
        { text: "SECRET_PURPOSE", focusValues: ["Family", "SECRET_VALUE Priya"], intentions: [i(true, "SECRET_INTENTION call Amma"), i(false, "SECRET_INTENTION 2")], rating: 4 },
        { text: "SECRET_PURPOSE_2", focusValues: [], intentions: [i(true, "SECRET_INTENTION 3")], rating: 2 },
      ],
      "SECRET_NOTE",
    );
    const facts = purposeFacts(d, safeValueWord);
    expect(facts).toEqual({ set: true, purposes: 2, intentions: 3, intentionsDone: 2, ratings: [4, 2], avgRating: 3, focusValues: ["family", "other value"] });
    expect(JSON.stringify(facts)).not.toMatch(/SECRET|Amma|Priya/);
    expect(purposeFacts(null, safeValueWord)).toEqual({ set: false });
    expect(purposeFacts(day([], "SECRET_NOTE"), safeValueWord)).toEqual({ set: false });
  });

  it("still checks every purpose text for crisis language", () => {
    const d = day([{ text: "One", intentions: [i(false, "Rest")] }, { text: "Two" }], "Hard day");
    expect(purposeText(d)).toEqual(["One", "Rest", "Two", "Hard day"]);
  });
});

describe("date range", () => {
  it("starts the purpose list at the journey start", () => {
    expect(clampFrom("2026-10-23", "2026-11-21")).toBe("2026-11-21");
    expect(clampFrom("2026-11-22", "2026-11-21")).toBe("2026-11-22");
  });
});
