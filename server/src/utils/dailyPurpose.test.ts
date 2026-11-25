/// <reference types="vitest/globals" />
import { createFieldCrypto } from "./crypto";
import {
  MAX_PURPOSES,
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
  matchSuggestions,
  normalizePurpose,
  purposeFacts,
  purposeStats,
  purposeSuggestions,
  purposeText,
  recurringPurposes,
  sealText,
  type DayPurpose,
  type DayPurposes,
} from "./dailyPurpose";
import { clampFrom } from "./journey";
import { ENTRY_LIMITS } from "../models/DailyEntry";
import { purposeSchema } from "../validation/mindSchema";
import { purposeCreateSchema, purposePatchSchema, reflectionNoteSchema } from "../validation/purposeSchema";

const crypto = createFieldCrypto("a".repeat(64));
const otherKey = createFieldCrypto("b".repeat(64));
const at = new Date("2026-11-21T03:00:00.000Z");

const purpose = (overrides: Partial<DayPurpose> = {}): DayPurpose => ({
  id: "p1",
  text: "Be present with family",
  focusValues: ["Family"],
  intensity: null,
  createdAt: at.toISOString(),
  updatedAt: at.toISOString(),
  ...overrides,
});
const day = (purposes: Partial<DayPurpose>[] = [{}], reflectionNote = ""): DayPurposes => ({
  purposes: purposes.map((p, i) => purpose({ id: `p${i + 1}`, ...p })),
  reflectionNote,
});

