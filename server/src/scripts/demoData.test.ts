/// <reference types="vitest/globals" />
import { DEMO_FOODS, generateDemoData } from "./demoData";
import { entrySchema } from "../validation/entrySchema";

const TODAY = "2026-11-19";

describe("generateDemoData", () => {
  const { entries, mealDays } = generateDemoData(TODAY);

  it("covers 60 days ending today, with some days missing", () => {
    expect(entries.length).toBeGreaterThan(40);
    expect(entries.length).toBeLessThan(60);
    expect(entries.every((e) => e.date >= "2026-09-21" && e.date <= TODAY)).toBe(true);
    expect(entries.at(-1)?.date).toBe(TODAY);
  });

  it("is the same every run", () => {
    expect(generateDemoData(TODAY)).toEqual({ entries, mealDays });
  });

  it("produces entries the API itself would accept", () => {
    for (const { date: _date, ...entry } of entries) {
      expect(entrySchema.safeParse(entry).success).toBe(true);
    }
  });

  it("has a gentle downward weight trend", () => {
    const weights = entries.filter((e) => e.weightKg !== undefined).map((e) => e.weightKg!);
    const firstWeek = weights.slice(0, 5).reduce((s, w) => s + w, 0) / 5;
    const lastWeek = weights.slice(-5).reduce((s, w) => s + w, 0) / 5;
    expect(lastWeek).toBeLessThan(firstWeek - 2);
    expect(lastWeek).toBeGreaterThan(firstWeek - 6);
  });

  it("varies moods and only uses known foods", () => {
    expect(new Set(entries.map((e) => e.mood)).size).toBeGreaterThan(3);
    const names = new Set<string>(DEMO_FOODS.map((f) => f.name));
    expect(mealDays.flatMap((d) => d.items).every((i) => names.has(i.foodName))).toBe(true);
  });
});
