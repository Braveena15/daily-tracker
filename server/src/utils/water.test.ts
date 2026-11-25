/// <reference types="vitest/globals" />
// Water totals and weekly figures (not part of the scores).
import { WATER_TOTAL_CAP_ML, parseWaterAmount, waterSeries, waterTotal, waterTotalRange, waterWeek } from "./water";
import { waterTotalSchema } from "../validation/entrySchema";

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
  it("has one point per day, null (not 0) for days without water", () => {
    expect(waterSeries(new Map([["2026-11-20", 750], ["2026-11-21", 0]]), "2026-11-19", "2026-11-21")).toEqual([
      { date: "2026-11-19", ml: null },
      { date: "2026-11-20", ml: 750 },
      { date: "2026-11-21", ml: null },
    ]);
  });

  it("counts only logged days for the goal: 0 of 2 logged days", () => {
    const points = waterSeries(new Map([["2026-11-20", 750], ["2026-11-21", 1200]]), "2026-11-15", "2026-11-21");
    expect(waterWeek(points.map((p) => p.ml), 2000)).toEqual({ avgWaterMl: 975, waterDays: 2, waterGoalDays: 0 });
  });
  it("is empty when the range starts after it ends (journey starting today or later)", () => {
    expect(waterSeries(new Map(), "2026-11-22", "2026-11-21")).toEqual([]);
  });
});

describe("editing the day's total", () => {
  it("reads ml and litres the way people type them", () => {
    expect(parseWaterAmount("1500")).toBe(1500);
    expect(parseWaterAmount("1500 ml")).toBe(1500);
    expect(parseWaterAmount("1500ML")).toBe(1500);
    expect(parseWaterAmount("1.5 L")).toBe(1500);
    expect(parseWaterAmount("1.5l")).toBe(1500);
    expect(parseWaterAmount("1,5 L")).toBe(1500);
    expect(parseWaterAmount("2 litres")).toBe(2000);
    expect(parseWaterAmount(" 0.75 liter ")).toBe(750);
    // Without a unit: small numbers are litres, bigger ones ml
    expect(parseWaterAmount("1.5")).toBe(1500);
    expect(parseWaterAmount("2")).toBe(2000);
    expect(parseWaterAmount("250")).toBe(250);
    expect(parseWaterAmount("0")).toBe(0);
    expect(parseWaterAmount(1234.4)).toBe(1234);
  });

  it("refuses anything that isn't an amount", () => {
    for (const bad of ["", "abc", "1.5 cups", "-200", "1..5 L", "L", -5, Number.NaN, null, undefined, {}]) {
      expect(parseWaterAmount(bad), String(bad)).toBeNull();
    }
  });

  it("allows 0 to 2 × the goal, never above 6000 ml", () => {
    expect(waterTotalRange(2000)).toEqual({ min: 0, max: 4000 });
    expect(waterTotalRange(2500)).toEqual({ min: 0, max: 5000 });
    expect(waterTotalRange(4000)).toEqual({ min: 0, max: WATER_TOTAL_CAP_ML });
  });

  it("validates the request body", () => {
    expect(waterTotalSchema.parse({ totalMl: 1500 })).toEqual({ totalMl: 1500 });
    expect(waterTotalSchema.parse({ totalMl: "1.5 L" })).toEqual({ totalMl: 1500 });
    expect(waterTotalSchema.parse({ totalMl: 0 })).toEqual({ totalMl: 0 });
    expect(waterTotalSchema.safeParse({ totalMl: "lots" }).success).toBe(false);
    expect(waterTotalSchema.safeParse({ totalMl: -1 }).success).toBe(false);
    expect(waterTotalSchema.safeParse({ totalMl: 6001 }).success).toBe(false);
    expect(waterTotalSchema.safeParse({}).success).toBe(false);
    expect(waterTotalSchema.safeParse({ totalMl: 500, extra: 1 }).success).toBe(false);
  });
});
