/// <reference types="vitest/globals" />
import { addDays } from "./dates";
import { programStats, targetsHit, type ProgramDayRow } from "./programStats";

const START = "2026-11-01";
const day = (n: number, over: Partial<ProgramDayRow> = {}): ProgramDayRow => ({
  date: addDays(START, n - 1),
  logged: true,
  overall: 60,
  physical: 60,
  mental: 60,
  learning: 60,
  avgMood: 6,
  workouts: 0,
  learningMinutes: 0,
  waterMl: 0,
  sleepHours: null,
  weightKg: null,
  eatenKcal: null,
  habitsDone: [],
  ...over,
});

describe("programStats", () => {
  it("ended early on day 10: consistency over the 10 days completed, last week partial", () => {
    // Logged 8 of the 10 days completed
    const days = Array.from({ length: 10 }, (_, i) => day(i + 1, { logged: i !== 3 && i !== 7, avgMood: i < 7 ? 6 : 8 }));
    const s = programStats({ startDate: START, days, plan: {}, daysCompleted: 10 });
    expect(s.daysLogged).toBe(8);
    expect(s.consistency).toBe(80);
    expect(s.weeks.map((w) => [w.week, w.days, w.partial])).toEqual([
      [1, 7, false],
      [2, 3, true],
    ]);
  });

  it("counts habits per completed day and finds the best week", () => {
    const days = [
      ...Array.from({ length: 7 }, (_, i) => day(i + 1, { overall: 50, habitsDone: i < 7 ? ["a"] : [] })),
      ...Array.from({ length: 7 }, (_, i) => day(i + 8, { overall: 80, habitsDone: i < 3 ? ["a"] : [] })),
    ];
    const s = programStats({ startDate: START, days, plan: { customHabits: [{ id: "a", label: "No sugar" }] }, daysCompleted: 14 });
    expect(s.habits).toEqual([{ id: "a", label: "No sugar", daysDone: 10, percent: 71 }]);
    expect(s.bestWeek).toMatchObject({ week: 2, avgOverall: 80 });
    expect(s.streaks.longest).toBe(14);
  });

  it("averages only over logged days; unlogged days never count as zero", () => {
    const s = programStats({ startDate: START, days: [day(1, { avgMood: 8 }), day(2, { logged: false, avgMood: null, overall: null })], plan: {}, daysCompleted: 2 });
    expect(s.totals.avgMood).toBe(8);
    expect(s.totals.avgOverall).toBe(60);
  });
});

describe("targetsHit", () => {
  it("checks each set target; unset ones are left out", () => {
    const plan = { waterMl: 2000, calorieTarget: 1800, sleepHours: 7, workoutsPerWeek: 3, learningMinutes: 20 };
    expect(targetsHit(day(1, { waterMl: 2100, eatenKcal: 1700, sleepHours: 6.5, workouts: 1, learningMinutes: 30 }), plan)).toEqual({
      water: true,
      calories: true,
      sleep: false,
      workout: true,
      learning: true,
    });
    expect(targetsHit(day(1), { waterMl: 2000 })).toEqual({ water: false });
    // No meals logged isn't "hit"
    expect(targetsHit(day(1), { calorieTarget: 1800 }).calories).toBe(false);
  });
});
