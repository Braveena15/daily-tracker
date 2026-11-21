/// <reference types="vitest/globals" />
// Water totals and weekly figures (not part of the scores).
import { waterSeries, waterTotal, waterWeek } from "./water";

describe("waterTotal", () => {
  it("adds up the day's drinks", () => {
    expect(waterTotal([{ amountMl: 250 }, { amountMl: 500 }, { amountMl: 250 }])).toBe(1000);
    expect(waterTotal([])).toBe(0);
    expect(waterTotal(undefined)).toBe(0);
  });
});

describe("waterWeek", () => {
  it("averages only days with water and counts days the goal was reached", () => {
    expect(waterWeek([2000, 0, 1500, null, 2600], 2000)).toEqual({ avgWaterMl: 2033, waterDays: 3, waterGoalDays: 2 });
    expect(waterWeek([0, null], 2000)).toEqual({ avgWaterMl: null, waterDays: 0, waterGoalDays: 0 });
  });
  it("counts reaching the goal exactly", () => {
    expect(waterWeek([2000], 2000).waterGoalDays).toBe(1);
  });
});

describe("waterSeries", () => {
  it("has one point per day, 0 for days without water", () => {
    expect(waterSeries(new Map([["2026-11-20", 750]]), "2026-11-19", "2026-11-21")).toEqual([
      { date: "2026-11-19", ml: 0 },
      { date: "2026-11-20", ml: 750 },
      { date: "2026-11-21", ml: 0 },
    ]);
  });
  it("is empty when the range starts after it ends (journey starting today or later)", () => {
    expect(waterSeries(new Map(), "2026-11-22", "2026-11-21")).toEqual([]);
  });
});
