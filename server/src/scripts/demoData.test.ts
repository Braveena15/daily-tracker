/// <reference types="vitest/globals" />
import { DEMO_FOODS, generateDemoData } from "./demoData";
import { dailySchema, entrySchemas } from "../validation/entrySchema";

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
    const accepted = (kind: keyof typeof entrySchemas, items: { loggedAt: Date }[]) =>
      items.every(({ loggedAt: _at, ...item }) => {
        const { source: _source, ...rest } = item as Record<string, unknown>;
        return entrySchemas[kind].safeParse(rest).success;
      });
    for (const e of entries) {
      expect(accepted("moods", e.moodLogs)).toBe(true);
      expect(accepted("workouts", e.workouts)).toBe(true);
      expect(accepted("mental", e.mentalActivities)).toBe(true);
      expect(accepted("outdoor", e.outdoorActivities)).toBe(true);
      expect(accepted("goodThings", e.goodThings)).toBe(true);
      expect(accepted("learnings", e.learnings)).toBe(true);
      expect(accepted("presentMoments", e.presentMoments)).toBe(true);
      const daily = { weightKg: e.weightKg, steps: e.steps, activeCalories: e.activeCalories };
      if (Object.values(daily).some((v) => v !== undefined)) expect(dailySchema.safeParse(daily).success).toBe(true);
    }
  });

  it("logs every entry on its own day, with steps that grow through the day", () => {
    for (const e of entries) {
      const stamps = [...e.moodLogs, ...e.workouts, ...e.goodThings, ...e.learnings, ...e.presentMoments].map((i) => i.loggedAt);
      const start = Date.parse(`${e.date}T00:00:00+05:30`);
      expect(stamps.every((at) => at.getTime() >= start && at.getTime() < start + 24 * 3600_000)).toBe(true);
      const steps = e.healthSnapshots.map((s) => s.steps ?? 0);
      expect(steps).toEqual([...steps].sort((a, b) => a - b));
      expect(e.moodLogs.length).toBeGreaterThan(0);
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
    expect(new Set(entries.flatMap((e) => e.moodLogs.map((m) => m.mood))).size).toBeGreaterThan(3);
    expect(entries.some((e) => e.moodLogs.length > 1)).toBe(true);
    const names = new Set<string>(DEMO_FOODS.map((f) => f.name));
    expect(mealDays.flatMap((d) => d.items).every((i) => names.has(i.foodName))).toBe(true);
  });
});
