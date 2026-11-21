/// <reference types="vitest/globals" />
import {
  changeSinceStart,
  encouragement,
  expectedWeeklyChange,
  journeyProgress,
  sleepSeries,
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
  moodMin: 6,
  moodMax: 8,
  moodCount: 2,
  goodThings: 1,
  learnings: 1,
  presentMoments: 1,
  steps: 8000,
  activeCalories: 400,
  sleepHours: 7.5,
  sleepScore: 80,
  workouts: 1,
  workoutMinutes: 30,
  learningMinutes: 20,
  kcal: 2000,
  fiberG: 24,
  waterMl: 0,
  ...overrides,
});
const unlogged = (date: string): ReviewDay =>
  reviewDay(date, { physical: null, mental: null, learning: null, overall: null, mood: null, moodMin: null, moodMax: null, moodCount: 0, goodThings: 0, learnings: 0, presentMoments: 0, steps: null, activeCalories: null, sleepHours: null, sleepScore: null, workouts: 0, workoutMinutes: 0, learningMinutes: 0, kcal: null, fiberG: null, waterMl: 0 });

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

  it("averages sleep hours and sleep score over the nights that have them", () => {
    const week = summariseWeek(
      [
        reviewDay("2026-11-13", { sleepHours: 7, sleepScore: 90 }),
        reviewDay("2026-11-14", { sleepHours: 6.25, sleepScore: null }), // typed in, no watch sleep
        unlogged("2026-11-15"),
      ],
      "2026-11-13",
      "2026-11-19",
    );
    expect(week).toMatchObject({ avgSleepHours: 6.6, avgSleepScore: 90 });
  });

  it("counts only the days since the journey started in its first week", () => {
    // Journey started on the 19th: the week is 3 days, and the 13th–18th aren't "missed"
    const week = summariseWeek(
      [reviewDay("2026-11-19"), reviewDay("2026-11-20"), unlogged("2026-11-21")],
      "2026-11-15",
      "2026-11-21",
    );
    expect(week).toMatchObject({ daysTracked: 3, daysLogged: 2 });
  });

  it("doesn't compare with a week from before the journey", () => {
    const first = summariseWeek([reviewDay("2026-11-21")], "2026-11-15", "2026-11-21");
    const before = summariseWeek([], "2026-11-08", "2026-11-14");
    expect(Object.values(weekDifferences(first, before)).every((v) => v === null)).toBe(true);
  });

  it("averages daily fibre over the days that have it", () => {
    const week = summariseWeek(
      [reviewDay("2026-11-13", { fiberG: 20 }), reviewDay("2026-11-14", { fiberG: 25.5 }), reviewDay("2026-11-15", { fiberG: null })],
      "2026-11-13",
      "2026-11-19",
    );
    expect(week.avgFiberG).toBe(22.8);
    const diff = weekDifferences(week, summariseWeek([reviewDay("2026-11-06", { fiberG: 20 })], "2026-11-06", "2026-11-12"));
    expect(diff.avgFiberG).toBe(2.8);
  });

  it("has nulls for an empty week", () => {
    const week = summariseWeek([unlogged("2026-11-13")], "2026-11-13", "2026-11-19");
    expect(week).toMatchObject({ daysLogged: 0, avgOverall: null, avgMood: null, avgSleepHours: null, avgSleepScore: null, avgFiberG: null, bestDay: null });
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

describe("sleepSeries", () => {
  it("has one point per day, with nulls for nights without data", () => {
    const nights = new Map([
      ["2026-11-18", { hours: 7.23, score: 95 }],
      ["2026-11-20", { hours: 6, score: null }],
    ]);
    expect(sleepSeries(nights, "2026-11-18", "2026-11-20")).toEqual([
      { date: "2026-11-18", hours: 7.23, score: 95 },
      { date: "2026-11-19", hours: null, score: null },
      { date: "2026-11-20", hours: 6, score: null },
    ]);
  });
});

describe("summariseWeek: water", () => {
  it("averages water over days with water, counts goal days, and compares weeks", () => {
    const days = [
      reviewDay("2026-11-13", { waterMl: 2500 }),
      unlogged("2026-11-14"), // nothing at all
      { ...unlogged("2026-11-15"), waterMl: 1500 }, // only water: still counted for water
    ];
    const week = summariseWeek(days, "2026-11-13", "2026-11-19", 2000);
    expect(week).toMatchObject({ avgWaterMl: 2000, waterDays: 2, waterGoalDays: 1, daysLogged: 1 });
    const before = summariseWeek([reviewDay("2026-11-06", { waterMl: 1000 })], "2026-11-06", "2026-11-12", 2000);
    expect(weekDifferences(week, before)).toMatchObject({ avgWaterMl: 1000, waterGoalDays: 1 });
  });
});
