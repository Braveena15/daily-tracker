/// <reference types="vitest/globals" />
import { buildConditions, findInsights, type InsightDay } from "./insights";

let n = 0;
function day(overrides: Partial<InsightDay>): InsightDay {
  n++;
  return {
    date: `2026-10-${String(n).padStart(2, "0")}`,
    mood: 6,
    mentalScore: 60,
    activities: [],
    outdoor: false,
    sleepHours: 6.5,
    ...overrides,
  };
}
const repeat = (count: number, overrides: Partial<InsightDay>) => Array.from({ length: count }, () => day(overrides));

describe("buildConditions", () => {
  it("includes activities seen on at least 5 days, plus outdoor and sleep", () => {
    const days = [...repeat(5, { activities: ["Cycling"] }), ...repeat(4, { activities: ["Yoga"] })];
    expect(buildConditions(days).map((c) => c.key)).toEqual(["activity:cycling", "outdoor", "sleep7"]);
  });

  it("groups spellings and shows the most common one", () => {
    const days = [...repeat(3, { activities: ["Cycling"] }), ...repeat(2, { activities: ["cycling "] })];
    const [cycling] = buildConditions(days);
    expect(cycling?.phrase).toBe("logged Cycling");
  });
});

describe("findInsights", () => {
  it("finds a clear pattern and words it as an observation", () => {
    const days = [
      ...repeat(5, { activities: ["Cycling"], mood: 8, mentalScore: 75 }),
      ...repeat(5, { mood: 6, mentalScore: 60 }),
    ];
    const [insight] = findInsights(days);
    expect(insight).toMatchObject({ key: "activity:cycling", daysWith: 5, daysWithout: 5, moodWith: 8, moodWithout: 6 });
    expect(insight?.text).toBe(
      "On days you logged Cycling, your mood averaged 8/10 — 2 points higher than on days you didn't (6). Your mental score averaged 75 vs 60.",
    );
  });

  it("says '1 point' and leaves out a mental score that barely differs", () => {
    const days = [...repeat(5, { outdoor: true, mood: 7, mentalScore: 61 }), ...repeat(5, { mood: 6, mentalScore: 60 })];
    expect(findInsights(days)[0]?.text).toBe(
      "On days you spent time outdoors, your mood averaged 7/10 — 1 point higher than on days you didn't (6).",
    );
  });

  it("needs at least 5 days in each group", () => {
    const days = [...repeat(4, { activities: ["Cycling"], mood: 9 }), ...repeat(10, { mood: 5 })];
    expect(findInsights(days).find((i) => i.key === "activity:cycling")).toBeUndefined();
  });

  it("ignores differences smaller than 0.8 mood points", () => {
    const days = [...repeat(5, { outdoor: true, mood: 6.7 }), ...repeat(5, { mood: 6 })];
    expect(findInsights(days)).toEqual([]);
  });

  it("reports lower moods too", () => {
    const days = [...repeat(6, { sleepHours: 8, mood: 5 }), ...repeat(6, { sleepHours: 5, mood: 7 })];
    const [insight] = findInsights(days);
    expect(insight?.key).toBe("sleep7");
    expect(insight?.text).toContain("points lower than on days you slept less");
  });

  it("returns at most 3, biggest difference first", () => {
    const days = [
      ...repeat(5, { activities: ["A", "B", "C", "D"], outdoor: true, sleepHours: 8, mood: 9 }),
      ...repeat(5, { mood: 5 }),
    ];
    expect(findInsights(days)).toHaveLength(3);
  });

  it("returns nothing for too little data", () => {
    expect(findInsights([])).toEqual([]);
  });
});
