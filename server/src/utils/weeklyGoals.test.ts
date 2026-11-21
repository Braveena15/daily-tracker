/// <reference types="vitest/globals" />
// Weekly goals follow the Weekly review's week boundaries and the journey start.
import { goalWeekProblem, nextGoalWeek, overlaps } from "./weeklyGoals";
import { weekRanges } from "./progress";

describe("nextGoalWeek", () => {
  it("is the 7 days after the review week, i.e. exactly the review week ending 7 days later", () => {
    const week = nextGoalWeek("2026-11-21");
    expect(week).toEqual({ weekStart: "2026-11-22", weekEnd: "2026-11-28" });
    const { current } = weekRanges("2026-11-28");
    expect({ weekStart: current.from, weekEnd: current.to }).toEqual(week);
  });

  it("crosses months and years", () => {
    expect(nextGoalWeek("2026-12-29")).toEqual({ weekStart: "2026-12-30", weekEnd: "2027-01-05" });
  });
});

describe("overlaps", () => {
  it("is true when the weeks share a day, false otherwise", () => {
    const a = { weekStart: "2026-11-22", weekEnd: "2026-11-28" };
    expect(overlaps(a, { weekStart: "2026-11-28", weekEnd: "2026-12-04" })).toBe(true);
    expect(overlaps(a, { weekStart: "2026-11-29", weekEnd: "2026-12-05" })).toBe(false);
  });
});

describe("goalWeekProblem", () => {
  const today = "2026-11-21";
  it("allows this week's review and recent ones", () => {
    expect(goalWeekProblem(today, "2026-10-01", today)).toBeNull();
    expect(goalWeekProblem("2026-11-15", "2026-10-01", today)).toBeNull(); // next week runs to the 22nd
  });
  it("refuses weeks before the journey, in the future, or already over", () => {
    expect(goalWeekProblem("2026-09-30", "2026-10-01", today)).toMatch(/before your journey/);
    expect(goalWeekProblem("2026-11-22", "2026-10-01", today)).toMatch(/hasn't happened/);
    expect(goalWeekProblem("2026-11-10", "2026-10-01", today)).toMatch(/already over/);
  });
});
