/// <reference types="vitest/globals" />
import {
  changeSinceStart,
  encouragement,
  expectedWeeklyChange,
  journeyProgress,
  summariseWeek,
  weekDifferences,
  weekRanges,
  weeklyChangeFromAverage,
  weightSeries,
  type ReviewDay,
} from "./progress";
import { addDays, listDates } from "./dates";

describe("weightSeries", () => {
  it("has one point per day with a 7-day average that skips missing days", () => {
    const weights = new Map([
      ["2026-11-01", 80],
      ["2026-11-03", 79],
    ]);
    const series = weightSeries(weights, "2026-11-01", "2026-11-04");
    expect(series).toEqual([
      { date: "2026-11-01", weightKg: 80, averageKg: 80 },
      { date: "2026-11-02", weightKg: null, averageKg: 80 },
      { date: "2026-11-03", weightKg: 79, averageKg: 79.5 },
      { date: "2026-11-04", weightKg: null, averageKg: 79.5 },
    ]);
  });
});

describe("weeklyChangeFromAverage", () => {
  it("uses the averages 28 days apart, divided by 4", () => {
    // Steady loss of 0.1 kg a day = 0.7 kg a week
    const dates = listDates("2026-10-01", "2026-11-19");
    const weights = new Map(dates.map((d, i) => [d, 90 - i * 0.1]));
    const series = weightSeries(weights, dates[0]!, dates[dates.length - 1]!);
    expect(weeklyChangeFromAverage(series)).toBeCloseTo(-0.7, 5);
  });

  it("is null without 4 weeks of history", () => {
    const weights = new Map([["2026-11-19", 80]]);
    expect(weeklyChangeFromAverage(weightSeries(weights, "2026-11-01", "2026-11-19"))).toBeNull();
  });
});

describe("changeSinceStart", () => {
  it("compares the latest weight with the first one since the start", () => {
    const weights = [
      { date: "2026-09-01", weightKg: 90 }, // before the journey: ignored
      { date: "2026-10-01", weightKg: 84 },
      { date: "2026-11-19", weightKg: 82.2 },
    ];
    expect(changeSinceStart(weights, "2026-10-01")).toBe(-1.8);
  });

  it("needs two weigh-ins", () => {
    expect(changeSinceStart([{ date: "2026-11-19", weightKg: 80 }], "2026-10-01")).toBeNull();
  });
});

describe("expectedWeeklyChange", () => {
  it("turns the daily deficit into kg per week", () => {
    expect(expectedWeeklyChange(2050, 2600)).toBe(-0.5);
    expect(expectedWeeklyChange(2600, 2600)).toBe(0);
  });
});

describe("journeyProgress", () => {
  it("counts the start date as day 1", () => {
    const p = journeyProgress({ startDate: "2026-11-01", lengthDays: 100, today: "2026-11-19", loggedDates: [] });
    expect(p).toMatchObject({ dayNumber: 19, totalDays: 100, percentComplete: 19, complete: false, endDate: "2027-02-08" });
  });

  it("counts logged days inside the journey only", () => {
    const p = journeyProgress({
      startDate: "2026-11-01",
      lengthDays: 100,
      today: "2026-11-19",
      loggedDates: ["2026-10-31", "2026-11-01", "2026-11-05", "2026-11-05", "2026-11-19"],
    });
    expect(p.daysLogged).toBe(3);
  });

  it("stops at the last day once the journey is over", () => {
    const p = journeyProgress({ startDate: "2026-01-01", lengthDays: 30, today: "2026-11-19", loggedDates: [] });
    expect(p).toMatchObject({ dayNumber: 30, percentComplete: 100, complete: true });
  });
});

const reviewDay = (date: string, overrides: Partial<ReviewDay> = {}): ReviewDay => ({
  date,
  physical: 60,
  mental: 70,
  learning: 50,
  overall: 60,
  mood: 7,
  workouts: 1,
  workoutMinutes: 30,
  learningMinutes: 20,
  kcal: 2000,
  ...overrides,
});
const unlogged = (date: string): ReviewDay =>
  reviewDay(date, { physical: null, mental: null, learning: null, overall: null, mood: null, workouts: 0, workoutMinutes: 0, learningMinutes: 0, kcal: null });

describe("summariseWeek", () => {
  it("averages only logged days and finds the best day", () => {
    const week = summariseWeek(
      [reviewDay("2026-11-13", { overall: 70, mood: 8 }), unlogged("2026-11-14"), reviewDay("2026-11-15", { overall: 50, mood: 6 })],
      "2026-11-13",
      "2026-11-19",
    );
    expect(week).toMatchObject({
      daysLogged: 2,
      avgOverall: 60,
      avgMood: 7,
      workouts: 2,
      workoutMinutes: 60,
      avgKcal: 2000,
      mealDays: 2,
      bestDay: { date: "2026-11-13", overall: 70 },
    });
  });

  it("has nulls for an empty week", () => {
    const week = summariseWeek([unlogged("2026-11-13")], "2026-11-13", "2026-11-19");
    expect(week).toMatchObject({ daysLogged: 0, avgOverall: null, avgMood: null, bestDay: null });
  });
});

describe("weekDifferences and encouragement", () => {
  const prev = summariseWeek([reviewDay("2026-11-06")], "2026-11-06", "2026-11-12");

  it("subtracts last week from this week", () => {
    const cur = summariseWeek([reviewDay("2026-11-13", { workoutMinutes: 60, mood: 8 })], "2026-11-13", "2026-11-19");
    const diff = weekDifferences(cur, prev);
    expect(diff.workoutMinutes).toBe(30);
    expect(diff.avgMood).toBe(1);
    expect(encouragement(cur, diff)).toBe("You moved more than last week — keep it going! 💪");
  });

  it("stays kind when nothing improved", () => {
    const cur = summariseWeek([reviewDay("2026-11-13", { workoutMinutes: 10, mood: 6 })], "2026-11-13", "2026-11-19");
    expect(encouragement(cur, weekDifferences(cur, prev))).toBe("1 workout this week — every one counts.");
  });

  it("has a gentle message for an empty week", () => {
    const empty = summariseWeek([], "2026-11-13", "2026-11-19");
    expect(encouragement(empty, weekDifferences(empty, prev))).toContain("fresh week");
  });
});

describe("weekRanges", () => {
  it("gives this week and the week before", () => {
    expect(weekRanges("2026-11-19")).toEqual({
      current: { from: "2026-11-13", to: "2026-11-19" },
      previous: { from: "2026-11-06", to: "2026-11-12" },
    });
    expect(addDays("2026-11-13", -1)).toBe("2026-11-12");
  });
});