describe("encryption", () => {
  it("round-trips each purpose and the day's evening note (older intentions are left out)", () => {
    const stored = {
      dailyPurposes: [
        {
          _id: "a",
          text: sealText(crypto, "  Be present with family  "),
          focusValues: ["Family", "Health"],
          // Older data: still stored, never returned
          intentions: [{ _id: "i1", text: crypto.encrypt("Call Amma"), done: true, doneAt: at }],
          intensity: 8,
          createdAt: at,
          updatedAt: at,
        },
        // From before intensity existed: the old rating is never shown
        { _id: "b", text: crypto.encrypt("Finish the report calmly"), focusValues: [], legacyRating: 4, createdAt: at, updatedAt: at },
      ],
      dailyReflectionNote: crypto.encrypt("A calm, good day"),
    };
    // Nothing readable is stored
    expect(JSON.stringify(stored)).not.toMatch(/Amma|present|calm|report/);

    expect(openDayPurposes(crypto, stored)).toEqual({
      purposes: [
        {
          id: "a",
          text: "Be present with family",
          focusValues: ["Family", "Health"],
          intensity: 8,
          createdAt: at.toISOString(),
          updatedAt: at.toISOString(),
        },
        { id: "b", text: "Finish the report calmly", focusValues: [], intensity: null, createdAt: at.toISOString(), updatedAt: at.toISOString() },
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
  it("allows up to 5 purposes a day", () => {
    expect(MAX_PURPOSES).toBe(ENTRY_LIMITS.purposes);
    expect(canAddPurpose(4)).toBe(true);
    expect(canAddPurpose(5)).toBe(false);
  });

  it("checks purpose text, intensity (0–10, required to add), focus values and the evening note", () => {
    expect(purposeCreateSchema.safeParse({ text: "Be kind", intensity: 5, focusValues: ["A", "B", "C"] }).success).toBe(true);
    expect(purposeCreateSchema.safeParse({ text: "Be kind", intensity: 5, focusValues: ["A", "B", "C", "D"] }).success).toBe(false);
    expect(purposeCreateSchema.safeParse({ text: "x".repeat(501), intensity: 5 }).success).toBe(false);
    expect(purposeCreateSchema.safeParse({ text: "  ", intensity: 5 }).success).toBe(false);
    // Intensity: required, a whole number from 0 to 10
    expect(purposeCreateSchema.safeParse({ text: "Be kind" }).error?.issues[0]?.message).toBe("Choose how strongly you feel this (0–10)");
    for (const ok of [0, 5, 10]) expect(purposeCreateSchema.safeParse({ text: "Be kind", intensity: ok }).success).toBe(true);
    for (const bad of [-1, 11, 6.5, "7", null]) expect(purposeCreateSchema.safeParse({ text: "Be kind", intensity: bad }).success).toBe(false);
    // No rating any more
    expect(purposeCreateSchema.safeParse({ text: "Be kind", intensity: 5, rating: 4 }).success).toBe(false);

    expect(purposePatchSchema.safeParse({}).success).toBe(false);
    expect(purposePatchSchema.safeParse({ intensity: 0 }).success).toBe(true);
    expect(purposePatchSchema.safeParse({ intensity: null }).success).toBe(false);
    expect(purposePatchSchema.safeParse({ rating: 5 }).success).toBe(false);

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
  it("counts days, purposes, the average intensity across purposes and top values", () => {
    const stats = purposeStats([
      day([
        { focusValues: ["Family", "Health"], intensity: 8 },
        { focusValues: ["Family"], intensity: 4 },
      ]),
      day([{ focusValues: ["Family"], intensity: 9 }]),
      day([{ focusValues: ["Growth"] }]), // from before intensity existed
      day([], "Only a note"),
      null,
    ]);
    expect(stats).toEqual({
      daysWithPurpose: 3,
      purposesTotal: 4,
      avgIntensity: 7,
      topValues: [
        { value: "Family", days: 2 },
        { value: "Growth", days: 1 },
        { value: "Health", days: 1 },
      ],
    });
  });

  it("has nulls without intensities", () => {
    expect(purposeStats([])).toMatchObject({ daysWithPurpose: 0, purposesTotal: 0, avgIntensity: null, topValues: [] });
  });

  it("sums a day for its header: 2 things · avg intensity 7/10", () => {
    expect(daySummary(day([{ intensity: 8 }, { intensity: 6 }]))).toEqual({ purposes: 2, intensities: [8, 6], avgIntensity: 7 });
  });
});

describe("recurring purposes", () => {
  const on = (date: string, ...purposes: Partial<DayPurpose>[]) => ({ date, ...day(purposes) });

  it("groups by text ignoring case and extra spaces, most frequent first, with average intensity and 30 days", () => {
    const list = recurringPurposes(
      [
        on("2026-11-20", { text: "Be patient", intensity: 6 }, { text: "Walk outside", intensity: 3 }),
        on("2026-11-22", { text: "  be   PATIENT ", intensity: 8 }),
        on("2026-11-24", { text: "Be patient", intensity: null }),
        on("2026-11-24", { text: "Call Amma", intensity: 9 }),
        on("2026-11-23", { text: "Call Amma", intensity: 7 }),
      ],
      "2026-11-25",
    );
    expect(list.map((r) => [r.text, r.count, r.avgIntensity, r.lastDate])).toEqual([
      ["Be patient", 3, 7, "2026-11-24"],
      ["Call Amma", 2, 8, "2026-11-24"],
      ["Walk outside", 1, 3, "2026-11-20"],
    ]);
    expect(list[0]!.last30).toHaveLength(30);
    expect(list[0]!.last30.slice(-6)).toEqual([6, null, 8, null, null, null]);
  });

  it("counts the same thing twice in one day once, at its stronger intensity", () => {
    const [r] = recurringPurposes([on("2026-11-25", { text: "Rest", intensity: 3 }, { text: "rest", intensity: 7 })], "2026-11-25");
    expect(r).toMatchObject({ count: 1, avgIntensity: 7 });
  });

  it("leaves out purposes without text, and is empty without days", () => {
    expect(recurringPurposes([on("2026-11-25", { text: "  " })], "2026-11-25")).toEqual([]);
    expect(recurringPurposes([], "2026-11-25")).toEqual([]);
  });
});

describe("suggestions", () => {
  it("offers earlier wordings once each, most used first, and matches what's typed ignoring case and spaces", () => {
    const days = [
      { date: "2026-11-20", ...day([{ text: "Be patient" }, { text: "Walk outside" }]) },
      { date: "2026-11-22", ...day([{ text: "be  patient" }]) },
    ];
    const suggestions = purposeSuggestions(days);
    expect(suggestions).toEqual(["be patient", "Walk outside"]);
    expect(normalizePurpose("  Be   Patient ")).toBe("be patient");
    expect(matchSuggestions(["Be patient with the kids", "Walk outside", "Be present"], "  BE  p")).toEqual(["Be patient with the kids", "Be present"]);
    // An exact match isn't suggested back, and nothing is suggested before typing
    expect(matchSuggestions(["Walk outside"], "walk  OUTSIDE")).toEqual([]);
    expect(matchSuggestions(["Walk outside"], "  ")).toEqual([]);
  });
});

describe("AI facts", () => {
  it("sends only counts and intensity numbers — never any text or value words", () => {
    const d = day(
      [
        { text: "SECRET_PURPOSE", focusValues: ["Family", "SECRET_VALUE Priya"], intensity: 8 },
        { text: "SECRET_PURPOSE_2", focusValues: [], intensity: 4 },
      ],
      "SECRET_NOTE",
    );
    const facts = purposeFacts(d);
    expect(facts).toEqual({ set: true, purposes: 2, intensities: [8, 4], avgIntensity: 6 });
    expect(JSON.stringify(facts)).not.toMatch(/SECRET|Priya|Family/);
    expect(purposeFacts(null)).toEqual({ set: false });
    expect(purposeFacts(day([], "SECRET_NOTE"))).toEqual({ set: false });
  });

  it("still checks every purpose text for crisis language", () => {
    expect(purposeText(day([{ text: "One" }, { text: "Two" }], "Hard day"))).toEqual(["One", "Two", "Hard day"]);
  });
});

describe("date range", () => {
  it("starts the purpose list at the journey start", () => {
    expect(clampFrom("2026-10-23", "2026-11-21")).toBe("2026-11-21");
    expect(clampFrom("2026-11-22", "2026-11-21")).toBe("2026-11-22");
  });
});
