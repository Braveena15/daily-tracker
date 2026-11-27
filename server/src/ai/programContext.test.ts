/// <reference types="vitest/globals" />
import { buildProgramContext } from "./buildContext";

describe("buildProgramContext", () => {
  it("sends numbers only: no custom rating names, habit names or any text", () => {
    const ctx = buildProgramContext({
      status: "ended_early",
      lengthDays: 100,
      dayNumber: 37,
      daysLeft: 0,
      daysLogged: 30,
      consistency: 81,
      longestStreak: 12,
      totals: { workouts: 14, learningHours: 9.5, avgSleep: 7.1, avgMood: 6.4 },
      weight: { change: -2.3, progress: 29 },
      ratings: [
        { key: "discipline", before: 4, goal: 8, latest: 7 },
        { key: "custom:My secret goal", before: 2, goal: 9, latest: 5 },
      ],
      targetsHit: 120,
      targetsPossible: 185,
      habitPercents: [70, 45],
    });
    expect(ctx).toMatchObject({ task: "program", mode: "minimal" });
    const json = JSON.stringify(ctx);
    expect(json).not.toContain("secret");
    expect(ctx.data.ratings).toEqual([{ name: "discipline", before: 4, goal: 8, latest: 7 }]);
    // Only numbers, booleans, the status word and built-in rating names
    const strings = JSON.stringify(ctx.data).match(/"[^"]*":"([^"]*)"/g) ?? [];
    expect(strings.map((s) => s.split(":")[1])).toEqual(['"ended_early"', '"discipline"']);
  });
});
