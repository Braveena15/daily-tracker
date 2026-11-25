/// <reference types="vitest/globals" />
import { LoggedAtError, atTime, buildTimeline, clockTime, dayMood, isEntryKind, resolveLoggedAt, timeOfDay } from "./timeline";

describe("times", () => {
  it("turns HH:mm on a day into the right instant (Asia/Colombo, UTC+05:30)", () => {
    expect(atTime("2026-11-20", "08:15").toISOString()).toBe("2026-11-20T02:45:00.000Z");
    expect(clockTime("2026-11-20T02:45:00.000Z")).toBe("08:15");
  });

  it("names the time of day", () => {
    expect(timeOfDay(atTime("2026-11-20", "08:00"))).toBe("morning");
    expect(timeOfDay(atTime("2026-11-20", "14:30"))).toBe("afternoon");
    expect(timeOfDay(atTime("2026-11-20", "19:00"))).toBe("evening");
    expect(timeOfDay(atTime("2026-11-20", "23:30"))).toBe("night");
    expect(timeOfDay(atTime("2026-11-20", "04:59"))).toBe("night");
  });
});

describe("resolveLoggedAt", () => {
  const now = new Date("2026-11-20T10:00:00.000Z"); // 15:30 in Colombo
  const today = "2026-11-20";

  it("defaults to now today, and to midday on a past day", () => {
    expect(resolveLoggedAt(today, undefined, now, today)).toBe(now);
    expect(resolveLoggedAt("2026-11-18", undefined, now, today).toISOString()).toBe("2026-11-18T06:30:00.000Z");
  });

  it("back-fills to an earlier time", () => {
    expect(resolveLoggedAt(today, "08:15", now, today).toISOString()).toBe("2026-11-20T02:45:00.000Z");
    expect(resolveLoggedAt("2026-11-18", "23:00", now, today).toISOString()).toBe("2026-11-18T17:30:00.000Z");
  });

  it("rejects a time that hasn't happened yet", () => {
    expect(() => resolveLoggedAt(today, "18:00", now, today)).toThrow(LoggedAtError);
  });
});

describe("dayMood", () => {
  it("is null without check-ins", () => {
    expect(dayMood([])).toBeNull();
    expect(dayMood(undefined)).toBeNull();
  });

  it("averages, and finds the lowest and highest check-in", () => {
    const morning = { mood: 8, energy: 7, loggedAt: "2026-11-20T02:45:00.000Z" };
    const afternoon = { mood: 4, energy: 3, loggedAt: "2026-11-20T09:00:00.000Z" };
    const evening = { mood: 7, energy: 6, loggedAt: "2026-11-20T14:00:00.000Z" };
    expect(dayMood([morning, afternoon, evening])).toEqual({
      count: 3,
      avgMood: 6.3,
      avgEnergy: 5.3,
      minMood: 4,
      maxMood: 8,
      lowest: afternoon,
      highest: morning,
    });
  });
});

describe("buildTimeline", () => {
  it("merges every kind of entry, oldest first", () => {
    const timeline = buildTimeline({
      date: "2026-11-20",
      moodLogs: [{ _id: "m1", loggedAt: atTime("2026-11-20", "13:00"), mood: 6, energy: 5, note: "After lunch" }],
      workouts: [
        { _id: "w1", loggedAt: atTime("2026-11-20", "08:15"), type: "Cycling", durationMin: 30, source: "manual" },
        { _id: "w2", loggedAt: atTime("2026-11-20", "18:00"), type: "Running", durationMin: 20, source: "watch" },
      ],
      goodThings: [{ _id: "g1", loggedAt: atTime("2026-11-20", "09:00"), text: "Sunrise ride" }],
      learnings: [{ _id: "l1", loggedAt: atTime("2026-11-20", "21:00"), topic: "Recharts", minutes: 20 }],
      presentMoments: [{ _id: "p1", loggedAt: atTime("2026-11-20", "22:00"), text: "Calm" }],
      healthSnapshots: [{ time: atTime("2026-11-20", "12:00"), steps: 5230, activeCalories: 320 }],
      sleep: { wakeTime: "06:30", totalSleepMin: 434 },
    });

    expect(timeline.map((t) => [t.kind, t.summary])).toEqual([
      ["sleep", "Woke up · slept 7 h 14 min"],
      ["workouts", "Cycling · 30 min"],
      ["goodThings", "Sunrise ride"],
      ["sync", "Synced from Apple Watch · 5,230 steps · 320 active kcal"],
      ["moods", "Mood 6/10 · Energy 5/10 · After lunch"],
      ["workouts", "Running · 20 min · from Apple Watch"],
      ["learnings", "Recharts · 20 min"],
      ["presentMoments", "Calm"],
    ]);
    expect(timeline[1]).toMatchObject({ id: "w1", time: "2026-11-20T02:45:00.000Z" });
    expect(timeline[0]).not.toHaveProperty("id");
  });

  it("is empty for an empty day", () => {
    expect(buildTimeline({ date: "2026-11-20" })).toEqual([]);
  });
});

it("knows the entry kinds", () => {
  expect(isEntryKind("moods")).toBe(true);
  expect(isEntryKind("presentMoments")).toBe(true);
  expect(isEntryKind("daily")).toBe(false);
  expect(isEntryKind("constructor")).toBe(false);
});

describe("water on the timeline", () => {
  it("leaves water off the timeline (it's shown as the day's total instead)", () => {
    const timeline = buildTimeline({
      date: "2026-11-20",
      waterLogs: [
        { _id: "w2", amountMl: 500, loggedAt: "2026-11-20T08:00:00.000Z" },
        { _id: "w1", amountMl: 250, loggedAt: "2026-11-20T04:45:00.000Z" },
      ],
    } as Parameters<typeof buildTimeline>[0]);
    expect(timeline).toEqual([]);
    expect(isEntryKind("water")).toBe(true);
  });
  it("refuses a drink later than now (no future times)", () => {
    expect(() => resolveLoggedAt("2026-11-20", "23:00", new Date("2026-11-20T10:00:00.000Z"), "2026-11-20")).toThrow(LoggedAtError);
  });
});
