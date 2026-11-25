/// <reference types="vitest/globals" />
import { DEMO_FOODS, DEMO_PURPOSE, generateDemoData, generateDemoMind } from "./demoData";
import { dailySchema, entrySchemas } from "../validation/entrySchema";
import { ENTRY_LIMITS } from "../models/DailyEntry";
import { sleepScore } from "../utils/sleep";

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

  it("logs every entry on its own day", () => {
    for (const e of entries) {
      const stamps = [...e.moodLogs, ...e.workouts, ...e.goodThings, ...e.learnings, ...e.presentMoments].map((i) => i.loggedAt);
      const start = Date.parse(`${e.date}T00:00:00+05:30`);
      expect(stamps.every((at) => at.getTime() >= start && at.getTime() < start + 24 * 3600_000)).toBe(true);
      expect(e).not.toHaveProperty("healthSnapshots");
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

describe("generateDemoData extras", () => {
  const { entries } = generateDemoData(TODAY);

  it("logs water the API would accept on every day", () => {
    for (const e of entries) {
      expect(e.waterLogs.length).toBeGreaterThan(0);
      expect(e.waterLogs.every(({ loggedAt: _at, ...w }) => entrySchemas.water.safeParse(w).success)).toBe(true);
    }
  });

  it("has a night of sleep with stages and a score worked out like a real sync", () => {
    const bedtimes: string[] = [];
    for (const e of entries) {
      const s = e.sleep!;
      expect(s.deepMin + s.remMin + s.coreMin).toBe(s.totalSleepMin);
      expect(s.bedtime).toMatch(/^\d{2}:\d{2}$/);
      expect(sleepScore(s, bedtimes.slice(-14)).score).toBe(s.score);
      expect(e.sleepScoreValue).toBe(s.score);
      expect(e.sleepHours).toBeCloseTo(s.totalSleepMin / 60, 1);
      bedtimes.push(s.bedtime);
    }
  });

  it("has daily purposes within the app's limits, always one today, and no reflection yet today", () => {
    const withPurpose = entries.filter((e) => e.dailyPurposes);
    expect(withPurpose.length).toBeGreaterThan(entries.length / 2);
    expect(withPurpose.some((e) => e.dailyPurposes!.length > 1)).toBe(true);
    for (const { dailyPurposes } of withPurpose) {
      expect(dailyPurposes!.length).toBeGreaterThan(0);
      expect(dailyPurposes!.length).toBeLessThanOrEqual(ENTRY_LIMITS.purposes);
      for (const p of dailyPurposes!) {
        expect(p.intentions.length).toBeLessThanOrEqual(ENTRY_LIMITS.intentions);
        expect(p.focusValues.length).toBeLessThanOrEqual(ENTRY_LIMITS.focusValues);
        expect(p.focusValues.every((v) => DEMO_PURPOSE.coreValues.includes(v))).toBe(true);
        expect(p.intentions.every((i) => i.done === Boolean(i.doneAt))).toBe(true);
      }
    }
    const today = entries.at(-1)!;
    expect(today.dailyPurposes).toBeDefined();
    // Every purpose has an intensity from 0 to 10
    expect(withPurpose.flatMap((e) => e.dailyPurposes!).every((p) => Number.isInteger(p.intensity) && p.intensity >= 0 && p.intensity <= 10)).toBe(true);
    expect(today.dailyReflectionNote).toBeUndefined();
  });

  it("dates the diary, thought logs and weekly goals within the 60 days, one goal per week", () => {
    const { diary, thoughts, weeklyGoals } = generateDemoMind(TODAY);
    const inRange = (d: string) => d >= "2026-09-21" && d <= TODAY;
    expect(diary.length).toBeGreaterThan(2);
    expect(thoughts.length).toBeGreaterThan(1);
    expect([...diary, ...thoughts].every((x) => inRange(x.date))).toBe(true);
    expect(weeklyGoals.every((g) => inRange(g.weekStart) && inRange(g.weekEnd))).toBe(true);
    expect(new Set(weeklyGoals.map((g) => g.weekStart)).size).toBe(weeklyGoals.length);
    expect(weeklyGoals[0]).toEqual(expect.objectContaining({ weekEnd: TODAY, done: false }));
  });
});
